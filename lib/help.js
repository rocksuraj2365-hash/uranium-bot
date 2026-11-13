const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const cv2 = require('./cv2');
const { trunc } = require('./util');
const icons = require('./emojis');

const BASE = { member: 'mod', message: 'message', channel: 'channel', role: 'role', voice: 'voice', server: 'server', automod: 'raid', info: 'fox', ai: 'ai', music: 'note', premium: 'premium', license: 'license', utility: 'verify', community: 'community', fun: 'fun', servertools: 'case', support: 'report', template: 'template', security: 'fortress' };
const icon = (name) => icons.E(BASE[name] || 'atom');
const TINT = { member: 0xff4d6d, message: 0x5b8cff, channel: 0x39d98a, role: 0xffb84d, voice: 0x8b5cf6, server: 0x00c2ff, automod: 0xff73fa, info: 0x39d98a, ai: 0x8b5cf6, music: 0x8b5cf6, premium: 0xffd166, license: 0xffd166, utility: 0x38bdf8, community: 0x34d399, fun: 0xf472b6, servertools: 0x60a5fa, support: 0x8b5cf6, template: 0x8b5cf6, security: 0x22c55e };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const tick = String.fromCharCode(96);
const code = (s) => tick + s + tick;
const DOCS = [
  { name: 'guide', label: 'Prefix & NP guide', emoji: 'info' },
  { name: 'moderation', label: 'Moderation workflow', emoji: 'member' },
  { name: 'protection', label: 'Server protection', emoji: 'security' },
  { name: 'permissions', label: 'Permissions & setup', emoji: 'server' },
  { name: 'premium-guide', label: 'Premium & owner tools', emoji: 'premium' },
];

module.exports = async function help(c) {
  const cats = c.cats;
  const total = cats.reduce((n, x) => n + x.commands.length, 0);
  const px = c.prefix;
  const order = ['home', ...cats.map((x) => x.name), ...DOCS.map((x) => x.name)];
  const PAGE_SIZE = 7;
  let view = 'home'; let found = []; let q = ''; let commandPage = 0;
  const activeCategory = () => cats.find((x) => x.name === view);
  const isList = () => view === 'search' || !!activeCategory();
  const pageCount = () => view === 'search'
    ? Math.max(1, Math.ceil(found.length / PAGE_SIZE))
    : Math.max(1, Math.ceil((activeCategory()?.commands.length || 0) / PAGE_SIZE));
  const accessLabel = (d) => d.owner ? ' · OWNER ONLY' : d.premium ? ' · PREMIUM' : '';
  const usage = (cat, d) => {
    const short = c.short(cat, d.name);
    const full = cat + ' ' + d.name;
    return [
      '**Slash**  ' + code('/' + full),
      '**Prefix**  ' + code(px + short) + '  ·  ' + code(px + full),
      '**No-prefix**  ' + code(short) + '  ·  ' + code(full) + '  _(NP access required)_',
    ].join('\n');
  };
  const commandCard = (cat, d) => [
    '### ' + icon(cat) + ' ' + d.name + accessLabel(d),
    trunc(d.desc, 130),
    usage(cat, d),
  ].join('\n');

  const menu = (off) => cv2.select('help:cat', '☢️ Open a help page or command category…', [
    { label: 'Control Center', value: 'home', emoji: cv2.emoji(icon('info')), default: view === 'home' },
    ...cats.map((x) => ({ label: cap(x.name), value: x.name, emoji: cv2.emoji(icon(x.name)), description: trunc(x.description, 90), default: view === x.name })),
    ...DOCS.map((x) => ({ label: x.label, value: x.name, emoji: cv2.emoji(icon(x.emoji)), default: view === x.name })),
  ], off);

  const topButtons = (off) => cv2.row([
    cv2.button('help:home', 'Overview', 1, icon('info')),
    cv2.button('help:prev', 'Previous page', 2, '◀️'),
    cv2.button('help:next', 'Next page', 2, '▶️'),
    cv2.button('help:search', 'Find command', 3, icons.E('search')),
    cv2.button('help:close', 'Close', 4, icons.E('cross')),
  ].map((b, i) => ({ ...b, disabled: !!off || (i === 0 && view === 'home') })));

  const pageButtons = (off) => cv2.row([
    { ...cv2.button('help:cmdprev', 'Previous commands', 2, '◀️'), disabled: !!off || !isList() || commandPage === 0 },
    { ...cv2.button('help:cmdnext', 'More commands', 2, '▶️'), disabled: !!off || !isList() || commandPage >= pageCount() - 1 },
  ]);

  const docContent = () => {
    if (view === 'guide') return {
      color: 0x5b8cff,
      parts: [
        cv2.text('# ' + icon('info') + ' Prefix & No-prefix guide\nUse whichever command style suits your server. All published commands have full-name prefix routes and generated short forms.'),
        cv2.separator(),
        cv2.text('## Prefix commands\nUse your server prefix (default ' + code(px) + ').\n\n**Short form**\n' + code(px + 'b @member reason') + '\n' + code(px + 't @member 10m reason') + '\n' + code(px + 'p 25') + '\n\n**Full form**\n' + code(px + 'member ban @member reason') + '\n' + code(px + 'member timeout @member 10m reason') + '\n' + code(px + 'message purge 25')),
        cv2.separator(),
        cv2.text('## No-prefix commands\nAfter the owner grants No-prefix access, send the command without ' + code(px) + '.\n\n' + code('b @member reason') + '\n' + code('member ban @member reason') + '\n' + code('ch lock') + '\n\n**Access controls**\nThe owner manages access with ' + code(px + 'np add @member') + ', ' + code(px + 'np remove @member') + ', and ' + code(px + 'np list') + '. No-prefix does not grant Premium or owner permissions.'),
        cv2.separator(),
        cv2.text('## Slash commands\nUse Discord’s / picker, then select the category and action. Slash and prefix forms use the same command handler and permission checks.'),
      ],
    };
    if (view === 'moderation') return {
      color: TINT.member,
      parts: [
        cv2.text('# ' + icon('member') + ' Moderation workflow\nUse the least disruptive action that solves the problem, and keep reasons clear for the audit trail.'),
        cv2.separator(),
        cv2.text('## Suggested sequence\n**1 · Warn**\n' + code(px + 'w @member reason') + '\n\n**2 · Timeout**\n' + code(px + 't @member 10m reason') + '\n\n**3 · Kick or ban**\n' + code(px + 'k @member reason') + '  ·  ' + code(px + 'b @member reason') + '\n\nUse Undo when it is offered and the action is reversible.'),
        cv2.separator(),
        cv2.text('## Records & review\n• ' + code(px + 'cases') + ' — review moderation cases\n• ' + code(px + 'ws @member') + ' — inspect warnings\n• ' + code(px + 'notes @member') + ' — private moderator notes\n• ' + code(px + 'modlog #channel') + ' — configure the mod-log channel'),
      ],
    };
    if (view === 'protection') return {
      color: TINT.security,
      parts: [
        cv2.text('# ' + icon('security') + ' Server protection\nLayer Discord AutoMod with Uranium Fortress checks. No bot can promise zero raids, so keep Discord’s own safety controls enabled too.'),
        cv2.separator(),
        cv2.text('## Fortress\n' + code(px + 'fortress on') + ' — enable protection\n' + code(px + 'fortress status') + ' — inspect current state\n' + code(px + 'fortress off') + ' — disable and restore the saved verification setting when applicable\n\nFortress uses AutoMod, message-flood checks, and a join-burst response. It uses timeouts and message deletion rather than mass-banning members.'),
        cv2.separator(),
        cv2.text('## AutoMod setup\n• ' + code(px + 'spam') + ' — configure spam protection\n• ' + code(px + 'ms') + ' — mention-spam protection\n• ' + code(px + 'pall') + ' — apply the combined preset\n• ' + code(px + 'rules') + ' — inspect configured rules\n\nCheck role hierarchy, permissions, and the mod-log channel after setup. DM notices depend on each member’s privacy settings.'),
      ],
    };
    if (view === 'permissions') return {
      color: TINT.server,
      parts: [
        cv2.text('# ' + icon('server') + ' Permissions & setup\nUranium checks both the moderator’s permissions and the bot’s permissions before running actions.'),
        cv2.separator(),
        cv2.text('## First checks\n• ' + code(px + 'check') + ' — review required bot permissions\n• ' + code(px + 'bperms') + ' — inspect the bot’s permissions here\n• ' + code(px + 'cfg') + ' — inspect server configuration\n• ' + code(px + 'modlog') + ' — configure moderation logs'),
        cv2.separator(),
        cv2.text('## Role hierarchy\nMove Uranium’s highest role above the members and roles it needs to manage. Discord still blocks actions against higher roles, server owners, and protected integrations. Grant only the permissions the server actually needs.'),
        cv2.separator(),
        cv2.text('## If a command fails\nRead the permission error, check the bot role position, confirm the target is manageable, and verify the required Discord intent is enabled.'),
      ],
    };
    return {
      color: TINT.premium,
      parts: [
        cv2.text('# ' + icon('premium') + ' Premium & owner tools\nPremium access and no-prefix access are separate permissions. Having one does not automatically grant the other.'),
        cv2.separator(),
        cv2.text('## Premium features\nInteractive polls, giveaways, role panels, ticket panels, server tools, backups, moderation history, and additional customization are available where marked Premium in the command list.'),
        cv2.separator(),
        cv2.text('## No-prefix access\n' + code(px + 'np add @member') + ' · grant no-prefix routing\n' + code(px + 'np remove @member') + ' · revoke access\n' + code(px + 'np list') + ' · review access\n\nThe owner controls the no-prefix allow-list. No-prefix does not bypass command permissions, Premium checks, or owner-only restrictions.'),
        cv2.separator(),
        cv2.text('## Owner-only actions\nOwner-only commands remain restricted to configured bot owners. Never share bot tokens, database passwords, or dashboard secrets with moderators.'),
      ],
    };
  };

  const content = () => {
    if (view === 'home') {
      const categoryLines = cats.map((x) => icon(x.name) + ' **' + cap(x.name) + '**  ·  ' + x.commands.length + ' commands').join('\n');
      return {
        color: 0x8b5cf6,
        parts: [
          cv2.text('# ☢️ URANIUM · CONTROL CENTER\n### Moderation • Protection • Community\nA guided command library with interactive pages, searchable actions, and three ways to run commands.\n\n**' + total + ' commands** across **' + cats.length + ' categories**'),
          cv2.separator(),
          cv2.text('## ' + icon('info') + ' Command styles\n**Slash:** ' + code('/member ban') + '\n**Prefix:** ' + code(px + 'b') + ' or ' + code(px + 'member ban') + '\n**No-prefix:** ' + code('b') + ' or ' + code('member ban') + ' _(requires access)_'),
          cv2.separator(),
          cv2.text('## ' + icon('server') + ' Browse categories\n' + categoryLines),
          cv2.separator(),
          cv2.text('## ' + icon('utility') + ' Quick actions\n' + code(px + 'help') + ' · open this control center\n' + code(px + 'ping') + ' · check response speed\n' + code(px + 'check') + ' · verify bot permissions\n' + code(px + 'fortress status') + ' · inspect server protection'),
        ],
      };
    }
    if (view === 'search') {
      const entries = found.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE);
      const rows = entries.map((h) => commandCard(h.cat, h.d)).join('\n\n────────────\n\n');
      return {
        color: 0xffb84d,
        parts: [
          cv2.text('# ' + icons.E('search') + ' Search results\n**' + found.length + ' match(es)** for “' + trunc(q, 40) + '”\nPage **' + (commandPage + 1) + ' / ' + pageCount() + '**'),
          cv2.separator(),
          cv2.text(rows || '_No matching commands. Try a shorter keyword._'),
        ],
      };
    }
    const category = activeCategory();
    if (category) {
      const entries = category.commands.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE);
      const rows = entries.map((d) => commandCard(category.name, d)).join('\n\n────────────\n\n');
      return {
        color: TINT[category.name] || 0x5b8cff,
        parts: [
          cv2.text('# ' + icon(category.name) + ' ' + cap(category.name) + ' commands\n' + trunc(category.description, 180) + '\n\n**' + category.commands.length + ' commands**  ·  Page **' + (commandPage + 1) + ' / ' + pageCount() + '**'),
          cv2.separator(),
          cv2.text(rows || '_No commands in this category._'),
        ],
      };
    }
    return docContent();
  };

  const render = (off = false) => {
    const current = content();
    return cv2.message([...current.parts, cv2.separator(), cv2.row([menu(off)]), topButtons(off), pageButtons(off)], current.color);
  };

  await c.i.editReply(cv2.message([cv2.text('# ' + icon('info') + ' Opening Uranium Control Center\nLoading command pages…')], 0x8b5cf6));
  const msg = await c.i.editReply(render());
  const col = msg.createMessageComponentCollector({ time: 300000, filter: (b) => b.customId.startsWith('help:') });
  col.on('collect', async (b) => {
    if (b.user.id !== c.i.user.id) return b.reply(cv2.ephemeralMessage([cv2.text('# 🔒 Help controls\nOnly the member who opened this panel can navigate it. Run /info help to open your own panel.')], 0x8b5cf6));
    const key = b.customId.split(':')[1];
    if (b.isStringSelectMenu()) {
      view = b.values[0]; commandPage = 0;
      return b.update(render());
    }
    if (key === 'close') { col.stop('closed'); return b.update(render(true)); }
    if (key === 'search') {
      await b.showModal(new ModalBuilder().setCustomId('help:modal').setTitle('Find a Uranium command').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Search by command, action, or description').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true))
      ));
      const modal = await b.awaitModalSubmit({ time: 60000, filter: (x) => x.customId === 'help:modal' && x.user.id === b.user.id }).catch(() => null);
      if (!modal) return;
      q = modal.fields.getTextInputValue('q').trim().toLowerCase();
      commandPage = 0; found = [];
      for (const cat of cats) for (const def of cat.commands) {
        const short = c.short(cat.name, def.name);
        if ((cat.name + ' ' + def.name + ' ' + def.desc + ' ' + short).toLowerCase().includes(q)) found.push({ cat: cat.name, d: def });
      }
      view = 'search';
      await modal.deferUpdate();
      return c.i.editReply(render());
    }
    if (key === 'cmdprev' || key === 'cmdnext') {
      commandPage = Math.max(0, Math.min(pageCount() - 1, commandPage + (key === 'cmdnext' ? 1 : -1)));
      return b.update(render());
    }
    const idx = order.indexOf(view);
    view = key === 'home' ? 'home' : key === 'next' ? order[(idx + 1) % order.length] : order[(idx - 1 + order.length) % order.length];
    commandPage = 0;
    return b.update(render());
  });
  col.on('end', () => c.i.editReply(render(true)).catch(() => {}));
  return { handled: true };
};
