const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const cv2 = require('./cv2');
const { trunc } = require('./util');

const BASE = { member: '👤', message: '💬', channel: '📺', role: '🏷️', voice: '🔊', server: '🏰', automod: '🛡️', info: 'ℹ️', ai: '🤖', music: '🎵', premium: '💎', license: '🔑', utility: '🧮', community: '🌐', fun: '🎮', servertools: '🧰', support: '📨', template: '🧩', security: '🛡️' };
const TINT = { member: 0xff4d6d, message: 0x5b8cff, channel: 0x39d98a, role: 0xffb84d, voice: 0x8b5cf6, server: 0x00c2ff, automod: 0xff73fa, info: 0x39d98a, ai: 0x8b5cf6, music: 0x8b5cf6, premium: 0xffd166, license: 0xffd166, utility: 0x38bdf8, community: 0x34d399, fun: 0xf472b6, servertools: 0x60a5fa, support: 0x8b5cf6, template: 0x8b5cf6, security: 0x22c55e };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

module.exports = async function help(c) {
  const cats = c.cats;
  const accessLabel = (d) => d.owner ? ' • **OWNER ONLY**' : d.premium ? ' • **PREMIUM ACCESS**' : '';
  const px = c.prefix;
  const order = ['home', ...cats.map((x) => x.name), 'guide'];
  const PAGE_SIZE = 12;
  let view = 'home'; let found = []; let q = ''; let commandPage = 0;
  const pageCount = () => view === 'search' ? Math.max(1, Math.ceil(found.length / PAGE_SIZE)) : Math.max(1, Math.ceil((cats.find((x) => x.name === view)?.commands.length || 0) / PAGE_SIZE));

  const menu = (off) => cv2.select('help:cat', '📂 Choose a category…', [
    { label: 'Home', value: 'home', emoji: { name: '🏠' }, default: view === 'home' },
    ...cats.map((x) => ({ label: cap(x.name), value: x.name, emoji: { name: BASE[x.name] || '📚' }, description: trunc(x.description.split(':')[1] || x.description, 90).trim(), default: view === x.name })),
    { label: 'Short-form guide', value: 'guide', emoji: { name: '📘' }, default: view === 'guide' },
  ], off);
  const btns = (off) => cv2.row([
    cv2.button('help:home', 'Home', 1, '🏠'),
    cv2.button('help:prev', 'Previous', 2, '◀️'),
    cv2.button('help:next', 'Next', 2, '▶️'),
    cv2.button('help:search', 'Search', 3, '🔎'),
    cv2.button('help:close', 'Close', 4, '✖️'),
  ].map((b, i) => ({ ...b, disabled: !!off || (i === 0 && view === 'home') })));
  const pageBtns = (off) => cv2.row([
    { ...cv2.button('help:cmdprev', 'Commands', 2, '◀️'), disabled: !!off || !['search', ...cats.map((x) => x.name)].includes(view) || commandPage === 0 },
    { ...cv2.button('help:cmdnext', 'More commands', 2, '▶️'), disabled: !!off || !['search', ...cats.map((x) => x.name)].includes(view) || commandPage >= pageCount() - 1 },
  ]);

  const content = () => {
    if (view === 'home') {
      const categoryLines = cats.map((x) => `${BASE[x.name] || '📚'} **${cap(x.name)}** · ${x.commands.length} commands`).join('\n');
      return {
        color: 0x39d98a,
        parts: [
          cv2.text(`# ☢️ Uranium Control Center\nModern moderation and community tools in one place.\n\n**${cats.reduce((n, x) => n + x.commands.length, 0)} available commands** · Slash and prefix support\nTry \`${px}b @user spam\` or open a category below.`),
          cv2.separator(),
          cv2.text(`## Command categories\n${categoryLines}`),
          cv2.separator(),
          cv2.text(`## ⚡ Quick tips\n• \`${px}help\` opens this menu\n• Reply to a message and type \`${px}w reason\` to warn\n• Use the **Undo** button under supported results to reverse an action`),
        ],
      };
    }
    if (view === 'guide') {
      return {
        color: 0x5b8cff,
        parts: [
          cv2.text(`# 📘 Short-form guide\n**Prefix:** \`${px}\` (change with \`${px}prefix <new>\`) or mention Uranium.`),
          cv2.separator(),
          cv2.text([
            '**Quick examples**',
            `• \`${px}b @user spam\` → ban`,
            `• \`${px}k @user\` → kick`,
            `• \`${px}t @user 10m\` → timeout`,
            `• \`${px}w @user reason\` → warn`,
            `• \`${px}p 50\` → delete 50 messages`,
            `• \`${px}l\` / \`${px}ul\` → lock / unlock channel`,
            `• \`${px}sm 10\` → slowmode`,
            `• \`${px}ping\` → check speed`,
            '',
            '**Long form:** `' + px + 'member ban @user`, `' + px + 'channel lock`, `' + px + 'role add @user @role`',
            '**Tip:** use a member mention, ID, or reply to their message.',
            '**Search:** press 🔎 to find commands by name or description.',
          ].join('\n')),
        ],
      };
    }
    if (view === 'search') {
      const rows = found.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE)
        .map((h) => `• \`${px}${h.al}\` · **/${h.cat} ${h.d.name}**${accessLabel(h.d)}\n  ${trunc(h.d.desc, 100)}`).join('\n\n');
      return {
        color: 0xffb84d,
        parts: [
          cv2.text(`# 🔎 Search: “${trunc(q, 40)}”\n**${found.length} result(s)** · Page ${commandPage + 1}/${pageCount()}`),
          cv2.separator(),
          cv2.text(rows || '_Nothing found. Try another word._'),
        ],
      };
    }
    const x = cats.find((k) => k.name === view);
    const entries = x.commands.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE);
    const rows = entries.map((s) => `• \`${px}${c.short(x.name, s.name)}\` · ${trunc(s.desc, 95)}${accessLabel(s)}`).join('\n');
    return {
      color: TINT[x.name] || 0x5b8cff,
      parts: [
        cv2.text(`# ${BASE[x.name] || '📚'} ${cap(x.name)}\n**${x.commands.length} commands** · Page ${commandPage + 1}/${pageCount()}`),
        cv2.separator(),
        cv2.text(rows || '_No commands in this category._'),
      ],
    };
  };
  const render = (off = false) => {
    const current = content();
    return cv2.message([...current.parts, cv2.separator(), menu(off), btns(off), pageBtns(off)], current.color);
  };

  await c.i.editReply(cv2.message([cv2.text('# ☢️ Starting Uranium Control Center\n◐ Loading command categories…')], 0x8b5cf6));
  const msg = await c.i.editReply(render());
  const col = msg.createMessageComponentCollector({ time: 240000, filter: (b) => b.customId.startsWith('help:') });
  col.on('collect', async (b) => {
    if (b.user.id !== c.i.user.id) return b.reply({ content: `Only the person who opened help can use this. Type \`${px}help\` yourself.`, flags: 64 });
    const k = b.customId.split(':')[1];
    if (b.isStringSelectMenu()) { view = b.values[0]; commandPage = 0; return b.update(render()); }
    if (k === 'close') { col.stop('closed'); return b.update(render(true)); }
    if (k === 'search') {
      await b.showModal(new ModalBuilder().setCustomId('help:modal').setTitle('Search commands').addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q').setLabel('Type a word (ban, lock, role…)').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(30).setRequired(true))));
      const m = await b.awaitModalSubmit({ time: 60000, filter: (x) => x.customId === 'help:modal' && x.user.id === b.user.id }).catch(() => null);
      if (!m) return;
      q = m.fields.getTextInputValue('q').trim().toLowerCase(); commandPage = 0; await m.deferUpdate();
      found = [];
      for (const cat of cats) for (const d of cat.commands) {
        const al = c.short(cat.name, d.name);
        if (`${d.name} ${d.desc} ${al}`.toLowerCase().includes(q)) found.push({ cat: cat.name, d, al });
      }
      view = 'search'; return c.i.editReply(render());
    }
    if (k === 'cmdprev' || k === 'cmdnext') {
      commandPage = Math.max(0, Math.min(pageCount() - 1, commandPage + (k === 'cmdnext' ? 1 : -1)));
      return b.update(render());
    }
    const idx = order.indexOf(view);
    view = k === 'home' ? 'home' : k === 'next' ? order[(idx + 1) % order.length] : order[(idx - 1 + order.length) % order.length];
    commandPage = 0;
    if (view === 'search') view = 'home';
    await b.update(render());
  });
  col.on('end', () => c.i.editReply(render(true)).catch(() => {}));
  return { handled: true };
};
