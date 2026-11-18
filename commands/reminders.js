const { PermissionFlagsBits: P } = require('discord.js');
const { C, S, I, CH } = require('../lib/cmd');
const { UserError, res, ts, trunc } = require('../lib/util');
const db = require('../lib/db');
const MAX_DELAY = 30 * 86400000;
function duration(value) {
  const m = /^(\d+)(s|m|h|d)$/i.exec(String(value || '').trim());
  if (!m) throw new UserError('Invalid duration', 'Use a value such as 10m, 2h or 1d.');
  const ms = Number(m[1]) * ({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]);
  if (!Number.isSafeInteger(ms) || ms < 10000 || ms > MAX_DELAY) throw new UserError('Duration out of range', 'Reminders must be between 10 seconds and 30 days.');
  return ms;
}
const state = g => db.g(g.id);
const mine = c => db.dueSchedules().filter(x => x.type === 'reminder' && x.guildId === c.g.id && x.userId === c.i.user.id);
const fmt = x => '#' + x.id + ' · ' + ts(x.at, 'R') + ' · ' + String(x.text).slice(0, 100);
function schedule(c, text, ms, channelId = null) {
  const d = state(c.g), active = mine(c);
  if (d.config.remindersEnabled === false) throw new UserError('Reminders are disabled in this server.');
  const limit = Math.max(1, Math.min(25, Number(d.config.reminderMax || 10)));
  if (active.length >= limit) throw new UserError('Reminder limit reached', 'You already have ' + active.length + ' pending reminders. Cancel one first.');
  const template = String(d.config.reminderTemplate || '{text}').replaceAll('{text}', text).slice(0, 1500);
  return db.schedule({ type: 'reminder', guildId: c.g.id, userId: c.i.user.id, channelId, text: template, at: Date.now() + ms, createdAt: Date.now() });
}
module.exports = { name:'reminders', description:'Personal reminders and scheduled server notices', commands:[
C('remind','Schedule a personal DM reminder',[S('duration','10m, 2h or 1d'),S('text','What should Uranium remind you about?')],null,async c=>{const x=schedule(c,c.s('text'),duration(c.s('duration')));return res('Reminder scheduled',fmt(x),{icon:'⏰'});}),
C('remind-list','List your pending reminders',[],null,async c=>{const a=mine(c).sort((x,y)=>x.at-y.at);return res('Your reminders',a.length?trunc(a.map(fmt).join('\n'),3500):'You have no pending reminders.',{icon:'📋'});}),
C('remind-cancel','Cancel one of your reminders',[I('id','Reminder ID',true,1,2147483647)],null,async c=>{const x=mine(c).find(v=>v.id===c.n('id'));if(!x)throw new UserError('Reminder not found','Use remind-list to see your reminder IDs.');db.dropSchedule(x.id);return res('Reminder cancelled','Removed reminder #'+x.id,{icon:'🗑️'});}),
C('remind-clear','Cancel all your pending reminders',[],null,async c=>{const a=mine(c);for(const x of a)db.dropSchedule(x.id);return res('Reminders cleared','Cancelled '+a.length+' pending reminder(s).',{icon:'🧹'});}),
C('remind-snooze','Move one reminder to a later time',[I('id','Reminder ID',true,1,2147483647),S('duration','New delay, such as 30m')],null,async c=>{const x=mine(c).find(v=>v.id===c.n('id'));if(!x)throw new UserError('Reminder not found');x.at=Date.now()+duration(c.s('duration'));db.save();return res('Reminder snoozed',fmt(x),{icon:'💤'});}),
C('remind-server','Schedule a public server notice',[S('duration','10m, 2h or 1d'),S('text','Notice text')],P.ManageGuild,async c=>{const channel=state(c.g).config.reminderChannel||c.ch.id;const x=schedule(c,c.s('text'),duration(c.s('duration')),channel);return res('Server notice scheduled',fmt(x)+'\nDestination: <#'+channel+'>',{icon:'📢'});}),
C('remind-server-list','List scheduled server notices',[],P.ManageGuild,async c=>{const a=db.dueSchedules().filter(x=>x.type==='reminder'&&x.guildId===c.g.id&&x.channelId).sort((x,y)=>x.at-y.at);return res('Scheduled server notices',a.length?trunc(a.map(fmt).join('\n'),3500):'No server notices are pending.',{icon:'📢'});}),
C('remind-server-cancel','Cancel a scheduled server notice',[I('id','Reminder ID',true,1,2147483647)],P.ManageGuild,async c=>{const x=db.dueSchedules().find(v=>v.type==='reminder'&&v.guildId===c.g.id&&v.channelId&&v.id===c.n('id'));if(!x)throw new UserError('Server notice not found');db.dropSchedule(x.id);return res('Server notice cancelled','Removed notice #'+x.id,{icon:'🗑️'});}),
C('remind-default','Set your default reminder delay',[S('duration','Default delay, such as 1h')],null,async c=>{duration(c.s('duration'));const d=state(c.g);d.reminderDefaults ||= {};d.reminderDefaults[c.i.user.id]=c.s('duration');db.save();return res('Default delay saved','Your default is now '+c.s('duration')+'.',{icon:'⏱️'});}),
C('remind-template-set','Set the server reminder message template',[S('text','Use {text} where the reminder should appear')],P.ManageGuild,async c=>{if(!c.s('text').includes('{text}'))throw new UserError('Template must contain {text}.');state(c.g).config.reminderTemplate=c.s('text').slice(0,1200);db.save();return res('Reminder template saved',c.s('text'),{icon:'📝'});}),
C('remind-template-clear','Reset the reminder message template',[],P.ManageGuild,async c=>{delete state(c.g).config.reminderTemplate;db.save();return res('Template reset','Reminders will use the default message format.',{icon:'♻️'});}),
C('remind-template-show','Show the active reminder template',[],null,async c=>res('Reminder template',state(c.g).config.reminderTemplate||'Default: {text}',{icon:'📝'})),
C('remind-count','Count your pending reminders',[],null,async c=>res('Pending reminders','You have **'+mine(c).length+'** pending reminder(s).',{icon:'🔢'})),
C('remind-next','Show your next reminder',[],null,async c=>{const x=mine(c).sort((a,b)=>a.at-b.at)[0];if(!x)throw new UserError('No pending reminders');return res('Next reminder',fmt(x),{icon:'⏰'});}),
C('remind-history','View recently delivered reminders',[],null,async c=>{const a=(state(c.g).reminderHistory||[]).filter(x=>x.userId===c.i.user.id).slice(-15).reverse();return res('Reminder history',a.length?a.map(x=>'#'+x.id+' · '+ts(x.sentAt,'R')+' · '+String(x.text).slice(0,100)).join('\n'):'No delivered reminders recorded.',{icon:'🗂️'});}),
C('remind-config','View reminder settings',[],P.ManageGuild,async c=>{const x=state(c.g).config;return res('Reminder settings',null,{icon:'⚙️',fields:[['Enabled',x.remindersEnabled===false?'No':'Yes',true],['Default channel',x.reminderChannel?'<#'+x.reminderChannel+'>':'Current channel',true],['Per-user limit',String(x.reminderMax||10),true],['Template',x.reminderTemplate||'Default']]});}),
C('remind-channel-set','Set the public reminder destination',[CH('channel','Text channel',true)],P.ManageGuild,async c=>{state(c.g).config.reminderChannel=c.c('channel').id;db.save();return res('Reminder channel set','Server notices will go to '+c.c('channel')+'.',{icon:'📣'});}),
C('remind-channel-clear','Use the command channel for server notices',[],P.ManageGuild,async c=>{delete state(c.g).config.reminderChannel;db.save();return res('Reminder channel cleared','remind-server will use the channel where it is run.',{icon:'♻️'});}),
C('remind-enable','Enable reminders in this server',[],P.ManageGuild,async c=>{state(c.g).config.remindersEnabled=true;db.save();return res('Reminders enabled','Members can schedule personal reminders again.',{icon:'✅'});}),
C('remind-disable','Disable new reminders in this server',[],P.ManageGuild,async c=>{state(c.g).config.remindersEnabled=false;db.save();return res('Reminders disabled','Existing reminders remain scheduled; new ones are blocked.',{icon:'⏸️'});}),
C('remind-test','Send yourself a reminder delivery test',[],null,async c=>{try{await c.i.user.send('⏰ Uranium reminder test: direct messages are working.');return res('Test sent','Check your Discord DMs.',{icon:'✅'});}catch{throw new UserError('I could not DM you','Enable direct messages from server members, then try again.');}}),
C('remind-export','Export your pending reminder list',[],null,async c=>{const a=mine(c).sort((x,y)=>x.at-y.at);return res('Reminder export',a.length?trunc(a.map(x=>[x.id,new Date(x.at).toISOString(),x.text].join(' | ')).join('\n'),3500):'Nothing to export.',{icon:'📤'});}),
C('remind-purge','Clear delivered reminder history',[],P.ManageGuild,async c=>{const d=state(c.g),n=(d.reminderHistory||[]).length;d.reminderHistory=[];db.save();return res('Reminder history purged','Removed '+n+' history record(s).',{icon:'🧹'});}),
C('remind-max','Set the maximum pending reminders per member',[I('count','Limit from 1 to 25',true,1,25)],P.ManageGuild,async c=>{state(c.g).config.reminderMax=c.n('count');db.save();return res('Reminder limit updated','Each member may now keep '+c.n('count')+' pending reminders.',{icon:'🔢'});}),
C('remind-usage','Show reminder command usage',[],null,async c=>res('Reminder guide','Personal: !remind 2h finish homework\nList: !remind-list\nCancel: !remind-cancel 12\nSnooze: !remind-snooze 12 30m\nServer notice: !remind-server 1d Event starts tomorrow',{icon:'📘'}))
]};
