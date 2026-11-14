// Uranium Control Center v2 - interactive help built with Discord Components V2.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const cv2 = require('./cv2');
const util = require('./util');
const icons = require('./emojis');

const trunc = util.trunc;
const E = (n) => { const v = icons.E(n); return v === '◆' ? '' : v; };
const PK = (n) => E('pk_' + n);
const BASE = { member: 'mod', message: 'message', channel: 'channel', role: 'role', voice: 'voice', server: 'server', automod: 'raid', info: 'fox', ai: 'ai', music: 'note', premium: 'premium', license: 'license', utility: 'verify', community: 'community', fun: 'fun', servertools: 'case', support: 'report', template: 'template', security: 'fortress' };
const CAT_PK = { member: 'role_moderator', message: 'announce', channel: 'link', role: 'role_management', server: 'role_admin', automod: 'alert_yellow', info: 'star_help', ai: 'sparkles', premium: 'rainbow_diamond', license: 'role_vip', utility: 'role_verified', community: 'handshake', fun: 'wumpus_wave', servertools: 'role_developer', support: 'role_support', security: 'support_team', template: 'ticket_pass' };
const icon = (name) => PK(CAT_PK[name]) || E(BASE[name] || 'atom') || '☢️';
const TINT = { member: 0xff4d6d, message: 0x5b8cff, channel: 0x39d98a, role: 0xffb84d, voice: 0x8b5cf6, server: 0x00c2ff, automod: 0xff73fa, info: 0x39d98a, ai: 0x8b5cf6, music: 0x8b5cf6, premium: 0xffd166, license: 0xffd166, utility: 0x38bdf8, community: 0x34d399, fun: 0xf472b6, servertools: 0x60a5fa, support: 0x8b5cf6, template: 0x8b5cf6, security: 0x22c55e };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tick = String.fromCharCode(96);
const code = (s) => tick + s + tick;
const lines = (...a) => a.join('\n');

const DOCS = [
  { name: 'quickstart', label: 'Quick start', emoji: 'bolt', tint: 0xffd166 },
  { name: 'guide', label: 'Prefix & No-prefix guide', emoji: 'info', tint: 0x5b8cff },
  { name: 'moderation', label: 'Moderation workflow', emoji: 'member', tint: 0xff4d6d },
  { name: 'protection', label: 'Server protection', emoji: 'security', tint: 0x22c55e },
  { name: 'permissions', label: 'Permissions & setup', emoji: 'server', tint: 0x00c2ff },
  { name: 'premium-guide', label: 'Premium & owner tools', emoji: 'premium', tint: 0xffd166 },
];
const DOC_PK = { quickstart: 'lets_go', guide: 'question', moderation: 'role_moderator', protection: 'alert_yellow', permissions: 'role_admin', 'premium-guide': 'rainbow_diamond' };
const docIcon = (x) => PK(DOC_PK[x.name]) || (BASE[x.emoji] ? icon(x.emoji) : E(x.emoji) || '📘');
const FILTERS = [{ id: 'all', label: 'All' }, { id: 'free', label: 'Standard' }, { id: 'premium', label: 'Premium' }, { id: 'owner', label: 'Owner' }];
const TYPE_LABEL = { user: 'member', str: 'text', int: 'number', bool: 'yes / no', chan: 'channel', role: 'role' };
const accessOf = (d) => (d.owner ? 'owner' : d.premium ? 'premium' : 'free');
const badge = (d) => (d.owner ? '  ' + (E('crown') || '👑') + ' **OWNER**' : d.premium ? '  ' + (PK('rainbow_diamond') || E('premium') || '💎') + ' **PREMIUM**' : '');
const cmdIcon = (cat, d) => E(d.name) || icon(cat);
const argText = (d) => (d.opts || []).map((o) => (o.req ? '<' + o.n + '>' : '[' + o.n + ']')).join(' ');
const withArgs = (base, d) => { const a = argText(d); return a ? base + ' ' + a : base; };
const permLabel = (bit) => { try { return typeof util.permName === 'function' ? util.permName(bit) : 'Moderator permission'; } catch { return 'Moderator permission'; } };

const ZODIAC = [['capricorn', 1, 19], ['aquarius', 2, 18], ['pisces', 3, 20], ['aries', 4, 19], ['taurus', 5, 20], ['gemini', 6, 20], ['cancer', 7, 22], ['leo', 8, 22], ['virgo', 9, 22], ['libra', 10, 22], ['scorpio', 11, 21], ['sagittarius', 12, 21], ['capricorn', 12, 31]];
const zodiacNow = () => {
  const d = new Date(); const m = d.getUTCMonth() + 1; const day = d.getUTCDate();
  for (const [name, mm, dd] of ZODIAC) if (m < mm || (m === mm && day <= dd)) return name;
  return 'capricorn';
};
const BASE_URL = (() => { try { return new URL(process.env.PUBLIC_BASE_URL || 'https://uranium-web.onrender.com').origin; } catch { return null; } })();

module.exports = async function help(c) {
  const cats = c.cats;
  const px = c.prefix;
  const client = c.i.client;
  const order = ['home', ...cats.map((x) => x.name), ...DOCS.map((x) => x.name)];
  const PAGE_SIZE = 6;
  const TIPS = [
    'Run ' + code(px + 'check') + ' after inviting Uranium to confirm it has the permissions it needs.',
    'Move Uranium’s highest role above the roles it should manage, or Discord will block those actions.',
    'Short prefix forms save time: ' + code(px + 'b @member reason') + ' works like ' + code(px + 'member ban @member reason') + '.',
    'Set a mod-log with ' + code(px + 'modlog #channel') + ' so every action leaves an audit trail.',
    'Turn on ' + code(px + 'fortress on') + ' for layered raid and spam protection.',
    'Use ' + code(px + 'cases') + ' to review past moderation actions.',
    'Press **Find** and type a keyword like “timeout” or “lock” to jump straight to a command.',
    'Open any command from the menu to see its options, permissions and related commands.',
    'Use **Filter** to show only Standard, Premium or Owner commands inside a category.',
  ];

  let view = 'home'; let back = 'home'; let commandPage = 0; let filter = 'all'; let tip = 0;
  let found = []; let q = ''; let sel = null; let detailList = [];

  const activeCategory = () => cats.find((x) => x.name === view);
  const passes = (d) => filter === 'all' || accessOf(d) === filter;
  const listNow = () => {
    if (view === 'search') return found.filter((x) => passes(x.d));
    const cat = activeCategory();
    return cat ? cat.commands.filter(passes).map((d) => ({ cat: cat.name, d })) : [];
  };
  const isList = () => view === 'search' || !!activeCategory();
  const pageCount = () => Math.max(1, Math.ceil(listNow().length / PAGE_SIZE));
  const pageEntries = () => listNow().slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE);
  const ctxView = () => (view === 'cmd' && sel ? sel.cat : view);
  const filterLabel = () => FILTERS.find((f) => f.id === filter).label;

  const avatar = (() => { try { return client.user.displayAvatarURL({ extension: 'png', size: 256 }); } catch { return null; } })();
  const hero = (body) => (avatar ? cv2.section([body], cv2.thumbnail(avatar, 'Uranium')) : cv2.text(body));
  const uptime = () => { const s = Math.floor(process.uptime()); return Math.floor(s / 3600) + 'h ' + (Math.floor(s / 60) % 60) + 'm'; };
  const pingText = () => (client.ws && client.ws.ping >= 0 ? Math.round(client.ws.ping) + ' ms' : '—');

  /* ---------- components ---------- */
  const catMenu = (off) => cv2.select('help:cat', '📚 Browse categories & guides…', [
    ...cats.map((x) => ({ label: cap(x.name), value: x.name, emoji: cv2.emoji(icon(x.name)), description: trunc(x.description, 90) || undefined, default: ctxView() === x.name })),
    ...DOCS.map((x) => ({ label: x.label, value: x.name, emoji: cv2.emoji(docIcon(x)), default: view === x.name })),
  ], off);

  const cmdMenu = (off) => cv2.select('help:cmd', '🔎 Open a command for full usage…', pageEntries().map(({ cat, d }) => ({
    label: trunc(d.name + (d.owner ? ' · Owner' : d.premium ? ' · Premium' : ''), 100),
    value: cat + '|' + d.name,
    emoji: cv2.emoji(cmdIcon(cat, d)),
    description: trunc(d.desc, 90) || undefined,
  })), off);

  const navRow = (off) => cv2.row([
    { ...cv2.button('help:home', 'Home', 1, E('home') || '🏠'), disabled: !!off || view === 'home' },
    { ...cv2.button('help:prev', '', 2, '◀️'), disabled: !!off },
    { ...cv2.button('help:next', '', 2, '▶️'), disabled: !!off },
    { ...cv2.button('help:search', 'Find', 3, E('search') || '🔎'), disabled: !!off },
    { ...cv2.button('help:close', 'Close', 4, E('cross') || '✖️'), disabled: !!off },
  ]);

  const pageRow = (off) => cv2.row([
    { ...cv2.button('help:cmdprev', 'Prev page', 2, '⬅️'), disabled: !!off || commandPage === 0 },
    { ...cv2.button('help:cmdnext', 'Next page', 2, '➡️'), disabled: !!off || commandPage >= pageCount() - 1 },
    { ...cv2.button('help:filter', 'Filter: ' + filterLabel(), 2, E('settings') || '⚙️'), disabled: !!off },
  ]);

  const detailRow = (off) => cv2.row([
    { ...cv2.button('help:dprev', 'Prev', 2, '⬅️'), disabled: !!off },
    { ...cv2.button('help:back', 'Back to list', 1, '↩️'), disabled: !!off },
    { ...cv2.button('help:dnext', 'Next', 2, '➡️'), disabled: !!off },
  ]);

  const homeRow = (off) => cv2.row([
    { ...cv2.button('help:tip', 'New tip', 2, PK('sparkles') || '💡'), disabled: !!off },
    ...(BASE_URL ? [
      { ...cv2.linkButton('Dashboard', BASE_URL + '/dashboard.html', E('dashboard') || '🖥️'), disabled: !!off },
      { ...cv2.linkButton('Docs', BASE_URL + '/docs.html', PK('link') || '📖'), disabled: !!off },
      { ...cv2.linkButton('Support', BASE_URL + '/support.html', PK('support_team') || E('support') || '💬'), disabled: !!off },
    ] : []),
  ]);

  /* ---------- content ---------- */
  const card = (cat, d) => lines(
    '### ' + cmdIcon(cat, d) + ' ' + d.name + badge(d),
    trunc(d.desc, 110),
    '-# ' + code('/' + cat + ' ' + d.name) + '  ·  ' + code(px + c.short(cat, d.name)),
  );

  const docContent = () => {
    const doc = DOCS.find((x) => x.name === view);
    const head = (title, sub) => cv2.text('# ' + docIcon(doc) + ' ' + title + '\n' + sub);
    const S = () => cv2.separator();
    if (view === 'quickstart') return {
      color: doc.tint,
      parts: [
        head('Quick start', 'From invite to a protected server in a few steps.'),
        S(),
        cv2.text(lines('## 1 · Check permissions', code(px + 'check') + ' — review the permissions Uranium needs', code(px + 'bperms') + ' — see what Uranium can do in this channel', '', 'Then move Uranium’s highest role above the roles it should manage.')),
        S(),
        cv2.text(lines('## 2 · Set up logs and protection', code(px + 'modlog #channel') + ' — choose the mod-log channel', code(px + 'fortress on') + ' — enable layered server protection', code(px + 'spam') + ' · ' + code(px + 'ms') + ' · ' + code(px + 'pall') + ' — AutoMod presets')),
        S(),
        cv2.text(lines('## 3 · Explore', 'Open any category from the menu, press **Find** to search, or read the **Prefix & No-prefix guide** to pick your favourite command style.')),
      ],
    };
    if (view === 'guide') return {
      color: doc.tint,
      parts: [
        head('Prefix & No-prefix guide', 'Pick the command style that suits your server. All styles use the same handlers and permission checks.'),
        S(),
        cv2.text(lines('## ⌨️ Prefix commands', 'Use your server prefix (default ' + code(px) + ').', '', '**Short form**', code(px + 'b @member reason'), code(px + 't @member 10m reason'), code(px + 'p 25'), '', '**Full form**', code(px + 'member ban @member reason'), code(px + 'member timeout @member 10m reason'), code(px + 'message purge 25'))),
        S(),
        cv2.text(lines('## ⚡ No-prefix commands', 'After the owner grants No-prefix access, send the command without ' + code(px) + '.', '', code('b @member reason'), code('member ban @member reason'), code('ch lock'), '', '**Access controls**', 'The owner manages access with ' + code(px + 'np add @member') + ', ' + code(px + 'np remove @member') + ' and ' + code(px + 'np list') + '. No-prefix does not grant Premium or owner permissions.', '', '## 🧭 Slash commands', 'Use Discord’s / picker, then choose the category and action.')),
      ],
    };
    if (view === 'moderation') return {
      color: doc.tint,
      parts: [
        head('Moderation workflow', 'Use the least disruptive action that solves the problem, and keep reasons clear for the audit trail.'),
        S(),
        cv2.text(lines('## Suggested sequence', '**1 · Warn**  ' + code(px + 'w @member reason'), '**2 · Timeout**  ' + code(px + 't @member 10m reason'), '**3 · Kick or ban**  ' + code(px + 'k @member reason') + '  ·  ' + code(px + 'b @member reason'), '', 'Use **Undo** when it is offered and the action is reversible.')),
        S(),
        cv2.text(lines('## Records & review', '• ' + code(px + 'cases') + ' — review moderation cases', '• ' + code(px + 'ws @member') + ' — inspect warnings', '• ' + code(px + 'notes @member') + ' — private moderator notes', '• ' + code(px + 'modlog #channel') + ' — configure the mod-log channel')),
      ],
    };
    if (view === 'protection') return {
      color: doc.tint,
      parts: [
        head('Server protection', 'Layer Discord AutoMod with Uranium Fortress checks. No bot can promise zero raids, so keep Discord’s own safety controls on too.'),
        S(),
        cv2.text(lines('## 🏰 Fortress', code(px + 'fortress on') + ' — enable protection', code(px + 'fortress status') + ' — inspect the current state', code(px + 'fortress off') + ' — disable it and restore the saved verification setting when applicable', '', 'Fortress uses AutoMod, message-flood checks and a join-burst response. It uses timeouts and message deletion rather than mass-banning members.')),
        S(),
        cv2.text(lines('## 🚨 AutoMod setup', '• ' + code(px + 'spam') + ' — spam protection', '• ' + code(px + 'ms') + ' — mention-spam protection', '• ' + code(px + 'pall') + ' — combined preset', '• ' + code(px + 'rules') + ' — inspect configured rules', '', 'After setup, check role hierarchy, permissions and the mod-log channel. DM notices depend on each member’s privacy settings.')),
      ],
    };
    if (view === 'permissions') return {
      color: doc.tint,
      parts: [
        head('Permissions & setup', 'Uranium checks both the moderator’s permissions and its own before running an action.'),
        S(),
        cv2.text(lines('## ✅ First checks', '• ' + code(px + 'check') + ' — review required bot permissions', '• ' + code(px + 'bperms') + ' — inspect the bot’s permissions here', '• ' + code(px + 'cfg') + ' — inspect server configuration', '• ' + code(px + 'modlog') + ' — configure moderation logs')),
        S(),
        cv2.text(lines('## 🪜 Role hierarchy', 'Move Uranium’s highest role above the members and roles it needs to manage. Discord still blocks actions against higher roles, server owners and protected integrations. Grant only the permissions the server actually needs.', '', '## 🛠️ If a command fails', 'Read the permission error, check the bot role position, confirm the target is manageable, and verify the required Discord intent is enabled.')),
      ],
    };
    return {
      color: doc.tint,
      parts: [
        head('Premium & owner tools', 'Premium access and No-prefix access are separate permissions. Having one does not grant the other.'),
        S(),
        cv2.text(lines('## Premium features', 'Interactive polls, giveaways, role panels, ticket panels, server tools, backups, moderation history and extra customization are available where a command is marked Premium.')),
        S(),
        cv2.text(lines('## No-prefix access', code(px + 'np add @member') + ' — grant no-prefix routing', code(px + 'np remove @member') + ' — revoke access', code(px + 'np list') + ' — review access', '', 'The owner controls the allow-list. No-prefix never bypasses command permissions, Premium checks or owner-only limits.', '', '## 👑 Owner-only actions', 'Owner-only commands stay restricted to configured bot owners. Never share bot tokens, database passwords or dashboard secrets with moderators.')),
      ],
    };
  };

  const detailContent = () => {
    const cat = cats.find((x) => x.name === sel.cat);
    const d = sel.d;
    const args = argText(d);
    const slash = withArgs('/' + sel.cat + ' ' + d.name, d);
    const shortRoute = c.short(sel.cat, d.name);
    const optLines = (d.opts || []).slice(0, 8).map((o) => '• **' + o.n + '** · ' + (TYPE_LABEL[o.t] || o.t) + ' · ' + (o.req ? 'required' : 'optional') + ' — ' + trunc(o.d, 80));
    const who = d.owner ? 'Only configured bot owners can run this command.' : d.premium ? 'Needs Premium access, which only the bot owner can grant.' : 'Any member who has the required permission can run this.';
    const permLine = d.perm ? '\n**Needs permission:** ' + permLabel(d.perm) : '';
    const others = cat ? cat.commands.filter((x) => x !== d).slice(0, 8).map((x) => code(x.name)).join(' ') : '';
    return {
      color: TINT[sel.cat] || 0x5b8cff,
      parts: [
        cv2.text(lines('# ' + cmdIcon(sel.cat, d) + ' ' + d.name + badge(d), '-# ' + icon(sel.cat) + ' ' + cap(sel.cat) + ' category', trunc(d.desc, 400))),
        cv2.separator(),
        cv2.text(lines(
          '## ' + (E('bolt') || '⚡') + ' Usage',
          '**Slash**  ' + code(slash),
          '**Prefix**  ' + code(px + withArgs(shortRoute, d)) + '  ·  ' + code(px + withArgs(sel.cat + ' ' + d.name, d)),
          '**No-prefix**  ' + code(withArgs(shortRoute, d)) + '  ·  ' + code(withArgs(sel.cat + ' ' + d.name, d)) + '  _(needs access)_',
          args ? '\n## Options\n' + optLines.join('\n') : '',
        )),
        cv2.text(lines('## 🔐 Access', who + permLine, others ? '\n**More in ' + cap(sel.cat) + '**\n' + others : '')),
        cv2.separator(),
      ],
    };
  };

  const content = () => {
    if (view === 'home') {
      const library = cats.map((x) => icon(x.name) + ' **' + cap(x.name) + '** — ' + trunc(x.description, 48)).join('\n');
      return {
        color: 0x8b5cf6,
        parts: [
          hero(lines('# ' + (E('atom') || '☢️') + ' URANIUM  ·  CONTROL CENTER', '-# Moderation  •  Protection  •  Community', 'Your server’s guardian, one tap away. Browse a category, open any command for full usage, or search by keyword.', '', '📡 **' + pingText() + '**   ⏱️ **' + uptime() + '** online')),
          cv2.separator(),
          cv2.text(lines('## ' + (E('bolt') || '⚡') + ' Run commands your way', '**Slash**  ' + code('/member ban'), '**Prefix**  ' + code(px + 'b') + ' or ' + code(px + 'member ban'), '**No-prefix**  ' + code('b') + ' or ' + code('member ban') + '  _(needs access)_')),
          cv2.separator(),
          cv2.text(lines('## ' + icon('server') + ' Command library', library)),
          cv2.separator(),
          cv2.text('-# ' + (PK('zodiac_' + zodiacNow()) || '✨') + ' **' + cap(zodiacNow()) + ' season**  ·  💡 **Tip** · ' + TIPS[tip % TIPS.length]),
        ],
      };
    }
    if (view === 'cmd' && sel) return detailContent();
    if (isList()) {
      const entries = pageEntries();
      const isSearch = view === 'search';
      const cat = activeCategory();
      const headText = isSearch
        ? lines('# ' + (E('search') || '🔎') + ' Search results', 'Matches for “' + trunc(q, 40) + '”' + (filter !== 'all' ? '  ·  Filter: ' + filterLabel() : ''))
        : lines('# ' + icon(cat.name) + ' ' + cap(cat.name), trunc(cat.description, 180) + (filter !== 'all' ? '\n-# Filter: ' + filterLabel() : ''));
      const body = entries.length
        ? entries.map(({ cat: cn, d }) => card(cn, d)).join('\n\n')
        : (isSearch && !found.length ? '_No commands matched. Try a shorter keyword._' : '_Nothing here for this filter. Press **Filter** to change it._');
      return {
        color: isSearch ? 0xffb84d : TINT[cat.name] || 0x5b8cff,
        parts: [
          cv2.text(headText),
          cv2.separator(),
          cv2.text(body),
          cv2.text('-# ' + (PK('arrow_flash') || '⬇️') + ' Page ' + (commandPage + 1) + ' / ' + pageCount() + '  ·  Pick a command in the menu for full usage and options'),
          cv2.separator(),
        ],
      };
    }
    return docContent();
  };

  const render = (off = false) => {
    const cur = content();
    const kids = [...cur.parts];
    kids.push(cv2.row([catMenu(off)]));
    if (view === 'home') { kids.push(navRow(off)); kids.push(homeRow(off)); }
    else if (view === 'cmd' && sel) { kids.push(detailRow(off)); kids.push(navRow(off)); }
    else if (isList()) { if (pageEntries().length) kids.push(cv2.row([cmdMenu(off)])); kids.push(pageRow(off)); kids.push(navRow(off)); }
    else kids.push(navRow(off));
    return cv2.message(kids, cur.color);
  };

  /* ---------- interaction ---------- */
  const msg = await c.i.editReply(render());
  const col = msg.createMessageComponentCollector({ time: 900000, idle: 240000, filter: (b) => b.customId.startsWith('help:') });

  col.on('collect', async (b) => {
    try {
      if (b.user.id !== c.i.user.id) {
        return b.reply(cv2.ephemeralMessage([cv2.text('# 🔒 Help controls\nOnly the member who opened this panel can use it. Run the help command to open your own.')], 0x8b5cf6));
      }
      const key = b.customId.split(':')[1];

      if (b.isStringSelectMenu()) {
        if (key === 'cat') { view = b.values[0]; commandPage = 0; sel = null; return b.update(render()); }
        if (key === 'cmd') {
          const [cn, dn] = String(b.values[0]).split('|');
          const cat = cats.find((x) => x.name === cn);
          const d = cat && cat.commands.find((x) => x.name === dn);
          if (!d) return b.update(render());
          detailList = listNow();
          back = view; sel = { cat: cn, d }; view = 'cmd';
          return b.update(render());
        }
      }

      if (key === 'close') { col.stop('closed'); return b.update(render(true)); }

      if (key === 'search') {
        await b.showModal(new ModalBuilder().setCustomId('help:modal').setTitle('Find a Uranium command').addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Search by command, action or description').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true)),
        ));
        const modal = await b.awaitModalSubmit({ time: 60000, filter: (x) => x.customId === 'help:modal' && x.user.id === b.user.id }).catch(() => null);
        if (!modal) return;
        q = modal.fields.getTextInputValue('q').trim().toLowerCase();
        const terms = q.split(/\s+/).filter(Boolean);
        found = [];
        for (const cat of cats) for (const d of cat.commands) {
          const hay = (cat.name + ' ' + d.name + ' ' + d.desc + ' ' + c.short(cat.name, d.name)).toLowerCase();
          if (terms.every((t) => hay.includes(t))) {
            const n = d.name.toLowerCase();
            found.push({ cat: cat.name, d, score: n === q ? 0 : n.startsWith(q) ? 1 : 2 });
          }
        }
        found.sort((x, y) => x.score - y.score);
        view = 'search'; commandPage = 0; sel = null;
        await modal.deferUpdate();
        return c.i.editReply(render());
      }

      if (key === 'cmdprev' || key === 'cmdnext') {
        commandPage = Math.max(0, Math.min(pageCount() - 1, commandPage + (key === 'cmdnext' ? 1 : -1)));
        return b.update(render());
      }
      if (key === 'filter') {
        filter = FILTERS[(FILTERS.findIndex((f) => f.id === filter) + 1) % FILTERS.length].id;
        commandPage = 0;
        return b.update(render());
      }
      if (key === 'tip') { tip = (tip + 1) % TIPS.length; return b.update(render()); }

      if ((key === 'dprev' || key === 'dnext') && sel) {
        const n = detailList.length;
        if (n) {
          const idx = detailList.findIndex((x) => x.d === sel.d);
          sel = detailList[(idx + (key === 'dnext' ? 1 : -1) + n) % n];
        }
        return b.update(render());
      }
      if (key === 'back') {
        const idx = sel ? detailList.findIndex((x) => x.d === sel.d) : -1;
        if (idx >= 0) commandPage = Math.floor(idx / PAGE_SIZE);
        view = back; sel = null;
        return b.update(render());
      }

      const base = view === 'cmd' && sel ? sel.cat : view;
      let idx = order.indexOf(base); if (idx < 0) idx = 0;
      view = key === 'home' ? 'home' : key === 'next' ? order[(idx + 1) % order.length] : order[(idx - 1 + order.length) % order.length];
      commandPage = 0; sel = null;
      return b.update(render());
    } catch (err) {
      console.error('[help] Component interaction failed:', err);
      const fallback = cv2.ephemeralMessage([
        cv2.text('# ⚠️ Help panel control failed\\nThat control could not be processed. Run `/info help` or `!help` to open a fresh panel.'),
      ], 0xffb84d);
      if (b.deferred || b.replied) {
        await b.editReply(fallback).catch(() => {});
      } else {
        await b.reply(fallback).catch(async () => {
          await c.i.editReply(cv2.message([cv2.text('# ⚠️ Help panel error\\nPlease reopen the help panel with `/info help` or `!help`.')], 0xffb84d)).catch(() => {});
        });
      }
    }
  });
  col.on('end', (_, reason) => { if (reason !== 'closed') c.i.editReply(render(true)).catch(() => {}); });
  return { handled: true };
};
