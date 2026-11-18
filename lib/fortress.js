const { PermissionFlagsBits: P, AutoModerationRuleEventType: E, AutoModerationRuleTriggerType: T, AutoModerationActionType: A, AuditLogEvent } = require('discord.js');
const db = require('./db');

const joins = new Map();
const messageWindows = new Map();
const actionCooldown = new Map();
const auditWindows = new Map();
const auditSeen = new Map();
const FEATURE_EVENTS = { anti_ban:['MemberBanAdd'],anti_unban:['MemberBanRemove'],anti_kick:['MemberKick'],anti_bot_add:['BotAdd'],anti_channel_create:['ChannelCreate'],anti_channel_delete:['ChannelDelete'],anti_channel_update:['ChannelUpdate'],anti_role_create:['RoleCreate'],anti_role_delete:['RoleDelete'],anti_role_update:['RoleUpdate'],anti_member_update:['MemberUpdate','MemberRoleUpdate'],anti_emoji_create:['EmojiCreate','StickerCreate'],anti_emoji_delete:['EmojiDelete','StickerDelete'],anti_emoji_update:['EmojiUpdate','StickerUpdate'],anti_integration:['IntegrationCreate','IntegrationUpdate','IntegrationDelete'],anti_guild_update:['GuildUpdate'],anti_webhook_create:['WebhookCreate'],anti_webhook_delete:['WebhookDelete'],anti_webhook_update:['WebhookUpdate'] };
const FEATURE_LABELS = { anti_ban:'Anti Ban',anti_unban:'Anti Unban',anti_kick:'Anti Kick',anti_bot_add:'Anti Bot Add',anti_channel_create:'Anti Channel Create',anti_channel_delete:'Anti Channel Delete',anti_channel_update:'Anti Channel Update',anti_role_create:'Anti Role Create',anti_role_delete:'Anti Role Delete',anti_role_update:'Anti Role Update',anti_member_update:'Anti Member Update',anti_emoji_create:'Anti Emoji/Sticker Create',anti_emoji_delete:'Anti Emoji/Sticker Delete',anti_emoji_update:'Anti Emoji/Sticker Update',anti_everyone_ping:'Anti Everyone/Here Ping',anti_role_ping:'Anti Role Ping',anti_integration:'Anti Integration',anti_guild_update:'Anti Guild Update',anti_webhook_create:'Anti Webhook Create',anti_webhook_delete:'Anti Webhook Delete',anti_webhook_update:'Anti Webhook Update' };
const FEATURE_KEYS=Object.keys(FEATURE_LABELS), EVENT_FEATURE=new Map();
for(const [feature,names] of Object.entries(FEATURE_EVENTS))for(const name of names){const action=AuditLogEvent[name];if(action!=null)EVENT_FEATURE.set(action,feature);}
const NUKE_ACTIONS=new Set(EVENT_FEATURE.keys());

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

function antiConfig(guild){const cfg=db.g(guild.id).config;cfg.antiNuke||={enabled:false,features:{},whitelist:[],extraOwners:[],threshold:3,windowMs:15000,punishMs:600000};return cfg.antiNuke;}
function featureEnabled(cfg,key){return cfg.features[key]!==false;}
async function isExempt(guild,id,cfg){if(id===guild.ownerId||(cfg.extraOwners||[]).includes(id)||(cfg.whitelist||[]).includes('user:'+id))return true;const member=await guild.members.fetch(id).catch(()=>null);return !!member&&member.roles.cache.some(role=>(cfg.whitelist||[]).includes('role:'+role.id));}
function configureAntiNuke(guild,patch){const cfg=antiConfig(guild);Object.assign(cfg,patch);db.save();return cfg;}
function setFeature(guild,key,enabled){if(!FEATURE_LABELS[key])throw new Error('Unknown protection feature.');const cfg=antiConfig(guild);cfg.features[key]=!!enabled;db.save();return cfg;}
function addAccess(guild,list,id){const cfg=antiConfig(guild);if(!/^\d{17,20}$/.test(String(id)))throw new Error('Provide a valid Discord ID.');const value=list==='whitelist'?(guild.roles.cache.has(id)?'role:':'user:')+id:id;if(!cfg[list].includes(value))cfg[list].push(value);db.save();return value;}
function removeAccess(guild,list,id){const cfg=antiConfig(guild);const gone=cfg[list].filter(x=>x===id||x==='user:'+id||x==='role:'+id);cfg[list]=cfg[list].filter(x=>!gone.includes(x));db.save();return gone.length;}
function status(guild){const cfg=antiConfig(guild);return {enabled:cfg.enabled,features:FEATURE_KEYS.map(key=>({key,label:FEATURE_LABELS[key],enabled:featureEnabled(cfg,key)})),whitelist:[...cfg.whitelist],extraOwners:[...cfg.extraOwners]};}


async function inspectAuditEntry(entry,guild,botId){
 const base=state(guild),cfg=antiConfig(guild);if(!base?.enabled||!cfg.enabled||!entry||!NUKE_ACTIONS.has(entry.action))return false;
 const feature=EVENT_FEATURE.get(entry.action);if(!feature||!featureEnabled(cfg,feature))return false;
 const actorId=entry.executorId||entry.executor?.id;if(!actorId||actorId===botId||await isExempt(guild,actorId,cfg))return false;
 const now=Date.now();if(auditSeen.has(entry.id)&&now-auditSeen.get(entry.id)<60000)return false;auditSeen.set(entry.id,now);
 const key=guild.id+':'+actorId,rows=(auditWindows.get(key)||[]).filter(x=>now-x.at<cfg.windowMs);rows.push({at:now,feature});auditWindows.set(key,rows);
 if(rows.length<cfg.threshold||(cfg.lastActor===actorId&&now-(cfg.lastAt||0)<60000))return false;
 cfg.lastActor=actorId;cfg.lastAt=now;db.save();
 const member=await guild.members.fetch(actorId).catch(()=>null);let result='No automatic punishment possible; owner intervention required.';
 if(member?.moderatable){try{await member.timeout(cfg.punishMs,'Uranium Anti-Nuke: suspicious destructive activity');result='Actor automatically timed out for '+Math.round(cfg.punishMs/60000)+' minutes.';}catch(e){result='Timeout failed: '+String(e.message||e).slice(0,150);}}
 else if(member)result='Actor cannot be timed out due to role hierarchy or permissions.';
 const labels=[...new Set(rows.map(x=>FEATURE_LABELS[x.feature]))];
 await log(guild,'🚨 **URANIUM ANTI-NUKE ENFORCEMENT**\\nActor: <@'+actorId+'>\\nActions: **'+rows.length+' within '+Math.round(cfg.windowMs/1000)+' seconds**\\nFeatures: '+labels.join(', ')+'\\n'+result+'\\nNo automatic ban or role stripping was attempted.');
 return true;
}

async function inspectMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return false;
  const cfg = state(message.guild);
  if (!cfg?.enabled) return false;
  const anti=antiConfig(message.guild);
 if(anti.enabled&&(message.mentions.everyone||message.mentions.roles.size)){const key=message.mentions.everyone?'anti_everyone_ping':'anti_role_ping';if(featureEnabled(anti,key)&&!(await isExempt(message.guild,message.author.id,anti))){await message.delete().catch(()=>{});await log(message.guild,'🚨 **'+FEATURE_LABELS[key]+'** blocked from <@'+message.author.id+'>.');return true;}}
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
module.exports = { enable, disable, onMemberJoin, inspectAuditEntry, inspectMessage, antiConfig, configureAntiNuke, setFeature, addAccess, removeAccess, status, FEATURE_LABELS, FEATURE_KEYS };
