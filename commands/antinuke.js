const { C, S, CH } = require('../lib/cmd');
const { PermissionFlagsBits: P } = require('discord.js');
const { UserError, res } = require('../lib/util');
const db = require('../lib/db');
const fortress = require('../lib/fortress');
const ui = require('../lib/antinuke-ui');
const backup = require('../lib/server-backup');
const title = name => '☢ Uranium Anti-Nuke • ' + name;
function requireManager(c) {
  const cfg=fortress.antiConfig(c.g);
  if(c.i.user.id!==c.g.ownerId && !(cfg.extraOwners||[]).includes(c.i.user.id) && !c.i.memberPermissions.has(P.ManageGuild)) {
    throw new UserError('Server Owner, Extra Owner, or Manage Server permission required.');
  }
  return cfg;
}
function parseId(value) { return String(value||'').replace(/[<@&!>]/g,''); }
async function configure(c) {
  requireManager(c);
  const mode=(c.s('mode')||'status').toLowerCase();
  if(mode==='on') {
    const features={}; for(const key of fortress.FEATURE_KEYS) features[key]=true;
    fortress.configureAntiNuke(c.g,{enabled:true,features});
    return res(title('Protection enabled'),'All '+fortress.FEATURE_KEYS.length+' switches are ON. Anti-Nuke now works on its own, Fortress is not needed. Open `!antinuke` for the control panel.',{icon:'🛡️'});
  }
  if(mode==='off') { fortress.configureAntiNuke(c.g,{enabled:false}); return res(title('Protection disabled'),'Anti-Nuke enforcement is off. Fortress remains unchanged.',{icon:'🔓'}); }
  if(mode==='toggle') {
    const key=(c.s('feature')||'').toLowerCase(), enabled=(c.s('enabled')||'on').toLowerCase()==='on';
    if(!fortress.FEATURE_LABELS[key]) throw new UserError('Unknown feature key. Run /antinuke config mode:status to view keys.');
    fortress.setFeature(c.g,key,enabled);
    return res(title('Feature updated'),fortress.FEATURE_LABELS[key]+' is now **'+(enabled?'ON':'OFF')+'**.',{icon:'🛡️'});
  }
  const st=fortress.status(c.g);
  const lines=st.features.map(x=>(x.enabled?'🟢':'🔴')+' **'+x.label+'** ('+x.key+')');
  return res(title('Feature permissions matrix'),['**Anti-Nuke:** '+(st.enabled?'🟢 ENABLED':'🔴 DISABLED'),'**Whitelist:** '+st.whitelist.length+' entries • **Extra Owners:** '+st.extraOwners.length,'**Enforcement:** 3 actions / 15 sec • 10-minute timeout where possible','',...lines].join('\n'),{icon:'🛡️'});
}
async function panel(c) { requireManager(c); return ui.open(c); }
function access(list,action) { return async c=>{
  const cfg=requireManager(c), id=parseId(c.s('target'));
  if(action==='list') {
    const values=cfg[list]||[];
    return res(title(list==='whitelist'?'Whitelist':'Extra Owners'),values.length?values.map((x,i)=>(i+1)+'. '+(x.startsWith('role:')?'<@&'+x.slice(5)+'>':'<@'+x.replace('user:','')+'>')).join('\n'):'No entries configured.',{icon:'📋'});
  }
  if(!/^\d{17,20}$/.test(id)) throw new UserError('Provide a valid Discord user or role ID.');
  if(list==='whitelist') {
    await c.g.roles.fetch().catch(()=>{});
    if(!c.g.roles.cache.has(id)) {
      const member=await c.g.members.fetch(id).catch(()=>null);
      if(!member) throw new UserError('That user or role is not present in this server.');
    }
  }
  if(list==='extraOwners') {
    const member=await c.g.members.fetch(id).catch(()=>null);
    if(!member) throw new UserError('Extra Owner must be a member of this server.');
    if(id===c.g.ownerId) throw new UserError('The server owner is already trusted.');
  }
  if(action==='add') {
    const value=fortress.addAccess(c.g,list,id);
    return res(title('Access updated'),list==='whitelist'?(value.startsWith('role:')?'Added <@&'+id+'>':'Added <@'+id+'>')+' to the whitelist.':'<@'+id+'> can manage Anti-Nuke settings as an Extra Owner.',{icon:'✅'});
  }
  const count=fortress.removeAccess(c.g,list,id);
  return res(title('Access removed'),count?'Removed '+id+' from '+list+'.':'No matching entry found.',{icon:'⚠️'});
}; }

async function backupCommand(action) { return async c => {
  requireManager(c);
  const state=backup.config(c.g);
  if(action==='on') {
    const snap=await backup.createSnapshot(c.g,'initial');
    state.enabled=true; state.autoRestore=true; db.save();
    return res(title('Backup protection enabled'),'Created the first backup with '+snap.roles.length+' roles and '+snap.channels.length+' channels. Automatic snapshots run every 6 hours and deleted saved channels/roles are recreated.',{icon:'♻️'});
  }
  if(action==='off') { state.enabled=false; state.autoRestore=false; db.save(); return res(title('Automatic recovery paused'),'Existing backups are retained. New automatic snapshots and automatic recovery are paused.',{icon:'⏸️'}); }
  if(action==='save') { const snap=await backup.createSnapshot(c.g,'manual'); return res(title('Backup saved'),'Saved '+snap.roles.length+' roles and '+snap.channels.length+' channels. Stored backups: '+state.snapshots.length+'.',{icon:'💾'}); }
  if(action==='restore') { const result=await backup.restoreSnapshot(c.g); return res(title('Recovery completed'),'Recreated '+result.rolesCreated+' roles and '+result.channelsCreated+' channels. Skipped unsupported channel types: '+result.skipped+'. Existing resources were not deleted.',{icon:'♻️'}); }
  if(action==='status') { const s=backup.snapshotStatus(c.g); return res(title('Backup status'),['**Automatic backup:** '+(s.enabled?'ON':'OFF'),'**Automatic recovery:** '+(s.autoRestore?'ON':'OFF'),'**Saved snapshots:** '+s.snapshots,'**Latest backup:** '+(s.lastSnapshotAt?'<t:'+Math.floor(s.lastSnapshotAt/1000)+':R>':'None'),'**Saved roles/channels:** '+s.roles+' / '+s.channels,'**Chat archive:** '+(s.chatEnabled?'ON':'OFF'),'**Archived messages:** '+s.archivedMessages].join('\n'),{icon:'📊'}); }
  if(action==='chat-on') { await backup.setChatArchive(c.g,true,c.ch); return res(title('Chat archive enabled'),'A public notice was posted. Up to 1,000 messages are retained for 7 days. Enable Discord Message Content intent for message text capture.',{icon:'🔐'}); }
  if(action==='chat-off') { await backup.setChatArchive(c.g,false,c.ch); return res(title('Chat archive disabled'),'The stored chat archive was cleared.',{icon:'🔒'}); }
  if(action==='chat-export') {
    const channel=c.c('channel');
    const file=await backup.exportChat(c.g,channel?.id||null);
    if(c.i.isChatInputCommand?.()) await c.i.followUp({content:'🔐 Chat export attached. This file contains messages captured only while the server archive was enabled.',files:[file],flags:ui.EPH});
    else await c.ch.send({content:'🔐 Chat export attached.',files:[file]});
    return {handled:true};
  }
}; }

module.exports={
  name:'antinuke', description:'Per-feature Anti-Nuke, whitelist and Extra Owner controls.',
  commands:[
    C('panel','Open the interactive Anti-Nuke control panel',[],null,panel,{custom:true}),
    C('config','Enable, disable or inspect the Anti-Nuke matrix',[S('mode','on, off, status, or toggle',false,{choices:['on','off','status','toggle']}),S('feature','Feature key for toggle mode',false,{max:40}),S('enabled','on or off for toggle mode',false,{choices:['on','off']})],null,configure),
    C('wl-add','Add a user or role to the Anti-Nuke whitelist',[S('target','User ID, role ID, or mention',true,{max:30})],null,access('whitelist','add')),
    C('wl-remove','Remove a user or role from the Anti-Nuke whitelist',[S('target','User ID, role ID, or mention',true,{max:30})],null,access('whitelist','remove')),
    C('wl-list','List Anti-Nuke whitelist entries',[],null,access('whitelist','list')),
    C('extraowner-add','Grant a trusted member Extra Owner access',[S('target','Member ID or mention',true,{max:30})],null,access('extraOwners','add')),
    C('extraowner-remove','Remove Extra Owner access',[S('target','Member ID or mention',true,{max:30})],null,access('extraOwners','remove')),
    C('extraowner-list','List Extra Owners',[],null,access('extraOwners','list')),
    C('backup-on','Create initial backup and enable automatic recovery',[],null,backupCommand('on'),{custom:true}),
    C('backup-off','Pause automatic snapshots and recovery',[],null,backupCommand('off')),
    C('backup-save','Create a manual server structure backup',[],null,backupCommand('save'),{custom:true}),
    C('backup-restore','Recreate missing roles and channels from latest backup',[],null,backupCommand('restore'),{custom:true}),
    C('backup-status','Show backup and chat archive status',[],null,backupCommand('status')),
    C('backup-chat-on','Enable visible, limited chat archiving',[],null,backupCommand('chat-on'),{custom:true}),
    C('backup-chat-off','Disable chat archiving and clear stored messages',[],null,backupCommand('chat-off'),{custom:true}),
    C('backup-chat-export','Export archived messages as JSON', [CH('channel','Only export one channel (optional)',false,[0,5])],null,backupCommand('chat-export'),{custom:true,ephemeral:true})
  ]
};