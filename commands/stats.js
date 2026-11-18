const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const { C, S } = require('../lib/cmd');
const { UserError, res } = require('../lib/util');
const db = require('../lib/db');
const cv2 = require('../lib/cv2');
const { E } = require('../lib/emojis');
const dayKey = (t) => new Date(t || Date.now()).toISOString().slice(0, 10);
const statsOf = (g) => { const d=db.g(g.id); d.stats ||= {days:{},users:{},voiceOpen:{},counters:[]}; d.stats.days ||= {}; d.stats.users ||= {}; d.stats.voiceOpen ||= {}; d.stats.counters ||= []; return d.stats; };
const bucket = (g,t) => { const s=statsOf(g), k=dayKey(t); s.days[k] ||= {joins:0,leaves:0,messages:0,voiceSeconds:0}; return s.days[k]; };
const afkStore = (id) => { const d=db.g(id); d.afkUsers ||= {}; return d.afkUsers; };
const fmt = (n) => { const h=Math.floor(n/3600),m=Math.floor(n%3600/60); return h ? h+'h '+m+'m' : m+'m'; };
async function ask(c,prompt,choices) {
  const icons = { server: E('server'), global: E('members'), on: E('verify'), off: E('mute'), cancel: E('cross') };
  const labels = { server: 'This server', global: 'All servers', on: 'Enable DMs', off: 'Disable DMs', cancel: 'Cancel' };
  const buttons = choices.map((value) => cv2.button('afk:'+value, labels[value] || value, value === 'cancel' ? 2 : 1, icons[value]));
  const sent = await c.i.channel.send(cv2.message([
    cv2.section([prompt, '_Choose an option below. This prompt expires in 60 seconds._'], cv2.thumbnail(c.i.user.displayAvatarURL({ size: 128 }), 'Your avatar')),
    cv2.separator(),
    cv2.row(buttons)
  ], 0x8b5cf6));
  try {
    const picked = await sent.awaitMessageComponent({
      filter: (interaction) => interaction.user.id === c.i.user.id && interaction.customId.startsWith('afk:'),
      time: 60000
    });
    await picked.deferUpdate();
    await sent.edit({ components: [] }).catch(() => {});
    const value = picked.customId.slice(4);
    if (value === 'cancel') throw new UserError('AFK setup cancelled.', 'Nothing was changed.');
    return value;
  } catch (error) {
    await sent.edit({ components: [] }).catch(() => {});
    if (error instanceof UserError) throw error;
    if (error?.message === 'time') throw new UserError('AFK setup timed out.', 'Run !afk again and choose an option within 60 seconds.');
    throw error;
  }
}
async function applyAfkNickname(guild, userId, originalNickname, reason) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, reason: 'Member is not available in this server.' };
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(P.ManageNicknames)) return { ok: false, reason: 'Uranium is missing **Manage Nicknames** permission.' };
  if (!member.manageable) return { ok: false, reason: 'Uranium role is not high enough to manage this member’s nickname.' };
  const base = (member.nickname || member.user.username).replace(/\\s*\\[afk\\]$/i, '');
  try {
    await member.setNickname((base.slice(0, 26) + ' [afk]').slice(0, 32), reason);
    return { ok: true, originalNickname: member.nickname === null ? null : originalNickname };
  } catch (error) {
    const missing = Number(error?.code) === 50013 || /Missing Permissions/i.test(String(error?.message || ''));
    return { ok: false, reason: missing ? 'Discord denied nickname changes. Check **Manage Nicknames** and role hierarchy.' : 'Nickname could not be changed: ' + String(error?.message || 'unknown error').slice(0, 100) };
  }
}
async function setAfk(c) {
  const reason=String(c.s('reason')||'AFK').slice(0,120);
  const scope=await ask(c,'## '+E('fox_sleep')+' AFK visibility\nShould your AFK status apply only in this server or across all servers?',['server','global','cancel']);
  const dm=await ask(c,'## '+E('message')+' Mention notifications\nShould Uranium DM you when someone mentions you while you are AFK?',['on','off','cancel']);
  const global=scope==='global', key=global?'__global':c.g.id, nicknames={}, nicknameResults=[];
  const store=afkStore(key);
  const guilds = global ? [...c.i.client.guilds.cache.values()] : [c.g];
  for (const guild of guilds) {
    const result = await applyAfkNickname(guild, c.i.user.id, null, global ? 'Uranium global AFK' : 'Uranium AFK');
    if (result.ok) nicknames[guild.id] = result.originalNickname;
    nicknameResults.push({ guild, ...result });
  }
  store[c.i.user.id]={reason,at:Date.now(),dm:dm==='on',scope,nicknames}; db.save();
  const changed = nicknameResults.filter(x=>x.ok).length;
  const failed = nicknameResults.filter(x=>!x.ok);
  const nicknameLine = failed.length
    ? E('warn')+' **Nickname tag not applied in '+failed.length+' server(s).**\\n'+failed.slice(0,5).map(x=>'• **'+x.guild.name+'**: '+x.reason).join('\\n')+(failed.length>5?'\\n• And '+(failed.length-5)+' more server(s).':'')
    : E('check')+' Nickname tag applied in '+changed+' server(s).';
  return res('AFK enabled',null,{embed:cv2.message([
    cv2.section(['# '+E('fox_sleep')+' AFK mode enabled','**Reason:** '+reason+'\\n**Scope:** '+(global?'All servers':'This server')+'\\n**Mention DMs:** '+(dm==='on'?'Enabled':'Disabled')],cv2.thumbnail(c.i.user.displayAvatarURL({size:128}),'AFK profile')),
    cv2.separator(),
    cv2.text(nicknameLine),
    cv2.separator(),
    cv2.row([cv2.button('afk:clear','Clear my AFK',2,E('cross'))])
  ],failed.length?0xffb84d:0x39d98a)});
}
async function clearAfk(uid,gid,client) {
  let rec=null; const local=afkStore(gid), global=afkStore('__global');
  if(local[uid]) {rec=local[uid];delete local[uid];}
  if(global[uid]) {rec=global[uid];delete global[uid];}
  if(!rec) return null;
  for(const id of Object.keys(rec.nicknames||{})) {
    const g=client.guilds.cache.get(id); if(!g) continue;
    const m=await g.members.fetch(uid).catch(()=>null);
    if(m && /\\s*\\[afk\\]$/i.test(m.nickname||'')) await m.setNickname(rec.nicknames[id]||null,'Uranium AFK cleared').catch(()=>{});
  }
  db.save(); return rec;
}
async function inspectAfkMessage(msg) {
  if(!msg.guild||msg.author.bot) return;
  const cleared=await clearAfk(msg.author.id,msg.guild.id,msg.client);
  if(cleared) await msg.reply({content:'Welcome back <@'+msg.author.id+'>! AFK cleared.',allowedMentions:{users:[msg.author.id]}}).catch(()=>{});
  for(const id of [...msg.mentions.users.keys()].filter(x=>x!==msg.author.id).slice(0,5)) {
    const rec=afkStore(msg.guild.id)[id]||afkStore('__global')[id]; if(!rec) continue;
    await msg.reply({content:'🌙 <@'+id+'> is AFK: **'+String(rec.reason||'AFK').slice(0,120)+'**',allowedMentions:{users:[id]}}).catch(()=>{});
    if(rec.dm) { const u=await msg.client.users.fetch(id).catch(()=>null); if(u) await u.send('Someone mentioned you in '+msg.guild.name+': '+msg.url).catch(()=>{}); }
  }
}
function recordMessage(msg) {
  if(!msg.guild||msg.author.bot) return;
  const s=statsOf(msg.guild),d=bucket(msg.guild); d.messages++;
  s.users[msg.author.id] ||= {messages:0,voiceSeconds:0}; s.users[msg.author.id].messages++; db.save();
}
function recordMember(g,joined) { bucket(g)[joined?'joins':'leaves']++; db.save(); }
function recordVoice(oldS,newS) {
  const g=newS.guild||oldS.guild,id=newS.id||oldS.id,s=statsOf(g),now=Date.now(),before=oldS.channelId,after=newS.channelId;
  if(!before&&after) s.voiceOpen[id]={at:now};
  if(before&&!after&&s.voiceOpen[id]) { const seconds=Math.max(0,Math.floor((now-s.voiceOpen[id].at)/1000)); bucket(g).voiceSeconds+=seconds; s.users[id] ||= {messages:0,voiceSeconds:0}; s.users[id].voiceSeconds+=seconds; delete s.voiceOpen[id]; }
  db.save();
}
async function updateCounters(g) {
  const s=statsOf(g),vals=[['members',g.memberCount||0],['bots',g.members.cache.filter(m=>m.user.bot).size],['boosts',g.premiumSubscriptionCount||0]];
  for(const [key,value] of vals) { const x=s.counters.find(v=>v.key===key); if(!x) continue; const ch=await g.channels.fetch(x.channelId).catch(()=>null); const name=key+': '+value; if(ch&&ch.name!==name) await ch.setName(name.slice(0,100)).catch(()=>{}); }
}
module.exports={
 name:'stats',description:'Server statistics, activity tracking and AFK tools',
 commands:[
 C('overview','Show server statistics overview',[],null,async c=>{const s=statsOf(c.g),d=bucket(c.g);return res('Server statistics',null,{icon:'📊',fields:[['Members',String(c.g.memberCount||0),true],['Bots',String(c.g.members.cache.filter(m=>m.user.bot).size),true],['Boosts',String(c.g.premiumSubscriptionCount||0),true],['Messages today',String(d.messages),true],['Joins today',String(d.joins),true],['Leaves today',String(d.leaves),true],['Voice today',fmt(d.voiceSeconds),true],['Tracked users',String(Object.keys(s.users).length),true]]});}),
 C('members','Show member and bot counts',[],null,async c=>res('Member statistics',null,{fields:[['Total',String(c.g.memberCount||0),true],['Humans',String(c.g.members.cache.filter(m=>!m.user.bot).size),true],['Bots',String(c.g.members.cache.filter(m=>m.user.bot).size),true]]})),
 C('growth','Show joins and leaves for the last 7 days',[],null,async c=>{const s=statsOf(c.g),a=[];for(let n=6;n>=0;n--){const k=dayKey(Date.now()-n*86400000),d=s.days[k]||{};a.push(k+': +'+(d.joins||0)+' / -'+(d.leaves||0));}return res('7-day growth',a.join('\n'));}),
 C('messages','Show messages tracked today',[],null,async c=>res('Message statistics','Today: **'+bucket(c.g).messages+'** messages')),
 C('voice','Show voice activity tracked today',[],null,async c=>res('Voice statistics','Today: **'+fmt(bucket(c.g).voiceSeconds)+'** accumulated voice time')),
 C('top','Show overall activity leaderboard',[],null,async c=>{const a=Object.entries(statsOf(c.g).users).sort((x,y)=>(y[1].messages+y[1].voiceSeconds/60)-(x[1].messages+x[1].voiceSeconds/60)).slice(0,10);return res('Activity leaderboard',a.length?a.map((x,i)=>(i+1)+'. <@'+x[0]+'> • '+x[1].messages+' messages • '+fmt(x[1].voiceSeconds)+' voice').join('\n'):'No activity recorded yet.');}),
 C('top-messages','Show top message contributors',[],null,async c=>{const a=Object.entries(statsOf(c.g).users).sort((x,y)=>y[1].messages-x[1].messages).slice(0,10);return res('Message leaderboard',a.length?a.map((x,i)=>(i+1)+'. <@'+x[0]+'> — '+x[1].messages).join('\n'):'No messages recorded.');}),
 C('top-voice','Show top voice contributors',[],null,async c=>{const a=Object.entries(statsOf(c.g).users).sort((x,y)=>y[1].voiceSeconds-x[1].voiceSeconds).slice(0,10);return res('Voice leaderboard',a.length?a.map((x,i)=>(i+1)+'. <@'+x[0]+'> — '+fmt(x[1].voiceSeconds)).join('\n'):'No voice activity recorded.');}),
 C('daily','Show today statistics',[],null,async c=>{const d=bucket(c.g);return res('Daily statistics',null,{fields:[['Messages',String(d.messages),true],['Joins',String(d.joins),true],['Leaves',String(d.leaves),true],['Voice',fmt(d.voiceSeconds),true]]});}),
 C('weekly','Show last 7 days statistics',[],null,async c=>{const s=statsOf(c.g),a=[];for(let n=6;n>=0;n--){const k=dayKey(Date.now()-n*86400000),d=s.days[k]||{};a.push(k+': '+(d.messages||0)+' msgs • +'+(d.joins||0)+'/-'+(d.leaves||0)+' • '+fmt(d.voiceSeconds||0));}return res('Weekly statistics',a.join('\n'));}),
 C('monthly','Show last 30 days statistics',[],null,async c=>{const s=statsOf(c.g);let m=0,j=0,l=0,v=0;for(let n=0;n<30;n++){const d=s.days[dayKey(Date.now()-n*86400000)]||{};m+=d.messages||0;j+=d.joins||0;l+=d.leaves||0;v+=d.voiceSeconds||0;}return res('Monthly statistics',null,{fields:[['Messages',String(m),true],['Joins',String(j),true],['Leaves',String(l),true],['Voice',fmt(v),true]]});}),
 C('roles','Show role count and largest roles',[],null,async c=>{const a=[...c.g.roles.cache.values()].filter(r=>r.id!==c.g.id).sort((x,y)=>y.members.size-x.members.size).slice(0,10);return res('Role statistics','Total roles: **'+(c.g.roles.cache.size-1)+'**\n'+a.map(r=>r.name+': '+r.members.size).join('\n'));}),
 C('channels','Show channel counts by type',[],null,async c=>{await c.g.channels.fetch();const a=[...c.g.channels.cache.values()];return res('Channel statistics',null,{fields:[['Text',String(a.filter(x=>x.type===CT.GuildText).length),true],['Voice',String(a.filter(x=>x.type===CT.GuildVoice).length),true],['Categories',String(a.filter(x=>x.type===CT.GuildCategory).length),true],['Threads',String(a.filter(x=>x.isThread?.()).length),true]]});}),
 C('emojis','Show emoji and sticker counts',[],null,async c=>{await c.g.emojis.fetch().catch(()=>{});await c.g.stickers.fetch().catch(()=>{});return res('Emoji statistics',null,{fields:[['Emojis',String(c.g.emojis.cache.size),true],['Stickers',String(c.g.stickers.cache.size),true],['Animated',String(c.g.emojis.cache.filter(e=>e.animated).size),true]]});}),
 C('boosts','Show boost count and level',[],null,async c=>res('Boost statistics',null,{fields:[['Boosts',String(c.g.premiumSubscriptionCount||0),true],['Boost level',String(c.g.premiumTier),true]]})),
 C('counter-setup','Create member, bot and boost counters',[],P.ManageChannels,async c=>{const s=statsOf(c.g),made=[];for(const key of ['members','bots','boosts']){let x=s.counters.find(v=>v.key===key);if(x&&await c.g.channels.fetch(x.channelId).catch(()=>null))continue;const ch=await c.g.channels.create({name:key+': 0',type:CT.GuildVoice,permissionOverwrites:[{id:c.g.roles.everyone.id,deny:['Connect','Speak']}]});s.counters.push({key,channelId:ch.id});made.push(ch);}db.save();await updateCounters(c.g);return res('Statistics counters ready',made.length?made.map(x=>x.toString()).join('\n'):'Counters already exist.');}),
 C('counter-off','Remove statistics counter channels',[],P.ManageChannels,async c=>{const s=statsOf(c.g);let n=0;for(const x of s.counters){const ch=await c.g.channels.fetch(x.channelId).catch(()=>null);if(ch){await ch.delete('Uranium stats counters disabled').catch(()=>{});n++;}}s.counters=[];db.save();return res('Counters disabled','Removed '+n+' counter channel(s).');}),
 C('config','Show statistics configuration',[],P.ManageGuild,async c=>{const s=statsOf(c.g);return res('Statistics configuration',null,{fields:[['Message tracking','On when message events are available'],['Voice tracking','On'],['Counters',String(s.counters.length)],['Tracked users',String(Object.keys(s.users).length)]]});}),
 C('afk','Set AFK status and choose scope and DM alerts',[S('reason','AFK status',false,{max:120})],null,setAfk,{custom:true}),
 C('afk-clear','Clear your AFK status',[],null,async c=>{const x=await clearAfk(c.i.user.id,c.g.id,c.i.client);if(!x)throw new UserError('You do not have an AFK status here.');return res('AFK cleared','Your AFK status and managed nickname tag have been restored.');},{custom:true})
 ],
 recordMessage,recordMember,recordVoice,inspectAfkMessage,updateCounters
};
