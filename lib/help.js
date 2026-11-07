const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const art = require('./art');
const { E } = require('./emojis');
const { COLORS, FOOT } = require('./ui');
const { sleep, trunc } = require('./util');

const BASE = { member: '👤', message: '💬', channel: '📺', role: '🏷️', voice: '🔊', server: '🏰', automod: '🛡️', info: 'ℹ️', ai: '🤖', music: '🎵', premium: '💎', license: '🔑', utility: '🧮', community: '🌐', fun: '🎮', servertools: '🧰', support: '📨' };
const TINT = { member: 0xff4d6d, message: 0x5b8cff, channel: 0x39d98a, role: 0xffb84d, voice: 0x8b5cf6, server: 0x00c2ff, automod: 0xff73fa, info: 0x39d98a, ai: 0x8b5cf6, music: 0x8b5cf6, premium: 0xffd166, license: 0xffd166, utility: 0x38bdf8, community: 0x34d399, fun: 0xf472b6, servertools: 0x60a5fa, support: 0x8b5cf6 };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

module.exports = async function help(c) {
  const ICON = { ...BASE, ai: E('ai'), music: E('note'), premium: E('crown'), info: 'ℹ️' };
  const cats = c.cats.map((x) => ({ ...x, commands: x.commands.filter((d) => c.isOwner || !d.owner) })).filter((x) => x.commands.length && (x.name !== 'premium' || c.isOwner));
  const px = c.prefix; const order = ['home', ...cats.map((x) => x.name), 'guide'];
  const PAGE_SIZE = 12;
  let view = 'home'; let found = []; let q = ''; let commandPage = 0;
  const pageCount = () => view === 'search' ? Math.max(1, Math.ceil(found.length / PAGE_SIZE)) : Math.max(1, Math.ceil((cats.find((x) => x.name === view)?.commands.length || 0) / PAGE_SIZE));
  const gif = art.getGif();

  const embed = () => {
    const e = new EmbedBuilder().setFooter({ text: `Page ${order.indexOf(view) + 1}/${order.length} • Prefix: ${px} • ${FOOT}` });
    if (view === 'home') {
      e.setColor(COLORS.ok).setTitle(`${E('atom')} Uranium Control Center`).setThumbnail(c.i.client.user.displayAvatarURL({ size: 128 }))
        .setDescription(`Modern moderation for your server, with **${cats.reduce((n, x) => n + x.commands.length, 0)} available commands**.\nUse **/slash** commands or short prefix commands like \`${px}b @user spam\`.\n\n**Pick a category below** 👇`)
        .addFields(cats.map((x) => ({ name: `${ICON[x.name]} ${cap(x.name)}`, value: trunc(x.description.split(':')[1] || x.description, 60).trim(), inline: true })),
          { name: '⚡ Tips', value: `• \`${px}help\` opens this menu\n• Reply to a message and type \`${px}w reason\` to warn\n• Press **Undo** under results to reverse actions` });
      if (gif) e.setImage('attachment://uranium.gif');
    } else if (view === 'guide') {
      e.setColor(COLORS.info).setTitle('📘 Short-form guide').setDescription([
        `**Prefix:** \`${px}\` (change it with \`${px}prefix <new>\`) or just mention me.`,
        '', '**Quick examples**',
        `\`${px}b @user spam\` → ban`, `\`${px}k @user\` → kick`, `\`${px}t @user 10m\` → timeout`, `\`${px}w @user reason\` → warn`,
        `\`${px}p 50\` → delete 50 messages`, `\`${px}l\` / \`${px}ul\` → lock / unlock channel`, `\`${px}sm 10\` → slowmode`, `\`${px}ping\` → speed`,
        '', '**Long form:** `' + px + 'm ban @user`, `' + px + 'ch lock`, `' + px + 'ro add @user @role`',
        '**Tip:** write a user as a mention, an ID, or reply to their message.',
        '**Search:** press 🔎 to find any command by a word.'].join('\n'));
    } else if (view === 'search') {
      e.setColor(COLORS.warn).setTitle(`🔎 “${trunc(q, 30)}” • ${found.length} result(s)`).setDescription(found.length ? found.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE).map((h) => `\`${px}${h.al}\` • **/${h.cat} ${h.d.name}**\n${trunc(h.d.desc, 80)}`).join('\n\n') : '_Nothing found. Try another word._');
    } else {
      const x = cats.find((k) => k.name === view);
      const entries = x.commands.slice(commandPage * PAGE_SIZE, (commandPage + 1) * PAGE_SIZE);
      e.setColor(TINT[x.name] || COLORS.info).setTitle(`${ICON[x.name] || '📚'} ${cap(x.name)} • ${x.commands.length} commands`)
        .setDescription(entries.map((s) => `\`${px}${c.short(x.name, s.name)}\` — ${trunc(s.desc, 70)}`).join('\n'))
        .setFooter({ text: `${FOOT} • ${cap(x.name)} page ${commandPage + 1}/${pageCount()}` });
    }
    return e;
  };
  const menu = (off) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:cat').setPlaceholder('📂 Choose a category…').setDisabled(off)
    .addOptions([{ label: 'Home', value: 'home', emoji: '🏠', default: view === 'home' }, ...cats.map((x) => ({ label: cap(x.name), value: x.name, emoji: ICON[x.name], description: trunc(x.description.split(':')[1] || x.description, 90).trim(), default: view === x.name })), { label: 'Short-form guide', value: 'guide', emoji: '📘', default: view === 'guide' }]));
  const btns = (off) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help:home').setEmoji('🏠').setStyle(ButtonStyle.Primary).setDisabled(off || view === 'home'),
    new ButtonBuilder().setCustomId('help:prev').setEmoji('◀️').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder().setCustomId('help:next').setEmoji('▶️').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder().setCustomId('help:search').setEmoji('🔎').setLabel('Search').setStyle(ButtonStyle.Success).setDisabled(off),
    new ButtonBuilder().setCustomId('help:close').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(off));
  const pageBtns = (off) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help:cmdprev').setEmoji('◀️').setLabel('Commands').setStyle(ButtonStyle.Secondary).setDisabled(off || !['search', ...cats.map((x) => x.name)].includes(view) || commandPage === 0),
    new ButtonBuilder().setCustomId('help:cmdnext').setEmoji('▶️').setLabel('More commands').setStyle(ButtonStyle.Secondary).setDisabled(off || !['search', ...cats.map((x) => x.name)].includes(view) || commandPage >= pageCount() - 1));
  const render = (off = false) => ({ embeds: [embed()], components: [menu(off), btns(off), pageBtns(off)] });

  // little intro animation
  for (const t of ['◐ Booting control center…', '◓ Loading categories…', '◑ Almost ready…']) {
    await c.i.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.run).setTitle(t).setFooter({ text: FOOT })], components: [] }); await sleep(450);
  }
  const first = render(); if (gif) first.files = [new AttachmentBuilder(gif, { name: 'uranium.gif' })];
  const msg = await c.i.editReply(first);
  const col = msg.createMessageComponentCollector({ time: 240000, filter: (b) => b.customId.startsWith('help:') });
  col.on('collect', async (b) => {
    if (b.user.id !== c.i.user.id) return b.reply({ content: `Only the person who opened help can use this. Type \`${px}help\` yourself.`, flags: 64 });
    const k = b.customId.split(':')[1];
    if (b.isStringSelectMenu()) { view = b.values[0]; commandPage = 0; return b.update(render()); }
    if (k === 'close') { col.stop('closed'); return b.update(render(true)); }
    if (k === 'search') {
      await b.showModal(new ModalBuilder().setCustomId('help:modal').setTitle('Search commands').addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q').setLabel('Type a word (ban, lock, role…)').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(30).setRequired(true))));
      const m = await b.awaitModalSubmit({ time: 60000, filter: (x) => x.customId === 'help:modal' && x.user.id === b.user.id }).catch(() => null); if (!m) return;
      q = m.fields.getTextInputValue('q').trim().toLowerCase(); commandPage = 0; await m.deferUpdate();
      found = []; for (const cat of cats) for (const d of cat.commands) { const al = c.short(cat.name, d.name); if (`${d.name} ${d.desc} ${al}`.toLowerCase().includes(q)) found.push({ cat: cat.name, d, al }); }
      view = 'search'; return c.i.editReply(render());
    }
    if (k === 'cmdprev' || k === 'cmdnext') { commandPage = Math.max(0, Math.min(pageCount() - 1, commandPage + (k === 'cmdnext' ? 1 : -1))); return b.update(render()); }
    const idx = order.indexOf(view);
    view = k === 'home' ? 'home' : k === 'next' ? order[(idx + 1) % order.length] : order[(idx - 1 + order.length) % order.length];
    commandPage = 0;
    if (view === 'search') view = 'home';
    await b.update(render());
  });
  col.on('end', () => c.i.editReply(render(true)).catch(() => {}));
  return { handled: true };
};
