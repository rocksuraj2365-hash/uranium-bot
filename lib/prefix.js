const { UserError } = require('./util');

const CAT_SHORT = { member: 'm', message: 'msg', channel: 'ch', role: 'ro', voice: 'vc', server: 'sv', automod: 'am', info: 'in', premium: 'vip', license: 'lic', template: 'tpl' };
const FREE = new Set(['reason', 'text', 'note', 'message', 'words', 'nickname', 'name', 'ids', 'options', 'prize', 'expression']);

// alias -> "category command"
const CURATED = {
  // member
  b: 'member ban', ub: 'member unban', k: 'member kick', sb: 'member softban', tb: 'member tempban', t: 'member timeout', mute: 'member timeout',
  ut: 'member untimeout', unmute: 'member untimeout', w: 'member warn', uw: 'member unwarn', ws: 'member warnings', cw: 'member clear-warnings',
  nick: 'member nick', rn: 'member reset-nick', na: 'member note-add', notes: 'member notes', nr: 'member note-remove', mb: 'member massban',
  mk: 'member mass-kick', bl: 'member ban-list', bc: 'member ban-check', te: 'member timeout-extend', tc: 'member timeout-check',
  wa: 'member watch-add', wr: 'member watch-remove',
  // message
  p: 'message purge', pu: 'message purge-user', pb: 'message purge-bots', ph: 'message purge-humans', pl: 'message purge-links', pi: 'message purge-images',
  pa: 'message purge-attachments', pe: 'message purge-embeds', pc: 'message purge-contains', ps: 'message purge-startswith', pbf: 'message purge-before',
  paf: 'message purge-after', pm: 'message purge-mentions', pinv: 'message purge-invites', del: 'message delete-message', pin: 'message pin-message',
  unpin: 'message unpin-message', cr: 'message clear-reactions', ar: 'message add-reaction', say: 'message say', se: 'message say-embed',
  ann: 'message announce', ebm: 'message edit-bot-message', mi: 'message message-info', reply: 'message reply',
  // channel
  l: 'channel lock', ul: 'channel unlock', ld: 'channel lockdown-all', uld: 'channel unlock-all', sm: 'channel slowmode', smo: 'channel slowmode-off',
  hide: 'channel hide', unhide: 'channel unhide', topic: 'channel topic', crn: 'channel rename', nsfw: 'channel nsfw-on', sfw: 'channel nsfw-off',
  clone: 'channel clone', cdel: 'channel delete', ct: 'channel create-text', cv: 'channel create-voice', cc: 'channel create-category', nuke: 'channel nuke',
  lr: 'channel lock-reactions', la: 'channel lock-attachments', le: 'channel lock-embeds', lt: 'channel lock-threads', rp: 'channel reset-perms',
  at: 'channel archive-thread', lth: 'channel lock-thread',
  // role
  ra: 'role add', rr: 'role remove', rta: 'role temp-add', rc: 'role create', rd: 'role delete', rrn: 'role rename', rcol: 'role color', rh: 'role hoist-on',
  ruh: 'role hoist-off', rm: 'role mentionable-on', rum: 'role mentionable-off', rpos: 'role position', rcl: 'role clone', rpv: 'role perms-view',
  rpg: 'role perm-grant', rpr: 'role perm-revoke', rpx: 'role perm-reset', rs: 'role swap', ram: 'role add-multiple', rrm: 'role remove-multiple',
  muted: 'role muted-setup', hr: 'role has-role', rl: 'role list', mr: 'role member-roles', rch: 'role manageable-check',
  // voice
  vm: 'voice mute', vum: 'voice unmute', vd: 'voice deafen', vud: 'voice undeafen', vk: 'voice disconnect', vmv: 'voice move', vma: 'voice move-all',
  vka: 'voice disconnect-all', vmall: 'voice mute-all', vuma: 'voice unmute-all', vda: 'voice deafen-all', vuda: 'voice undeafen-all', vl: 'voice lock',
  vul: 'voice unlock', vh: 'voice hide', vuh: 'voice unhide', vlim: 'voice limit', vrn: 'voice rename', vbr: 'voice bitrate', vreg: 'voice region',
  vp: 'voice permit', vb: 'voice ban-from-vc', vub: 'voice unban-from-vc', pull: 'voice pull', who: 'voice who',
  // server
  modlog: 'server set-modlog', cml: 'server clear-modlog', cfg: 'server config', cases: 'server cases', case: 'server case', cre: 'server case-reason',
  cdl: 'server case-delete', stats: 'server stats', audit: 'server audit-log', il: 'server invite-list', idel: 'server invite-delete', ic: 'server invite-create',
  vlvl: 'server verification-level', dn: 'server default-notifications', srn: 'server rename', afk: 'server afk-channel', afkt: 'server afk-timeout',
  sys: 'server system-channel', el: 'server emoji-list', ed: 'server emoji-delete', wl: 'server webhook-list', wd: 'server webhook-delete',
  pp: 'server prune-preview', pr: 'server prune-run', appeal: 'server set-appeal-link',
  // automod
  rules: 'automod rules', kc: 'automod keyword-create', ka: 'automod keyword-add', kr: 'automod keyword-remove', spam: 'automod spam-enable',
  ms: 'automod mention-spam', pprof: 'automod preset-profanity', psex: 'automod preset-sexual', pslur: 'automod preset-slurs', pall: 'automod preset-all',
  rdel: 'automod rule-delete', ren: 'automod rule-enable', rdis: 'automod rule-disable', rv: 'automod rule-view', rrname: 'automod rule-rename',
  er: 'automod exempt-role', ec: 'automod exempt-channel', uer: 'automod unexempt-role', uec: 'automod unexempt-channel', alert: 'automod alert-channel',
  atime: 'automod action-timeout', ablock: 'automod action-block-message', bk: 'automod block-links', bi: 'automod block-invites', be: 'automod block-everyone',
  // info
  ping: 'info ping', up: 'info uptime', about: 'info about', bot: 'info botinfo', ui: 'info userinfo', av: 'info avatar', bn: 'info banner', si: 'info serverinfo',
  sic: 'info server-icon', ri: 'info roleinfo', ci: 'info channelinfo', mc: 'info membercount', boosts: 'info boosts', sf: 'info snowflake',
  age: 'info account-age', perms: 'info permissions', bperms: 'info bot-permissions', check: 'info setup-check', invite: 'info invite-bot',
  np: 'premium noprefix', servers: 'premium servers', sinfo: 'premium server-info', leave: 'premium leave', gban: 'premium gban',
  ungban: 'premium ungban', blk: 'premium blacklist', ublk: 'premium unblacklist', botstatus: 'premium status', botav: 'premium bot-avatar',
  restart: 'premium restart', lstats: 'premium live-stats', eadd: 'premium emoji-add', eb: 'premium embed-builder', poll: 'premium poll', gw: 'premium giveaway',
  rpanel: 'premium role-panel', tpanel: 'premium ticket-panel', backup: 'premium backup', xcases: 'premium export-cases', ltimer: 'premium lockdown-timer',
  hist: 'premium history', lb: 'premium leaderboard', snipe: 'premium snipe',
  pgrant: 'license grant', prevoke: 'license revoke', paccess: 'license access', brand: 'license profile',
  dash: 'info dashboard', cmds: 'info commands-list', time: 'info time', id: 'info id-lookup', guide: 'info mod-guide', help: 'info help', h: 'info help',
};

let ALIAS = new Map(), SHORT = new Map(), CATS = new Map();

function init(cats) {
  CATS = new Map(cats.map((c) => [c.name, c])); ALIAS = new Map(); SHORT = new Map();
  for (const [a, t] of Object.entries(CURATED)) {
    const [cn, sn] = t.split(' '); const cat = CATS.get(cn); const def = cat?.map.get(sn);
    if (!def) { console.warn('Bad alias', a, t); continue; }
    if (ALIAS.has(a)) { console.warn('Duplicate alias', a); continue; }
    ALIAS.set(a, { cat, def });
    const key = `${cn}:${sn}`; if (!SHORT.has(key) || a.length < SHORT.get(key).length) SHORT.set(key, a);
  }
  const count = new Map();
  for (const cat of cats) for (const d of cat.commands) count.set(d.name, (count.get(d.name) || 0) + 1);
  for (const cat of cats) for (const d of cat.commands) {
    if (count.get(d.name) === 1 && !ALIAS.has(d.name)) ALIAS.set(d.name, { cat, def: d });
    const key = `${cat.name}:${d.name}`; if (!SHORT.has(key)) SHORT.set(key, count.get(d.name) === 1 ? d.name : `${CAT_SHORT[cat.name]} ${d.name}`);
  }
}
const shortOf = (cat, name) => SHORT.get(`${cat}:${name}`) || `${CAT_SHORT[cat] || cat} ${name}`;

function tokenize(s) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(s))) out.push({ text: m[1] ?? m[2], start: m.index });
  return out;
}
function resolve(tokens) {
  const t0 = tokens[0].text.toLowerCase();
  // Friendly owner-managed Premium shortcuts: !premium add/remove/check.
  // The slash-command group remains /license to stay within Discord's 25-subcommand limit.
  if (t0 === 'premium' && tokens[1]) {
    const action = ({ add: 'grant', remove: 'revoke', check: 'access', profile: 'profile' })[tokens[1].text.toLowerCase()];
    const cat = CATS.get('license');
    const def = action && cat?.map.get(action);
    if (def) return { cat, def, used: 2 };
  }
  if (ALIAS.has(t0)) return { ...ALIAS.get(t0), used: 1 };
  const key = [...CATS.keys()].find((k) => k === t0) || Object.keys(CAT_SHORT).find((k) => CAT_SHORT[k] === t0);
  if (key && tokens[1]) {
    const cat = CATS.get(key); const s = tokens[1].text.toLowerCase();
    let def = cat.map.get(s);
    if (!def) { const m = cat.commands.filter((c) => c.name.startsWith(s)); if (m.length === 1) def = m[0]; }
    if (def) return { cat, def, used: 2 };
  }
  return null;
}
const ordered = (opts) => [...opts.filter((o) => !(o.t === 'str' && FREE.has(o.n))), ...opts.filter((o) => o.t === 'str' && FREE.has(o.n))];
function usage(px, alias, def) { return `${px}${alias} ${ordered(def.opts).map((o) => (o.req ? `<${o.n}>` : `[${o.n}]`)).join(' ')}`.trim(); }

const idOf = (s) => { const m = /^<(?:@!?|@&|#)(\d{17,20})>$|^(\d{17,20})$/.exec(s); return m ? (m[1] || m[2]) : null; };
async function parseValue(o, text, env) {
  const { client, guild } = env;
  switch (o.t) {
    case 'user': { const id = idOf(text); return id ? client.users.fetch(id).catch(() => null) : null; }
    case 'role': { const id = idOf(text); if (id) return guild.roles.cache.get(id) || null; const q = text.toLowerCase(); return guild.roles.cache.find((r) => r.name.toLowerCase() === q) || guild.roles.cache.find((r) => r.name.toLowerCase().includes(q)) || null; }
    case 'chan': {
      await guild.channels.fetch().catch(() => {}); const id = idOf(text); let ch = id ? guild.channels.cache.get(id) : null;
      if (!ch) { const q = text.replace(/^#/, '').toLowerCase(); ch = guild.channels.cache.find((c) => c.name.toLowerCase() === q) || null; }
      if (ch && o.types && !o.types.includes(ch.type)) return null; return ch;
    }
    case 'int': { if (!/^-?\d+$/.test(text)) return null; const n = parseInt(text, 10); if ((o.min != null && n < o.min) || (o.max != null && n > o.max)) throw new UserError(`**${o.n}** must be between ${o.min ?? '…'} and ${o.max ?? '…'}`); return n; }
    case 'bool': return /^(y|yes|true|on|1)$/i.test(text) ? true : /^(n|no|false|off|0)$/i.test(text) ? false : null;
    default: {
      if (o.choices) { const v = o.choices.map((c) => (typeof c === 'string' ? { name: c, value: c } : c)).find((c) => c.name.toLowerCase() === text.toLowerCase() || String(c.value).toLowerCase() === text.toLowerCase()); return v ? v.value : null; }
      if (o.n === 'color' && !/^#?[0-9a-f]{6}$/i.test(text)) return null;
      if (o.max && text.length > o.max) throw new UserError(`**${o.n}** is too long (max ${o.max} characters)`);
      return text;
    }
  }
}
async function parseArgs(env, def, tokens, raw, usageText) {
  const opts = ordered(def.opts); const vals = {}; let ti = 0;
  for (const o of opts) {
    const tk = tokens[ti];
    if (o.t === 'user' && o.req && env.msg.reference?.messageId && (!tk || !(await parseValue(o, tk.text, env)))) {
      const r = await env.msg.channel.messages.fetch(env.msg.reference.messageId).catch(() => null);
      if (r) { vals[o.n] = r.author; continue; }
    }
    if (!tk) { if (o.req) throw new UserError(`You forgot **${o.n}**.`, `Usage: \`${usageText}\``); continue; }
    if (o.t === 'str' && FREE.has(o.n)) { vals[o.n] = raw.slice(tk.start).trim(); if (o.max && vals[o.n].length > o.max) throw new UserError(`**${o.n}** is too long (max ${o.max} characters)`); ti = tokens.length; continue; }
    const v = await parseValue(o, tk.text, env);
    if (v == null) {
      if (o.req) throw new UserError(`I could not understand **${o.n}**: \`${tk.text}\``, `Usage: \`${usageText}\`. ${o.t === 'user' ? 'Mention the user (@name), paste their ID, or reply to their message.' : o.t === 'role' ? 'Mention the role or type its name.' : o.t === 'chan' ? 'Mention the channel (#name).' : ''}`.trim());
      continue;
    }
    vals[o.n] = v; ti++;
  }
  return vals;
}

function fakeInteraction(msg, member, def, vals, client) {
  let bot = null;
  const send = (p) => { const x = { ...p }; delete x.flags; return x; };
  const fi = {
    client, user: msg.author, member, guild: msg.guild, guildId: msg.guild.id, channel: msg.channel, channelId: msg.channel.id,
    memberPermissions: member.permissions, createdTimestamp: msg.createdTimestamp, deferred: false, replied: false, commandName: def.name,
    inGuild: () => true,
    options: {
      getUser: (n) => vals[n] ?? null, getString: (n) => vals[n] ?? null, getInteger: (n) => vals[n] ?? null,
      getBoolean: (n) => vals[n] ?? null, getChannel: (n) => vals[n] ?? null, getRole: (n) => vals[n] ?? null, getSubcommand: () => def.name,
    },
    async deferReply() { fi.deferred = true; },
    async reply(p) { return fi.editReply(p); },
    async editReply(p) {
      const x = send(p);
      if (!bot) { bot = await msg.channel.send({ ...x, reply: { messageReference: msg.id, failIfNotExists: false }, allowedMentions: { repliedUser: false, parse: [] } }); fi.replied = true; return bot; }
      bot = await bot.edit(x); return bot;
    },
    async followUp(p) { return msg.channel.send({ ...send(p), allowedMentions: { parse: [] } }); },
    async deleteReply() { if (bot) await bot.delete().catch(() => {}); },
  };
  return fi;
}

module.exports = { init, shortOf, tokenize, resolve, usage, parseArgs, fakeInteraction, CAT_SHORT, CURATED };
