const { AttachmentBuilder, ChannelType } = require('discord.js');
const db = require('./db');
const MAX_SNAPSHOTS = 5, MAX_ARCHIVE_MESSAGES = 1000, ARCHIVE_RETENTION_MS = 7 * 86400000, SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;
let snapshotTimer = null, archiveSaveTimer = null;
function config(guild) {
  const cfg = db.g(guild.id).config;
  cfg.serverBackup ||= { enabled: false, autoRestore: true, snapshots: [], chat: { enabled: false, messages: [] } };
  cfg.serverBackup.snapshots ||= []; cfg.serverBackup.chat ||= { enabled: false, messages: [] }; cfg.serverBackup.chat.messages ||= [];
  return cfg.serverBackup;
}
function serializeRole(r) { return { id:r.id, name:r.name, color:r.color, hoist:r.hoist, mentionable:r.mentionable, permissions:r.permissions.bitfield.toString(), position:r.position, unicodeEmoji:r.unicodeEmoji||null }; }
function serializeChannel(ch) {
  return { id:ch.id, name:ch.name, type:ch.type, parentId:ch.parentId||null, position:ch.rawPosition||0, topic:ch.topic||null, nsfw:!!ch.nsfw, rateLimitPerUser:ch.rateLimitPerUser||0, bitrate:ch.bitrate||null, userLimit:ch.userLimit||0, rtcRegion:ch.rtcRegion||null,
    permissionOverwrites:ch.permissionOverwrites?.cache?.map(x=>({id:x.id,type:x.type,allow:x.allow.bitfield.toString(),deny:x.deny.bitfield.toString()}))||[] };
}
async function createSnapshot(guild, reason='manual') {
  await Promise.all([guild.roles.fetch().catch(()=>null),guild.channels.fetch().catch(()=>null)]);
  const b=config(guild), snapshot={id:Date.now().toString(36),at:Date.now(),reason,
    guild:{name:guild.name,verificationLevel:guild.verificationLevel,defaultMessageNotifications:guild.defaultMessageNotifications,explicitContentFilter:guild.explicitContentFilter,afkTimeout:guild.afkTimeout,systemChannelId:guild.systemChannelId||null,rulesChannelId:guild.rulesChannelId||null,publicUpdatesChannelId:guild.publicUpdatesChannelId||null},
    roles:[...guild.roles.cache.values()].filter(r=>r.id!==guild.id&&!r.managed).map(serializeRole),
    channels:[...guild.channels.cache.values()].filter(ch=>!ch.isThread?.()).map(serializeChannel)};
  b.snapshots.unshift(snapshot); b.snapshots=b.snapshots.slice(0,MAX_SNAPSHOTS); b.lastSnapshotAt=snapshot.at; db.save(); return snapshot;
}
function snapshotStatus(guild) { const b=config(guild),s=b.snapshots[0]; return {enabled:b.enabled,autoRestore:b.enabled&&b.autoRestore!==false,snapshots:b.snapshots.length,lastSnapshotAt:s?.at||null,roles:s?.roles.length||0,channels:s?.channels.length||0,chatEnabled:b.chat.enabled===true,archivedMessages:b.chat.messages.length}; }
async function restoreRole(guild,saved) {
  const old=guild.roles.cache.find(r=>r.name===saved.name&&!r.managed); if(old)return old;
  const role=await guild.roles.create({name:saved.name.slice(0,100),color:saved.color,hoist:saved.hoist,mentionable:saved.mentionable,permissions:BigInt(saved.permissions||'0'),reason:'Uranium server backup recovery'});
  if(saved.position>0) await role.setPosition(saved.position).catch(()=>{}); return role;
}
function channelOptions(saved,roleMap,guild) {
  const overwrites=(saved.permissionOverwrites||[]).map(o=>{const id=o.type===0?(roleMap.get(o.id)||(guild.roles.cache.has(o.id)?o.id:null)):(guild.members.cache.has(o.id)?o.id:null);return id?{id,type:o.type,allow:BigInt(o.allow||'0'),deny:BigInt(o.deny||'0')}:null;}).filter(Boolean);
  const allowed=new Set([ChannelType.GuildCategory,ChannelType.GuildText,ChannelType.GuildVoice,ChannelType.GuildAnnouncement,ChannelType.GuildStageVoice,ChannelType.GuildForum]);
  if(!allowed.has(saved.type))return null;
  return {name:saved.name.slice(0,100),type:saved.type,topic:[ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(saved.type)?saved.topic:undefined,nsfw:[ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildForum].includes(saved.type)?saved.nsfw:undefined,rateLimitPerUser:[ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildForum].includes(saved.type)?saved.rateLimitPerUser:undefined,bitrate:[ChannelType.GuildVoice,ChannelType.GuildStageVoice].includes(saved.type)?saved.bitrate:undefined,userLimit:[ChannelType.GuildVoice,ChannelType.GuildStageVoice].includes(saved.type)?saved.userLimit:undefined,permissionOverwrites:overwrites,reason:'Uranium server backup recovery'};
}
async function restoreSnapshot(guild,snapshot=config(guild).snapshots[0]) {
  if(!snapshot)throw new Error('No backup exists. Run /antinuke backup-save first.');
  await Promise.all([guild.roles.fetch().catch(()=>null),guild.channels.fetch().catch(()=>null)]);
  const roleMap=new Map(); let rolesCreated=0,channelsCreated=0,skipped=0;
  for(const saved of [...snapshot.roles].sort((a,b)=>a.position-b.position)){const before=guild.roles.cache.find(r=>r.name===saved.name&&!r.managed);const role=await restoreRole(guild,saved);roleMap.set(saved.id,role.id);if(!before)rolesCreated++;}
  const channelMap=new Map();
  for(const saved of snapshot.channels.filter(x=>x.type===ChannelType.GuildCategory).sort((a,b)=>a.position-b.position)){let current=guild.channels.cache.find(ch=>ch.name===saved.name&&ch.type===saved.type);if(!current){const options=channelOptions(saved,roleMap,guild);if(options){current=await guild.channels.create(options);channelsCreated++;}}if(current)channelMap.set(saved.id,current.id);}
  for(const saved of snapshot.channels.filter(x=>x.type!==ChannelType.GuildCategory).sort((a,b)=>a.position-b.position)){let current=guild.channels.cache.find(ch=>ch.name===saved.name&&ch.type===saved.type&&(ch.parentId||null)===(saved.parentId?(channelMap.get(saved.parentId)||saved.parentId):null));if(!current){const options=channelOptions(saved,roleMap,guild);if(!options){skipped++;continue;}if(saved.parentId&&channelMap.has(saved.parentId))options.parent=channelMap.get(saved.parentId);current=await guild.channels.create(options);channelsCreated++;}channelMap.set(saved.id,current.id);}
  return {rolesCreated,channelsCreated,skipped};
}
async function recoverDeletedChannel(ch) {
  if(!ch.guild)return;const b=config(ch.guild);if(!b.enabled||b.autoRestore===false||!b.snapshots.length)return;
  const saved=b.snapshots[0].channels.find(x=>x.id===ch.id);if(!saved)return;
  try{const roleMap=new Map();for(const role of b.snapshots[0].roles){const found=ch.guild.roles.cache.find(r=>r.name===role.name&&!r.managed);if(found)roleMap.set(role.id,found.id);}
    const channelMap=new Map();for(const cat of b.snapshots[0].channels.filter(x=>x.type===ChannelType.GuildCategory)){const found=ch.guild.channels.cache.find(x=>x.name===cat.name&&x.type===cat.type);if(found)channelMap.set(cat.id,found.id);}
    const options=channelOptions(saved,roleMap,ch.guild);if(!options)return;if(saved.parentId&&channelMap.has(saved.parentId))options.parent=channelMap.get(saved.parentId);
    const recreated=await ch.guild.channels.create(options);await log(ch.guild,'♻️ Restored deleted channel **'+saved.name+'** from the latest Uranium backup as <#'+recreated.id+'>.');
  }catch(e){console.error('[backup channel recovery]',e.message);}
}
async function recoverDeletedRole(role) {
  if(!role.guild||role.id===role.guild.id)return;const b=config(role.guild);if(!b.enabled||b.autoRestore===false||!b.snapshots.length)return;
  const saved=b.snapshots[0].roles.find(x=>x.id===role.id);if(!saved)return;
  try{const restored=await restoreRole(role.guild,saved);await log(role.guild,'♻️ Restored deleted role **'+saved.name+'** from the latest Uranium backup as <@&'+restored.id+'>.');}catch(e){console.error('[backup role recovery]',e.message);}
}
async function log(guild,message){const id=db.g(guild.id).config.modlog;let ch=id?await guild.channels.fetch(id).catch(()=>null):null;if(!ch?.isTextBased())ch=guild.systemChannel;if(!ch?.isTextBased())return false;try{await ch.send({content:message,allowedMentions:{parse:[]}});return true;}catch{return false;}}
async function setChatArchive(guild,enabled,noticeChannel) {
  const b=config(guild);
  if(b.chat.enabled===!!enabled)return;
  if(enabled){
    const notice='📢 **Uranium chat archive enabled by a server manager.** Messages sent in this server may be stored for up to 7 days (maximum 1,000 messages) for moderation recovery and owner-requested export. Server managers can disable it with /antinuke backup-chat-off. Avoid sharing sensitive personal information in public channels.';
    let posted=false;
    if(noticeChannel?.isTextBased()){try{await noticeChannel.send({content:notice,allowedMentions:{parse:[]}});posted=true;}catch{}}
    if(!posted)posted=await log(guild,notice);
    if(!posted)throw new Error('I could not post the required public archive notice. Give Uranium Send Messages permission in this channel or the server system channel, then retry.');
    b.chat.enabled=true;b.chat.enabledAt=Date.now();b.chat.messages=[];
  } else {
    b.chat.enabled=false;b.chat.messages=[];b.chat.disabledAt=Date.now();
    await log(guild,'🔒 **Uranium chat archive disabled.** Stored chat archive entries were cleared.');
  }
  db.save();
}
function archiveMessage(m) {
  if(!m.guild||m.author?.bot||!m.content)return;const b=config(m.guild);if(!b.chat.enabled)return;const now=Date.now();
  b.chat.messages=b.chat.messages.filter(x=>now-x.at<=ARCHIVE_RETENTION_MS);
  b.chat.messages.push({id:m.id,at:m.createdTimestamp,channelId:m.channelId,channelName:m.channel?.name||'unknown',authorId:m.author.id,authorTag:m.author.tag||m.author.username,content:String(m.content).slice(0,4000),attachments:[...(m.attachments?.values?.()||[])].map(a=>({name:a.name,url:a.url})).slice(0,10)});
  if(b.chat.messages.length>MAX_ARCHIVE_MESSAGES)b.chat.messages.splice(0,b.chat.messages.length-MAX_ARCHIVE_MESSAGES);
  if(!archiveSaveTimer){archiveSaveTimer=setTimeout(()=>{archiveSaveTimer=null;db.save();},2000);archiveSaveTimer.unref?.();}
}
async function exportChat(guild,channelId=null) {
  const b=config(guild),now=Date.now(),rows=b.chat.messages.filter(x=>now-x.at<=ARCHIVE_RETENTION_MS&&(!channelId||x.channelId===channelId));
  if(!rows.length)throw new Error('No archived messages are available for that selection.');
  const bytes=Buffer.from(JSON.stringify({exportedAt:new Date(now).toISOString(),guild:{id:guild.id,name:guild.name},retentionDays:7,messages:rows},null,2),'utf8');
  if(bytes.length>7*1024*1024)throw new Error('Export is too large. Export one channel at a time.');
  return new AttachmentBuilder(bytes,{name:'uranium-chat-export-'+guild.id+'.json'});
}
function start(client) {
  if(snapshotTimer)clearInterval(snapshotTimer);
  snapshotTimer=setInterval(async()=>{for(const guild of client.guilds.cache.values()){const b=config(guild);const now=Date.now();const kept=b.chat.messages.filter(x=>now-x.at<=ARCHIVE_RETENTION_MS);if(kept.length!==b.chat.messages.length){b.chat.messages=kept;db.save();}if(!b.enabled)continue;if(!b.snapshots.length||now-(b.lastSnapshotAt||0)>=SNAPSHOT_INTERVAL_MS){try{await createSnapshot(guild,'scheduled');}catch(e){console.error('[backup scheduled snapshot]',guild.id,e.message);}}}},15*60*1000);
  snapshotTimer.unref?.();
}
function stop(){if(snapshotTimer)clearInterval(snapshotTimer);snapshotTimer=null;if(archiveSaveTimer){clearTimeout(archiveSaveTimer);archiveSaveTimer=null;db.save();}}
module.exports={config,createSnapshot,snapshotStatus,restoreSnapshot,recoverDeletedChannel,recoverDeletedRole,setChatArchive,archiveMessage,exportChat,start,stop};
