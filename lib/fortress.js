const { PermissionFlagsBits: P, AutoModerationRuleEventType: E, AutoModerationRuleTriggerType: T, AutoModerationActionType: A, AuditLogEvent } = require('discord.js');
const db = require('./db');

const joins = new Map();
const messageWindows = new Map();
const actionCooldown = new Map();
const auditWindows = new Map();
const auditSeen = new Map();
const NUKE_ACTIONS = new Set([AuditLogEvent.ChannelDelete, AuditLogEvent.ChannelUpdate, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberKick, AuditLogEvent.MemberRoleUpdate, AuditLogEvent.BotAdd, AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete, AuditLogEvent.GuildUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete]);

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
  if (old?.enabled) {
    if (!me.permissions.has(P.ManageRoles)) {
      throw new Error('Fortress is active, but Uranium needs Manage Roles to repair its UraniumX identity.');
    }
    let role = old.fortressRoleId ? await guild.roles.fetch(old.fortressRoleId).catch(() => null) : null;
    if (!role) {
      role = await guild.roles.create({
        name: 'UraniumX',
        color: 0x8B0000,
        hoist: true,
        mentionable: false,
        permissions: [],
        reason: 'Repair missing Uranium Fortress identity'
      });
      old.fortressRoleId = role.id;
      db.save();
    }
    let avatarNote = old.avatarChanged ? 'The MAX server avatar is already active.' : 'The server avatar remains unchanged because FORTRESS_MAX_AVATAR_URL is not configured.';
    const maxAvatarUrl = process.env.FORTRESS_MAX_AVATAR_URL;
    if (!old.avatarChanged && maxAvatarUrl) {
      try {
        const meMember = guild.members.me || await guild.members.fetchMe();
        if (old.previousGuildAvatar === undefined) {
          old.previousGuildAvatar = meMember.avatar
            ? await fetch(meMember.displayAvatarURL({ extension: 'png', size: 256 })).then(async (r) => {
                if (!r.ok) throw new Error('Could not preserve Uranium’s current server avatar.');
                const bytes = Buffer.from(await r.arrayBuffer());
                if (bytes.length > 2 * 1024 * 1024) throw new Error('Current server avatar is too large to preserve safely.');
                return 'data:image/png;base64,' + bytes.toString('base64');
              })
            : null;
        }
        const url = new URL(maxAvatarUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('FORTRESS_MAX_AVATAR_URL must be a public HTTPS image URL.');
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
        const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
        if (!response.ok || !/^image\/(png|jpeg|jpg|webp)$/.test(type)) throw new Error('FORTRESS_MAX_AVATAR_URL must point to a public PNG, JPG or WEBP image.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Fortress MAX avatar must be 8 MB or smaller.');
        await guild.members.editMe({ avatar: 'data:' + (type === 'image/jpg' ? 'image/jpeg' : type) + ';base64,' + bytes.toString('base64'), reason: 'Repair Uranium Fortress MAX server profile' });
        old.avatarChanged = true;
        avatarNote = 'The MAX server avatar is now active.';
      } catch (error) {
        avatarNote = 'The UraniumX role was repaired, but the MAX avatar could not be applied: ' + String(error.message || error).slice(0, 180);
      }
    }
    old.identityReconciledAt = Date.now();
    db.save();
    return {
      message: '🛡️ **Fortress is already active.** Missing identity setup has been checked. UraniumX role: <@&' + role.id + '>. ' + avatarNote
    };
  }
  if (!me.permissions.has(P.ManageRoles) || !me.permissions.has(P.ManageGuild)) {
    throw new Error('Uranium also needs Manage Roles and Manage Server to create the UraniumX role and update its server profile.');
  }
  const rules = await guild.autoModerationRules.fetch();
  const created = [];
  let fortressRole = null;
  let previousGuildAvatar = null;
  let avatarChanged = false;
  const previousRuleStates = {};
  try {
    const meMember = guild.members.me || await guild.members.fetchMe();
    previousGuildAvatar = meMember.avatar
      ? await fetch(meMember.displayAvatarURL({ extension: 'png', size: 256 })).then(async (r) => {
          if (!r.ok) throw new Error('Could not preserve Uranium’s current server avatar.');
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length > 2 * 1024 * 1024) throw new Error('Current server avatar is too large to preserve safely.');
          return 'data:image/png;base64,' + bytes.toString('base64');
        })
      : null;
    fortressRole = await guild.roles.create({
      name: 'UraniumX',
      color: 0x8B0000,
      hoist: true,
      mentionable: false,
      permissions: [],
      reason: 'Uranium Fortress enabled by server manager'
    });
    let spam = [...rules.values()].find(r => r.triggerType === T.Spam);
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
    const maxAvatarUrl = process.env.FORTRESS_MAX_AVATAR_URL;
    if (maxAvatarUrl) {
      const url = new URL(maxAvatarUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('FORTRESS_MAX_AVATAR_URL must be a public HTTPS image URL.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!response.ok || !/^image\/(png|jpeg|jpg|webp)$/.test(type)) throw new Error('FORTRESS_MAX_AVATAR_URL must point to a public PNG, JPG or WEBP image.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Fortress MAX avatar must be 8 MB or smaller.');
      await guild.members.editMe({ avatar: 'data:' + (type === 'image/jpg' ? 'image/jpeg' : type) + ';base64,' + bytes.toString('base64'), reason: 'Uranium Fortress MAX server profile' });
      avatarChanged = true;
    }
    config.fortress = {
      enabled: true,
      enabledAt: Date.now(),
      enabledBy: actorId,
      previousVerificationLevel,
      fortressRoleId: fortressRole.id,
      previousGuildAvatar,
      avatarChanged,
      autoRaisedVerification: false,
      ruleIds: [spam.id, mentions.id],
      createdRuleIds: created,
      previousRuleStates
    };
    db.save();
    await log(guild, '🛡️ **Uranium Fortress enabled.** Join-burst monitoring, spam detection and Discord AutoMod safeguards are active.');
    return { message: '🛡️ **Fortress is now active.** The dark-red **UraniumX** role was created for this server. ' + (avatarChanged ? 'The MAX red server-specific avatar is active.' : 'The server avatar was left unchanged because FORTRESS_MAX_AVATAR_URL is not configured.') + ' Discord AutoMod spam and mention-flood rules are enabled. Uranium will monitor join bursts and rapid message floods. Suspicious join bursts trigger stricter verification, not mass-bans. Spam sanctions are limited to message removal and a short timeout, with DM notice attempts.' };
  } catch (error) {
    for (const [id, wasEnabled] of Object.entries(previousRuleStates)) {
      const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
      if (rule) await rule.setEnabled(wasEnabled, 'Restore AutoMod state after failed Fortress setup').catch(() => {});
    }
    for (const id of created) {
      const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
      if (rule) await rule.delete('Rollback incomplete Fortress setup').catch(() => {});
    }
    if (avatarChanged) await guild.members.editMe({ avatar: previousGuildAvatar }, 'Restore server avatar after failed Fortress setup').catch(() => {});
    if (fortressRole) await fortressRole.delete('Rollback incomplete Fortress setup').catch(() => {});
    throw error;
  }
}
async function disable(guild) {
  const config = db.g(guild.id).config;
  const current = config.fortress;
  if (!current?.enabled) return;
  const createdIds = new Set(current.createdRuleIds || current.ruleIds || []);
  if (current.avatarChanged) {
    await guild.members.editMe({ avatar: current.previousGuildAvatar || null }, 'Restore server-specific avatar after Fortress').catch(() => {});
  }
  if (current.fortressRoleId) {
    const role = await guild.roles.fetch(current.fortressRoleId).catch(() => null);
    if (role && role.name === 'UraniumX' && role.permissions.bitfield === 0n && role.members.size === 0) {
      await role.delete('Remove unused UraniumX role after Fortress').catch(() => {});
    }
  }
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
  const trusted = new Set([...(cfg.securityWhitelist || []), ...(cfg.securityExtraOwners || []), ...(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean)].map(String));
  if (trusted.has(String(member.id))) return;
  if (member.user.bot) {
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    const entry = logs?.entries?.find(item => String(item.target?.id || item.targetId) === String(member.id) && Date.now() - item.createdTimestamp < 30000);
    const actorId = entry?.executorId || entry?.executor?.id;
    const actorTrusted = actorId && (actorId === member.guild.ownerId || trusted.has(String(actorId)));
    if (entry && !actorTrusted) await inspectAuditEntry(entry, member.guild, member.client?.user?.id);
    if (!actorTrusted) await log(member.guild, '🤖 **ANTI-BOT-ADD:** A new bot account <@' + member.id + '> joined, added by ' + (actorId ? '<@' + actorId + '>' : 'an unknown actor') + '. Review its requested permissions. Uranium does not automatically kick bots.');
    return;
  }
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
  const trusted = new Set([...(cfg.securityWhitelist || []), ...(cfg.securityExtraOwners || []), ...(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean)].map(String));
  if (trusted.has(String(actorId))) return false;
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
  const severe = new Set([AuditLogEvent.ChannelDelete, AuditLogEvent.RoleDelete, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberKick, AuditLogEvent.WebhookDelete, AuditLogEvent.BotAdd]);
  const severeCount = recent.filter(item => severe.has(item.action)).length;
  const threshold = severeCount >= 2 ? 2 : 3;
  const sensitiveSingle = new Set([AuditLogEvent.ChannelDelete, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.MemberRoleUpdate, AuditLogEvent.ChannelUpdate, AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete, AuditLogEvent.BotAdd, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete]);
  const actionLabel = AuditLogEvent[entry.action] || 'Sensitive server change';
  if (sensitiveSingle.has(entry.action)) {
    await log(guild, '⚠️ **FORTRESS SECURITY EVENT:** ' + actionLabel + ' by <@' + actorId + '>. Review the audit log and confirm this change was authorized.');
  }
  if (recent.length < threshold || (cfg.lastNukeActorId === actorId && cfg.lastNukeAlertAt && now - cfg.lastNukeAlertAt < 60000)) return sensitiveSingle.has(entry.action);
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
  const trusted = new Set([...(cfg.securityWhitelist || []), ...(cfg.securityExtraOwners || []), ...(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean)].map(String));
  if (trusted.has(String(message.author.id))) return false;
  if (message.member.permissions.has(P.ManageMessages) || message.member.permissions.has(P.ManageGuild)) return false;
  const content = String(message.content || '');
  const links = content.match(/https?:\/\/[^\s<>]+/gi) || [];
  const blocked = new Set((db.g(message.guild.id).config.securityBlockedDomains || []).map(x => String(x).toLowerCase()));
  const suspicious = links.find(raw => {
    try {
      const url = new URL(raw.replace(/[),.!?]+$/, ''));
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const parts = host.split('.');
      const isBlocked = [...blocked].some(domain => host === domain || host.endsWith('.' + domain));
      const impersonation = /(discord|steam|nitro|gift|airdrop)/i.test(host) && !/(^|\.)((discord\.com)|(discordapp\.com)|(steamcommunity\.com)|(steampowered\.com))$/i.test(host);
      const rawIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
      return isBlocked || host.includes('xn--') || rawIp || impersonation || parts.length < 2;
    } catch { return true; }
  });
  const mentionCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0) + (/@everyone|@here/i.test(content) ? 8 : 0);
  if (suspicious || mentionCount >= 12) {
    try {
      await message.delete().catch(() => {});
      const reason = suspicious ? 'suspicious or blocked link pattern' : 'mass mention flood';
      await log(message.guild, '🚨 **ANTI-' + (suspicious ? 'PHISHING' : 'MASS-MENTION') + ' ALERT:** Removed a message from <@' + message.author.id + '> for ' + reason + '. Review the message and member before taking further action.');
    } catch (error) { console.error('[fortress content protection]', error.message); }
    return true;
  }
  const now = Date.now();
  const key = message.guild.id + ':' + message.author.id;
  const rows = (messageWindows.get(key) || []).filter(x => now - x.at < 8000);
  const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
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
