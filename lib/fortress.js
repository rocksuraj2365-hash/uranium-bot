const { PermissionFlagsBits: P, AutoModerationRuleEventType: E, AutoModerationRuleTriggerType: T, AutoModerationActionType: A } = require('discord.js');
const db = require('./db');

const joins = new Map();
const messageWindows = new Map();
const actionCooldown = new Map();

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
  const rules = await guild.autoModerationRules.fetch().catch(() => new Map());
  const created = [];
  try {
    let spam = [...rules.values()].find(r => r.name === 'Uranium Fortress • Spam');
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
    } else if (!spam.enabled) await spam.setEnabled(true, 'Uranium Fortress enabled');
    let mentions = [...rules.values()].find(r => r.name === 'Uranium Fortress • Mention Flood');
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
    } else if (!mentions.enabled) await mentions.setEnabled(true, 'Uranium Fortress enabled');
    const previousVerificationLevel = guild.verificationLevel;
    const config = db.g(guild.id).config;
    config.fortress = {
      enabled: true,
      enabledAt: Date.now(),
      enabledBy: actorId,
      previousVerificationLevel,
      autoRaisedVerification: false,
      ruleIds: [spam.id, mentions.id]
    };
    db.save();
    await log(guild, '🛡️ **Uranium Fortress enabled.** Join-burst monitoring, spam detection and Discord AutoMod safeguards are active.');
    return { message: '🛡️ **Fortress is now active.** Discord AutoMod spam and mention-flood rules are enabled. Uranium will monitor join bursts and rapid message floods. Suspicious join bursts trigger stricter verification, not mass-bans. Spam sanctions are limited to message removal and a short timeout, with DM notice attempts.' };
  } catch (error) {
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
  for (const id of current.ruleIds || []) {
    const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
    if (rule) await rule.setEnabled(false, 'Uranium Fortress disabled').catch(() => {});
  }
  if (current.autoRaisedVerification && guild.verificationLevel === 4) {
    await guild.setVerificationLevel(current.previousVerificationLevel, 'Restore verification level after Fortress').catch(() => {});
  }
  config.fortress = { enabled: false, disabledAt: Date.now(), ruleIds: current.ruleIds || [] };
  db.save();
  await log(guild, '🔓 **Uranium Fortress disabled** by a server manager. AutoMod rules were switched off.');
}
async function onMemberJoin(member) {
  const cfg = state(member.guild);
  if (!cfg?.enabled) return;
  const now = Date.now();
  const recent = (joins.get(member.guild.id) || []).filter(t => now - t < 10000);
  recent.push(now);
  joins.set(member.guild.id, recent);
  if (recent.length < 8 || cfg.autoRaisedVerification) return;
  try {
    await member.guild.setVerificationLevel(4, 'Uranium Fortress detected a rapid join burst');
    cfg.autoRaisedVerification = true;
    cfg.raidDetectedAt = now;
    db.save();
    await log(member.guild, '🚨 **Possible join raid detected:** ' + recent.length + ' accounts joined within 10 seconds. Verification was raised to Very High. No members were mass-banned.');
  } catch (error) {
    await log(member.guild, '⚠️ Fortress detected a join burst but could not raise verification. Check Uranium permissions.');
  }
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
module.exports = { enable, disable, onMemberJoin, inspectMessage };
