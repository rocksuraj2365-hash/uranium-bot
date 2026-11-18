const { PermissionFlagsBits: P, AutoModerationRuleEventType: E, AutoModerationRuleTriggerType: T, AutoModerationActionType: A, AuditLogEvent } = require('discord.js');
const db = require('./db');

const joins = new Map();
const messageWindows = new Map();
const actionCooldown = new Map();
const auditWindows = new Map();
const auditSeen = new Map();
const NUKE_ACTIONS = new Set([AuditLogEvent.ChannelDelete, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberRoleUpdate, AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete, AuditLogEvent.GuildUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete]);

function state(guild) {
  return db.g(guild.id).config.fortress || null;
}
async function log(guild, text) {
  try {
    const id = db.g(guild.id).config.modlog;
    const channel = id ? await guild.channels.fetch(id).catch(() => null) : null;
    if (channel?.isTextBased()) await channel.send({ content: text, allowedMentions: { parse: [] } });
  } catch {}
}
async function enable(guild, actorId) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(P.ManageGuild) || !me.permissions.has(P.ModerateMembers)) {
    throw new Error('Uranium needs Manage Server and Moderate Members permissions to enable Fortress.');
  }
  const old = state(guild);
  if (old?.enabled) return { message: 'Fortress is already active. Use `!fortress status` to review it.' };
  const rules = await guild.autoModerationRules.fetch();
  const created = [];
  try {
    let spam = [...rules.values()].find(r => r.triggerType === T.Spam);
    const previousRuleStates = {};
    if (!spam) {
      spam = await guild.autoModerationRules.create({
        name: 'Uranium Fortress • Spam',
        eventType: E.MessageSend,
        triggerType: T.Spam,
        actions: [{ type: A.BlockMessage, metadata: { customMessage: 'Uranium Fortress blocked a spam message.' } }],
        enabled: true,
        reason: 'Uranium Fortress enabled by server manager'
      });
      created.push(spam.id);
    } else {
      previousRuleStates[spam.id] = spam.enabled;
      if (!spam.enabled) await spam.setEnabled(true, 'Uranium Fortress enabled');
    }
    let mentions = [...rules.values()].find(r => r.triggerType === T.MentionSpam);
    if (!mentions) {
      mentions = await guild.autoModerationRules.create({
        name: 'Uranium Fortress • Mention Flood',
        eventType: E.MessageSend,
        triggerType: T.MentionSpam,
        triggerMetadata: { mentionTotalLimit: 8 },
        actions: [
          { type: A.BlockMessage, metadata: { customMessage: 'Uranium Fortress blocked a mention flood.' } },
          { type: A.Timeout, metadata: { durationSeconds: 120 } }
        ],
        enabled: true,
        reason: 'Uranium Fortress enabled by server manager'
      });
      created.push(mentions.id);
    } else {
      previousRuleStates[mentions.id] = mentions.enabled;
      if (!mentions.enabled) await mentions.setEnabled(true, 'Uranium Fortress enabled');
    }
    const previousVerificationLevel = guild.verificationLevel;
    const config = db.g(guild.id).config;
    config.fortress = {
      enabled: true,
      enabledAt: Date.now(),
      enabledBy: actorId,
      previousVerificationLevel,
      autoRaisedVerification: false,
      ruleIds: [spam.id, mentions.id],
      createdRuleIds: created,
      previousRuleStates
    };
    db.save();
    await log(guild, '🛡️ **Uranium Fortress enabled.** Join-burst monitoring, spam detection and Discord AutoMod safeguards are active.');
    return { message: '🛡️ **Fortress is now active.** Discord AutoMod spam and mention-flood rules are enabled. Uranium will monitor join bursts and rapid message floods. Suspicious join bursts trigger stricter verification, not mass-bans. Spam sanctions are limited to message removal and a short timeout, with DM notice attempts.' };
  } catch (error) {
    for (const [id, wasEnabled] of Object.entries(previousRuleStates)) {
      const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
      if (rule) await rule.setEnabled(wasEnabled, 'Restore AutoMod state after failed Fortress setup').catch(() => {});
    }
    for (const id of created) {
      const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
      if (rule) await rule.delete('Rollback incomplete Fortress setup').catch(() => {});
    }
    throw error;
  }
}
async function disable(guild) {
  const config = db.g(guild.id).config;
  const current = config.fortress;
  if (!current?.enabled) return;
  const createdIds = new Set(current.createdRuleIds || current.ruleIds || []);
  for (const id of current.ruleIds || []) {
    const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
    if (!rule) continue;
    if (createdIds.has(id)) await rule.setEnabled(false, 'Uranium Fortress disabled').catch(() => {});
    else if (Object.prototype.hasOwnProperty.call(current.previousRuleStates || {}, id)) {
      await rule.setEnabled(!!current.previousRuleStates[id], 'Restore AutoMod state after Fortress').catch(() => {});
    }
  }
  if (current.autoRaisedVerification && guild.verificationLevel === 4) {
    await guild.setVerificationLevel(current.previousVerificationLevel, 'Restore verification level after Fortress').catch(() => {});
  }
  config.fortress = { enabled: false, disabledAt: Date.now(), ruleIds: current.ruleIds || [] };
  db.save();
  await log(guild, '🔓 **Uranium Fortress disabled** by a server manager. Rules created by Fortress were switched off and reused rules were restored.');
}
async function onMemberJoin(member) {
  const cfg = state(member.guild);
  if (!cfg?.enabled) return;
  const now = Date.now();
  const recent = (joins.get(member.guild.id) || []).filter(item => now - item.at < 30000);
  recent.push({ at:now, createdAt:member.user.createdTimestamp || 0 });
  joins.set(member.guild.id, recent);
  const rapidCount = recent.filter(item => now - item.at < 10000).length;
  const youngCount = recent.filter(item => item.createdAt && now - item.createdAt < 7 * 86400000).length;
  const burst = rapidCount >= 8;
  const youngBurst = youngCount >= 4;
  if ((!burst && !youngBurst) || cfg.autoRaisedVerification) return;
  try {
    await member.guild.setVerificationLevel(4, 'Uranium Fortress detected suspicious join activity');
    cfg.autoRaisedVerification = true;
    cfg.raidDetectedAt = now;
    db.save();
    const reason = burst ? rapidCount + ' accounts joined within 10 seconds' : youngCount + ' recently created accounts joined within 30 seconds';
    await log(member.guild, '🚨 **Possible join raid detected:** ' + reason + '. Verification was raised to Very High. No members were mass-banned.');
  } catch (error) {
    await log(member.guild, '⚠️ Fortress detected suspicious join activity but could not raise verification. Check Uranium permissions.');
  }
}
async function inspectAuditEntry(entry, guild, botId) {
  const cfg = state(guild);
  if (!cfg?.enabled || !entry || !NUKE_ACTIONS.has(entry.action)) return false;
  const actorId = entry.executorId || entry.executor?.id;
  if (!actorId || actorId === guild.ownerId || actorId === botId) return false;
  const now = Date.now();
  const seenAt = auditSeen.get(entry.id);
  if (seenAt && now - seenAt < 60000) return false;
  auditSeen.set(entry.id, now);
  if (auditSeen.size > 500) {
    for (const [id, at] of auditSeen) if (now - at > 60000) auditSeen.delete(id);
  }
  const key = guild.id + ':' + actorId;
  const recent = (auditWindows.get(key) || []).filter(item => now - item.at < 15000);
  recent.push({ at:now, action:entry.action });
  auditWindows.set(key, recent);
  if (recent.length < 3 || (cfg.lastNukeAlertAt && now - cfg.lastNukeAlertAt < 60000)) return false;
  cfg.lastNukeAlertAt = now;
  cfg.lastNukeActorId = actorId;
  cfg.lastNukeActionCount = recent.length;
  db.save();
  const actionNames = recent.map(item => AuditLogEvent[item.action] || 'Destructive action');
  await log(guild, '🚨 **ANTI-NUKE ALERT:** <@' + actorId + '> performed **' + recent.length + ' high-impact actions within 15 seconds** (' + [...new Set(actionNames)].join(', ') + '). Uranium has alerted staff but has not mass-banned or automatically stripped roles. Review the audit log and use /security lockdown if needed.');
  return true;
}

async function inspectMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return false;
  const cfg = state(message.guild);
  if (!cfg?.enabled) return false;
  if (message.member.permissions.has(P.ManageMessages) || message.member.permissions.has(P.ManageGuild)) return false;
  const now = Date.now();
  const key = message.guild.id + ':' + message.author.id;
  const rows = (messageWindows.get(key) || []).filter(x => now - x.at < 8000);
  const normalized = String(message.content || '').trim().toLowerCase().replace(/\s+/g, ' ');
  rows.push({ at: now, content: normalized });
  messageWindows.set(key, rows);
  const identical = normalized ? rows.filter(x => x.content === normalized).length : 0;
  if (rows.length < 9 && identical < 4) return false;
  if ((actionCooldown.get(key) || 0) > now) return true;
  actionCooldown.set(key, now + 60000);
  try {
    await message.delete().catch(() => {});
    if (message.member.moderatable) await message.member.timeout(120000, 'Uranium Fortress: rapid spam detected');
    await message.author.send('A message in **' + message.guild.name + '** was removed because Uranium Fortress detected rapid spam. A short timeout may have been applied. Contact the server moderators if you think this was a mistake.').catch(() => {});
    await log(message.guild, '🛡️ Fortress action: removed rapid spam from <@' + message.author.id + '> and attempted a 2-minute timeout. DM notice attempted.');
  } catch (error) {
    console.error('[fortress sanction]', error.message);
  }
  return true;
}
module.exports = { enable, disable, onMemberJoin, inspectAuditEntry, inspectMessage };
