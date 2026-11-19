const { PermissionFlagsBits: P, AutoModerationRuleEventType: E, AutoModerationRuleTriggerType: T, AutoModerationActionType: A, AuditLogEvent } = require('discord.js');
const db = require('./db');

const joins = new Map();
const messageWindows = new Map();
const actionCooldown = new Map();
const auditWindows = new Map();
const auditSeen = new Map();
const FEATURE_EVENTS = {
  anti_ban:['MemberBanAdd'], anti_unban:['MemberBanRemove'], anti_kick:['MemberKick'], anti_bot_add:['BotAdd'],
  anti_channel_create:['ChannelCreate'], anti_channel_delete:['ChannelDelete'], anti_channel_update:['ChannelUpdate'],
  anti_role_create:['RoleCreate'], anti_role_delete:['RoleDelete'], anti_role_update:['RoleUpdate'],
  anti_member_update:['MemberUpdate','MemberRoleUpdate'],
  anti_emoji_create:['EmojiCreate','StickerCreate'], anti_emoji_delete:['EmojiDelete','StickerDelete'], anti_emoji_update:['EmojiUpdate','StickerUpdate'],
  anti_integration:['IntegrationCreate','IntegrationUpdate','IntegrationDelete'], anti_guild_update:['GuildUpdate'],
  anti_webhook_create:['WebhookCreate'], anti_webhook_delete:['WebhookDelete'], anti_webhook_update:['WebhookUpdate']
};
const FEATURE_LABELS = {
  anti_ban:'Anti Ban', anti_unban:'Anti Unban', anti_kick:'Anti Kick', anti_bot_add:'Anti Bot Add',
  anti_channel_create:'Anti Channel Create', anti_channel_delete:'Anti Channel Delete', anti_channel_update:'Anti Channel Update',
  anti_role_create:'Anti Role Create', anti_role_delete:'Anti Role Delete', anti_role_update:'Anti Role Update',
  anti_member_update:'Anti Member Update', anti_emoji_create:'Anti Emoji/Sticker Create', anti_emoji_delete:'Anti Emoji/Sticker Delete',
  anti_emoji_update:'Anti Emoji/Sticker Update', anti_everyone_ping:'Anti Everyone/Here Ping', anti_role_ping:'Anti Role Ping',
  anti_integration:'Anti Integration', anti_guild_update:'Anti Guild Update',
  anti_webhook_create:'Anti Webhook Create', anti_webhook_delete:'Anti Webhook Delete', anti_webhook_update:'Anti Webhook Update'
};
const FEATURE_KEYS=Object.keys(FEATURE_LABELS), EVENT_FEATURE=new Map();
for (const [feature,names] of Object.entries(FEATURE_EVENTS)) for (const name of names) {
  const action=AuditLogEvent[name];
  if (action!=null) EVENT_FEATURE.set(action,feature);
}
const NUKE_ACTIONS = new Set([...EVENT_FEATURE.keys(), AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete]);

function state(guild) {
  return db.g(guild.id).config.fortress || null;
}
function antiConfig(guild) {
  const cfg=db.g(guild.id).config;
  cfg.antiNuke ||= { enabled:false, features:{}, whitelist:[], extraOwners:[], threshold:3, windowMs:15000, punishMs:600000 };
  cfg.antiNuke.features ||= {}; cfg.antiNuke.whitelist ||= []; cfg.antiNuke.extraOwners ||= [];
  cfg.antiNuke.punishment ||= 'timeout'; cfg.antiNuke.threshold ||= 3; cfg.antiNuke.windowMs ||= 15000; cfg.antiNuke.punishMs ||= 600000;
  return cfg.antiNuke;
}
function featureEnabled(cfg,key) { return cfg.features[key] !== false; }
async function isExempt(guild,id,cfg) {
  const legacy=state(guild)||{};
  const globalOwners=(process.env.OWNER_IDS||'').split(/[\s,]+/).filter(Boolean);
  if (id===guild.ownerId || globalOwners.includes(String(id)) || (legacy.securityWhitelist||[]).includes(String(id)) || (legacy.securityExtraOwners||[]).includes(String(id)) || (cfg.extraOwners||[]).includes(id) || (cfg.whitelist||[]).includes('user:'+id)) return true;
  const member=await guild.members.fetch(id).catch(()=>null);
  return !!member && member.roles.cache.some(role=>(cfg.whitelist||[]).includes('role:'+role.id));
}
function configureAntiNuke(guild,patch) { const cfg=antiConfig(guild); Object.assign(cfg,patch); db.save(); return cfg; }
function setFeature(guild,key,enabled) {
  if (!FEATURE_LABELS[key]) throw new Error('Unknown protection feature.');
  const cfg=antiConfig(guild); cfg.features[key]=!!enabled; db.save(); return cfg;
}
function addAccess(guild,list,id) {
  const cfg=antiConfig(guild);
  if (!['whitelist','extraOwners'].includes(list) || !/^\d{17,20}$/.test(String(id))) throw new Error('Provide a valid Discord ID.');
  const value=list==='whitelist' ? (guild.roles.cache.has(id)?'role:':'user:')+id : id;
  if (!cfg[list].includes(value)) cfg[list].push(value);
  db.save(); return value;
}
function removeAccess(guild,list,id) {
  const cfg=antiConfig(guild);
  if (!['whitelist','extraOwners'].includes(list)) throw new Error('Invalid access list.');
  const gone=cfg[list].filter(x=>x===id||x==='user:'+id||x==='role:'+id);
  cfg[list]=cfg[list].filter(x=>!gone.includes(x)); db.save(); return gone.length;
}
function status(guild) {
  const cfg=antiConfig(guild);
  return { enabled:cfg.enabled, features:FEATURE_KEYS.map(key=>({key,label:FEATURE_LABELS[key],enabled:featureEnabled(cfg,key)})), whitelist:[...cfg.whitelist], extraOwners:[...cfg.extraOwners] };
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
const PUNISHMENTS = { timeout: 'Timeout', strip: 'Strip dangerous roles', kick: 'Kick', ban: 'Ban' };
const DANGEROUS_PERMS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ManageWebhooks, P.ManageGuildExpressions, P.ModerateMembers].filter(Boolean);
// Punish the actor. Returns a short sentence describing what really happened.
async function punish(guild, member, actorId, anti) {
  const reason = 'Uranium Anti-Nuke: suspicious destructive activity';
  const mode = PUNISHMENTS[anti.punishment] ? anti.punishment : 'timeout';
  const notes = [];
  try {
    if (mode === 'ban') { await guild.members.ban(actorId, { reason }); return 'Actor **banned**.'; }
    if (mode === 'kick' || (mode === 'strip' && member?.user?.bot)) {
      if (!member) return 'Actor already left the server.';
      if (!member.kickable) return 'Actor cannot be kicked (role hierarchy). Owner action needed.';
      await member.kick(reason); return 'Actor **kicked**.';
    }
    if (!member) return 'Actor already left the server.';
    if (mode === 'strip') {
      const risky = member.roles.cache.filter((r) => !r.managed && r.id !== guild.id && DANGEROUS_PERMS.some((perm) => r.permissions.has(perm)));
      const editable = risky.filter((r) => r.editable);
      if (editable.size) { await member.roles.remove([...editable.keys()], reason); notes.push('Removed ' + editable.size + ' dangerous role(s)'); }
      if (risky.size > editable.size) notes.push((risky.size - editable.size) + ' role(s) are above my role and could not be removed');
    }
    if (member.moderatable) { await member.timeout(anti.punishMs, reason); notes.push('Timed out for ' + Math.round(anti.punishMs / 60000) + ' minutes'); }
    else notes.push('Could not time out (role hierarchy or Administrator)');
  } catch (error) { notes.push('Punishment failed: ' + String(error.message || error).slice(0, 120)); }
  return notes.join('. ') + '.';
}
// Alerts go to the mod-log channel, then the system channel, then the owner by DM, so they are never silent.
async function sendAlert(guild, payload, fallbackText) {
  const modlogId = db.g(guild.id).config.modlog;
  const channels = [];
  if (modlogId) channels.push(await guild.channels.fetch(modlogId).catch(() => null));
  channels.push(guild.systemChannel);
  for (const channel of channels) {
    if (!channel?.isTextBased?.()) continue;
    try { await channel.send(payload); return channel; } catch {}
  }
  try {
    const owner = await guild.fetchOwner();
    await owner.send({ content: String(fallbackText).slice(0, 1900), allowedMentions: { parse: [] } });
    return owner;
  } catch { return null; }
}
async function inspectAuditEntry(entry, guild, botId) {
  if(!entry||!NUKE_ACTIONS.has(entry.action)) return false;
  const cfg=state(guild)||{}, anti=antiConfig(guild);
  // Anti-Nuke works on its own. Fortress is only needed for the extra legacy alerts below.
  if(!cfg.enabled && !anti.enabled) return false;
  const actorId=entry.executorId||entry.executor?.id;
  if(!actorId||actorId===guild.ownerId||actorId===botId) return false;
  const feature=EVENT_FEATURE.get(entry.action);
  if(anti.enabled && feature && featureEnabled(anti,feature)) {
    if(await isExempt(guild,actorId,anti)) return false;
    const now=Date.now();
    if(auditSeen.has(entry.id)&&now-auditSeen.get(entry.id)<60000) return false;
    auditSeen.set(entry.id,now);
    if(auditSeen.size>500) for(const [id,at] of auditSeen) if(now-at>60000) auditSeen.delete(id);
    const key=guild.id+':'+actorId;
    const rows=(auditWindows.get(key)||[]).filter(x=>now-x.at<anti.windowMs);
    rows.push({at:now,feature}); auditWindows.set(key,rows);
    if(rows.length<anti.threshold || (anti.lastActor===actorId && now-(anti.lastAt||0)<60000)) return false;
    anti.lastActor=actorId; anti.lastAt=now; db.save();
    const member=await guild.members.fetch(actorId).catch(()=>null);
    const result=await punish(guild,member,actorId,anti);
    const labels=[...new Set(rows.map(x=>FEATURE_LABELS[x.feature]))];
    const text='🚨 **URANIUM ANTI-NUKE**\nActor: <@'+actorId+'>\nActions: **'+rows.length+' within '+Math.round(anti.windowMs/1000)+' seconds**\nFeatures: '+labels.join(', ')+'\n'+result;
    let payload=null;
    try { payload=require('./antinuke-ui').alertPayload({guild,actorId,count:rows.length,windowMs:anti.windowMs,labels,result}); }
    catch(error) { console.error('[anti-nuke alert card]', error.message); }
    await sendAlert(guild,payload||{content:text,allowedMentions:{parse:[]}},text);
    return true;
  }
  if(!cfg.enabled) return false;
  const trusted = new Set([...(cfg.securityWhitelist || []), ...(cfg.securityExtraOwners || []), ...(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean)].map(String));
  if (trusted.has(String(actorId))) return false;
  const now=Date.now(), seenAt=auditSeen.get(entry.id);
  if(seenAt&&now-seenAt<60000)return false;
  auditSeen.set(entry.id,now);
  if(auditSeen.size>500) for(const [id,at] of auditSeen) if(now-at>60000)auditSeen.delete(id);
  const key=guild.id+':'+actorId;
  const recent=(auditWindows.get(key)||[]).filter(item=>now-item.at<15000);
  recent.push({at:now,action:entry.action}); auditWindows.set(key,recent);
  const severe=new Set([AuditLogEvent.ChannelDelete,AuditLogEvent.RoleDelete,AuditLogEvent.MemberBanAdd,AuditLogEvent.MemberKick,AuditLogEvent.WebhookDelete,AuditLogEvent.BotAdd]);
  const severeCount=recent.filter(item=>severe.has(item.action)).length, threshold=severeCount>=2?2:3;
  const sensitiveSingle=new Set([AuditLogEvent.ChannelDelete,AuditLogEvent.RoleDelete,AuditLogEvent.RoleUpdate,AuditLogEvent.MemberRoleUpdate,AuditLogEvent.ChannelUpdate,AuditLogEvent.WebhookCreate,AuditLogEvent.WebhookUpdate,AuditLogEvent.WebhookDelete,AuditLogEvent.BotAdd,AuditLogEvent.ChannelOverwriteCreate,AuditLogEvent.ChannelOverwriteUpdate,AuditLogEvent.ChannelOverwriteDelete]);
  const actionLabel=AuditLogEvent[entry.action]||'Sensitive server change';
  if(sensitiveSingle.has(entry.action)) await log(guild,'⚠️ **FORTRESS SECURITY EVENT:** '+actionLabel+' by <@'+actorId+'>. Review the audit log and confirm this change was authorized.');
  if(recent.length<threshold||(cfg.lastNukeActorId===actorId&&cfg.lastNukeAlertAt&&now-cfg.lastNukeAlertAt<60000)) return sensitiveSingle.has(entry.action);
  cfg.lastNukeActorId=actorId; cfg.lastNukeActionCount=recent.length; db.save();
  const actionNames=recent.map(item=>AuditLogEvent[item.action]||'Destructive action');
  await log(guild,'🚨 **ANTI-NUKE ALERT:** <@'+actorId+'> performed **'+recent.length+' high-impact actions within 15 seconds** ('+[...new Set(actionNames)].join(', ')+'). Uranium has alerted staff but has not mass-banned or automatically stripped roles. Review the audit log and use /security lockdown if needed.');
  return true;
}
async function inspectMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return false;
  const cfg = state(message.guild) || {};
  const anti = antiConfig(message.guild);
  if (!cfg.enabled && !anti.enabled) return false;
  const trusted = new Set([...(cfg.securityWhitelist || []), ...(cfg.securityExtraOwners || []), ...(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean)].map(String));
  if (trusted.has(String(message.author.id))) return false;
  if (anti.enabled && (message.mentions?.everyone || (message.mentions?.roles?.size||0)>0)) {
    const key=message.mentions.everyone?'anti_everyone_ping':'anti_role_ping';
    if (featureEnabled(anti,key) && !(await isExempt(message.guild,message.author.id,anti))) {
      await message.delete().catch(()=>{});
      await log(message.guild,'🚨 **'+FEATURE_LABELS[key]+'** blocked from <@'+message.author.id+'>.');
      return true;
    }
  }
  if (!cfg.enabled) return false;
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
module.exports = { enable, disable, onMemberJoin, inspectAuditEntry, inspectMessage, antiConfig, configureAntiNuke, setFeature, addAccess, removeAccess, status, punish, sendAlert, PUNISHMENTS, FEATURE_LABELS, FEATURE_KEYS };
