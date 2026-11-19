const { C, S } = require('../lib/cmd');
const { PermissionFlagsBits: P } = require('discord.js');
const { UserError, res } = require('../lib/util');
const db = require('../lib/db');
const fortress = require('../lib/fortress');
const title = name => '☢ Uranium Anti-Nuke • ' + name;
function requireManager(c) {
 const cfg=fortress.antiConfig(c.g);
 if(c.i.user.id!==c.g.ownerId && !(cfg.extraOwners||[]).includes(c.i.user.id) && !c.i.memberPermissions.has(P.ManageGuild)) throw new UserError('Server Owner, Extra Owner, or Manage Server permission required.');
 return cfg;
}
function parseId(value){return String(value||'').replace(/[<@&!>]/g,'');}
async function configure(c){
 const cfg=requireManager(c),mode=(c.s('mode')||'status').toLowerCase();
 if(mode==='on'){
  const features={};for(const key of fortress.FEATURE_KEYS)features[key]=true;
  if(!db.g(c.g.id).config.fortress?.enabled)throw new UserError('Enable Fortress first with /security fortress mode:on.');
  fortress.configureAntiNuke(c.g,{enabled:true,features});
  return res(title('Protection enabled'),'All '+fortress.FEATURE_KEYS.length+' switches are ON. Three protected audit actions within 15 seconds trigger a 10-minute timeout when the actor is moderatable. Otherwise the owner receives an alert.',{icon:'🛡️'});
 }
 if(mode==='off'){fortress.configureAntiNuke(c.g,{enabled:false});return res(title('Protection disabled'),'Anti-Nuke enforcement is off. Fortress remains unchanged.',{icon:'🔓'});}
 if(mode==='toggle'){
  const key=(c.s('feature')||'').toLowerCase(),enabled=(c.s('enabled')||'on').toLowerCase()==='on';
  if(!fortress.FEATURE_LABELS[key])throw new UserError('Unknown feature key. Run /antinuke config mode:status to view keys.');
  fortress.setFeature(c.g,key,enabled);
  return res(title('Feature updated'),fortress.FEATURE_LABELS[key]+' is now **'+(enabled?'ON':'OFF')+'**.',{icon:'🛡️'});
 }
 const st=fortress.status(c.g);
 const lines=st.features.map(x=>(x.enabled?'🟢':'🔴')+' **'+x.label+'** ('+x.key+')');
 return res(title('Feature permissions matrix'),['**Anti-Nuke:** '+(st.enabled?'🟢 ENABLED':'🔴 DISABLED'),'**Whitelist:** '+st.whitelist.length+' entries • **Extra Owners:** '+st.extraOwners.length,'**Enforcement:** 3 actions / 15 sec • 10-minute timeout where possible','',...lines].join('\n'),{icon:'🛡️'});
}
function access(list,action){return async c=>{
 const cfg=requireManager(c),id=parseId(c.s('target'));
 if(action==='list'){const values=cfg[list]||[];return res(title(list==='whitelist'?'Whitelist':'Extra Owners'),values.length?values.map((x,i)=>(i+1)+'. '+(x.startsWith('role:')?'<@&'+x.slice(5)+'>':'<@'+x.replace('user:','')+'>')).join('\n'):'No entries configured.',{icon:'📋'});}
 if(!/^\d{17,20}$/.test(id))throw new UserError('Provide a valid Discord user or role ID.');
 if(list==='whitelist')await c.g.roles.fetch().catch(()=>{});
 if(list==='extraOwners'){const member=await c.g.members.fetch(id).catch(()=>null);if(!member)throw new UserError('Extra Owner must be a member of this server.');if(id===c.g.ownerId)throw new UserError('The server owner is already trusted.');}
 if(action==='add'){const value=fortress.addAccess(c.g,list,id);return res(title('Access updated'),list==='whitelist'?'Added '+(value.startsWith('role:')?'<@&'+id+'>':'<@'+id+'>')+' to the whitelist.':'<@'+id+'> can manage Anti-Nuke settings as an Extra Owner.',{icon:'✅'});}
 const count=fortress.removeAccess(c.g,list,id);return res(title('Access removed'),count?'Removed '+id+' from '+list+'.':'No matching entry found.',{icon:'⚠️'});
};}
module.exports={
 name:'antinuke',description:'Per-feature Anti-Nuke, whitelist and Extra Owner controls.',
 commands:[
  C('config','Enable, disable or inspect the Anti-Nuke matrix',[S('mode','on, off, status, or toggle',false,{choices:['on','off','status','toggle']}),S('feature','Feature key for toggle mode',false,{max:40}),S('enabled','on or off for toggle mode',false,{choices:['on','off']})],null,configure),
  C('wl-add','Add a user or role to the Anti-Nuke whitelist',[S('target','User ID, role ID, or mention',true,{max:30})],null,access('whitelist','add')),
  C('wl-remove','Remove a user or role from the Anti-Nuke whitelist',[S('target','User ID, role ID, or mention',true,{max:30})],null,access('whitelist','remove')),
  C('wl-list','List Anti-Nuke whitelist entries',[],null,access('whitelist','list')),
  C('extraowner-add','Grant a trusted member Extra Owner access',[S('target','Member ID or mention',true,{max:30})],null,access('extraOwners','add')),
  C('extraowner-remove','Remove Extra Owner access',[S('target','Member ID or mention',true,{max:30})],null,access('extraOwners','remove')),
  C('extraowner-list','List Extra Owners',[],null,access('extraOwners','list'))
 ]
};
