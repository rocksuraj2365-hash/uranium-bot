const { UserError } = require('./util');
const cv2 = require('./cv2');
const icons = require('./emojis');

const CAT_SHORT = { member: 'm', message: 'msg', channel: 'ch', role: 'ro', voice: 'vc', server: 'sv', automod: 'am', info: 'in', premium: 'vip', license: 'lic', template: 'tpl', security: 'sec' };
const FREE = new Set(['reason', 'text', 'note', 'message', 'words', 'nickname', 'name', 'ids', 'options', 'prize', 'expression', 'comment']);

// alias -> "category command"
const CURATED = {
  // security
  fortress: 'security fortress',
  // support
  feedback: 'support feedback', fb: 'support feedback', report: 'support report',
  // member
  b: 'member ban', banuser: 'member ban', ub: 'member unban', unbanuser: 'member unban', k: 'member kick', kickuser: 'member kick',
  sb: 'member softban', softban: 'member softban', tb: 'member tempban', tempban: 'member tempban', t: 'member timeout', timeout: 'member timeout', mute: 'member timeout',
  ut: 'member untimeout', untimeout: 'member untimeout', unmute: 'member untimeout', w: 'member warn', warn: 'member warn', uw: 'member unwarn', unwarn: 'member unwarn',
  ws: 'member warnings', warns: 'member warnings', cw: 'member clear-warnings', clearwarn: 'member clear-warnings', clearwarns: 'member clear-warnings',
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
  for (const cat of cats) for (const command of cat.commands) count.set(command.name, (count.get(command.name) || 0) + 1);
  for (const cat of cats) for (const command of cat.commands) {
    if (count.get(command.name) === 1 && !ALIAS.has(command.name)) ALIAS.set(command.name, { cat, def: command });
    const key = `${cat.name}:${command.name}`;
    if (!SHORT.has(key)) {
      let compact = command.name;
      for (let size = 1; size <= command.name.length; size += 1) {
        const candidate = command.name.slice(0, size);
        if (cat.commands.filter((entry) => entry.name.startsWith(candidate)).length === 1) { compact = candidate; break; }
      }
      const reserved = Object.values(CAT_SHORT).includes(compact) || (ALIAS.has(compact) && ALIAS.get(compact).def !== command);
      SHORT.set(key, `${CAT_SHORT[cat.name] || cat.name} ${compact}`);
    }
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
  // Prefer an exact category token over a same-named one-word alias (for example,
  // `!server lock` must route to the server category, never to an unrelated alias).
  if (CATS.has(t0) && tokens[1]) {
    const cat = CATS.get(t0); const commandToken = tokens[1].text.toLowerCase();
    let def = cat.map.get(commandToken);
    if (!def) { const matches = cat.commands.filter((command) => command.name.startsWith(commandToken)); if (matches.length === 1) def = matches[0]; }
    if (def) return { cat, def, used: 2 };
  }
  const key = Object.keys(CAT_SHORT).find((category) => CAT_SHORT[category] === t0);
  if (key && tokens[1]) {
    const cat = CATS.get(key); const commandToken = tokens[1].text.toLowerCase();
    let def = cat?.map.get(commandToken);
    if (!def && cat) { const matches = cat.commands.filter((command) => command.name.startsWith(commandToken)); if (matches.length === 1) def = matches[0]; }
    if (def) return { cat, def, used: 2 };
  }
  if (ALIAS.has(t0)) return { ...ALIAS.get(t0), used: 1 };
  return null;
}
const ordered = (opts) => [...opts.filter((o) => !(o.t === 'str' && FREE.has(o.n))), ...opts.filter((o) => o.t === 'str' && FREE.has(o.n))];
function usage(px, alias, def) { return `${px}${alias} ${ordered(def.opts).map((o) => (o.req ? `<${o.n}>` : `[${o.n}]`)).join(' ')}`.trim(); }

const idOf = (s) => { const m = /^<(?:@!?|@&|#)(\d{17,20})>$|^(\d{17,20})$/.exec(s); return m ? (m[1] || m[2]) : null; };
async function parseValue(o, text, env) {
  const { client, guild } = env;
  switch (o.t) {
    case 'user': {
      const id = idOf(text);
      if (id) return client.users.fetch(id).catch(() => null);
      // Username / display-name lookup is scoped to this server. Quoted names with
      // spaces are supported by tokenize(); ambiguous partial matches are rejected.
      const q = String(text || '').replace(/^@/, '').trim().toLowerCase();
      if (!q) return null;
      const members = guild.members;
      const matches = (collection) => [...collection.values()].filter((m) =>
        [m.user.username, m.user.globalName, m.displayName].some((name) => String(name || '').toLowerCase() === q)
      );
      let found = matches(members.cache);
      if (found.length === 1) return found[0].user;
      if (found.length > 1) return null;
      try {
        const fetched = await members.fetch({ query: q, limit: 25 });
        found = matches(fetched);
        if (found.length === 1) return found[0].user;
        if (found.length > 1) return null;
        const partial = [...fetched.values()].filter((m) =>
          [m.user.username, m.user.globalName, m.displayName].some((name) => String(name || '').toLowerCase().includes(q))
        );
        return partial.length === 1 ? partial[0].user : null;
      } catch {
        const partial = [...members.cache.values()].filter((m) =>
          [m.user.username, m.user.globalName, m.displayName].some((name) => String(name || '').toLowerCase().includes(q))
        );
        return partial.length === 1 ? partial[0].user : null;
      }
    }
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
async function askRequired(env, option, usageText) {
  const label = option.d || option.n;
  const card = (title, detail, color = 0x8b5cf6) => cv2.message([
    cv2.text(\`# \${icons.E('pk_alert_yellow') || icons.E('warning')} \${title}\n-# URANIUM · COMMAND INPUT\`),
    cv2.separator(2),
    cv2.text(\`\${icons.E('pk_star_help') || icons.E('help')} **Required detail**\n\${detail}\n\n\${icons.E('pk_question') || icons.E('info')} **What to send**\n\${option.t === 'user' ? 'Mention the member or paste their Discord user ID.' : option.t === 'role' ? 'Mention the role or type its exact name.' : option.t === 'chan' ? 'Mention a valid channel.' : option.t === 'int' ? 'Enter a whole number in the allowed range.' : 'Send the value requested by the command.'}\`),
    cv2.separator(),
    cv2.text(\`**Command format**\n\\\`\${usageText}\\\`\n-# Reply here with the value, or type \\ \`cancel\\\`. This prompt expires in 45 seconds.\`),
  ], color);
  const prompt = await env.msg.channel.send({ ...card('One more detail needed', \`Uranium needs **\${label}** before it can run this command.\`), allowedMentions: { parse: [] } });
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const collected = await env.msg.channel.awaitMessages({
        filter: (message) => message.author.id === env.msg.author.id && message.channelId === env.msg.channelId,
        max: 1, time: 45000, errors: ['time']
      });
      const answer = typeof collected?.first === 'function' ? collected.first() : Array.isArray(collected) ? collected[0] : collected?.values?.().next?.().value;
      const text = String(answer?.content || '').trim();
      if (/^(cancel|stop|abort)$/i.test(text)) throw new UserError('Command cancelled.', 'Nothing was changed.');
      if (!text) {
        await prompt.edit(card('A value is still needed', 'Please send a non-empty value, or type cancel to stop.', 0xffb84d)).catch(() => {});
        continue;
      }
      if (option.t === 'str' && FREE.has(option.n)) {
        if (option.max && text.length > option.max) {
          await prompt.edit(card('That answer is too long', \`Maximum length: **\${option.max} characters**. Please send a shorter value.\`, 0xffb84d)).catch(() => {});
          continue;
        }
        await prompt.delete().catch(() => {});
        return text;
      }
      const value = await parseValue(option, text, env);
      if (value != null) { await prompt.delete().catch(() => {}); return value; }
      const hint = option.t === 'user' ? 'Mention the member or paste their user ID.' : option.t === 'role' ? 'Mention the role or type its exact name.' : option.t === 'chan' ? 'Mention a valid channel.' : option.t === 'int' ? 'Enter a whole number in the allowed range.' : 'Check the expected value and try again.';
      await prompt.edit(card('I could not read that value', \`**\${label}**: \${hint}\nPlease try again, or type cancel.\`, 0xffb84d)).catch(() => {});
    }
    throw new UserError(\`I still need **\${label}** to run this command.\`, \`Usage: \\\`\${usageText}\\\`\`);
  } catch (error) {
    if (error instanceof UserError) throw error;
    if (error?.message === 'time') throw new UserError(\`I didn't receive **\${label}** in time.\`, 'Run the command again when you are ready.');
    throw error;
  } finally {
    await prompt.delete().catch(() => {});
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
    if (!tk) {
      if (o.req) { vals[o.n] = await askRequired(env, o, usageText); continue; }
      continue;
    }
    if (o.t === 'str' && FREE.has(o.n)) { vals[o.n] = raw.slice(tk.start).trim(); if (o.max && vals[o.n].length > o.max) throw new UserError(`**${o.n}** is too long (max ${o.max} characters)`); ti = tokens.length; continue; }
    const v = await parseValue(o, tk.text, env);
    if (v == null) {
      if (o.req) { vals[o.n] = await askRequired(env, o, usageText); ti++; continue; }
      continue;
    }
    vals[o.n] = v; ti++;
  }
  return vals;
}

function fakeInteraction(msg, member, def, vals, client) {
  let bot = null;
  const send = (p) => { const x = { ...p }; if (typeof x.flags === 'number') { x.flags &= (1 << 15); if (!x.flags) delete x.flags; } else delete x.flags; return x; };
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
