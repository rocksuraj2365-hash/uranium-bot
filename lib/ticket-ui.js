// lib/ticket-ui.js
// Components V2 setup panel for the ticket system: /ticket config
const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const cv2 = require('./cv2');
const tickets = require('./tickets');

const { PK } = tickets;
const BLURPLE = 0x5865f2, OK = 0x22c55e, WARN = 0xffb84d, MUTED = 0x6b7280;
const eph = (text, color = 0x5b8cff) => cv2.ephemeralMessage([cv2.text(text)], color);

function isManager(guild, userId, perms) {
  const owners = (process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean);
  return String(userId) === String(guild.ownerId) || owners.includes(String(userId)) || !!perms?.has(P.ManageGuild);
}

const channelName = (guild, id) => (id && guild.channels.cache.get(id) ? `<#${id}>` : 'not set');

function homeView(guild, off = false) {
  const t = tickets.cfgOf(guild.id);
  const open = Object.keys(t.open).filter((id) => guild.channels.cache.has(id)).length;
  const panelAt = t.panel.channelId && t.panel.messageId ? `<#${t.panel.channelId}>` : 'not posted yet';
  const d = (x) => (off ? { ...x, disabled: true } : x);
  const options = [
    ...t.categories.map((c) => { const o = { label: c.label, value: c.id, description: `${c.roleIds.length ? c.roleIds.length + ' staff role(s)' : 'no staff role'} · ${c.message ? 'custom message' : 'default message'}` }; const e = tickets.parseEmoji(c.emoji); if (e) o.emoji = e; return o; }),
    ...(t.categories.length < tickets.MAX_CATEGORIES ? [{ label: 'Add a new category', value: '__new', emoji: { name: '➕' } }] : []),
  ];
  const lines = t.categories.length
    ? t.categories.map((c, n) => `${n + 1}. ${c.emoji ? c.emoji + ' ' : ''}**${c.label}** — ${c.roleIds.length ? c.roleIds.map((id) => `<@&${id}>`).join(' ') : '_no staff role_'}`).join('\n')
    : '_No categories yet. Add one below, or press **Example categories**._';
  const kids = [
    cv2.text(`# ${PK('support_team', '🎫')} Ticket system`),
    cv2.text([`**Panel:** ${panelAt} · **Open tickets:** ${open}`, `**Log channel:** ${channelName(guild, t.logChannelId)} · **Max per user:** ${t.maxPerUser}`].join('\n')),
    cv2.separator(),
    cv2.text(lines.slice(0, 3000)),
    cv2.separator(),
    cv2.row([cv2.select('tkc:pick', 'Pick a category to edit, or add a new one', options, off)]),
    cv2.row([{ type: 8, custom_id: 'tkc:postto', placeholder: 'Post or move the panel to a channel…', min_values: 1, max_values: 1, channel_types: [CT.GuildText, CT.GuildAnnouncement], disabled: off }]),
    cv2.row([
      d(cv2.button('tkc:panel', 'Panel text', 2, '📝')),
      d(cv2.button('tkc:settings', 'Settings', 2, '⚙️')),
      d(cv2.button('tkc:seed', 'Example categories', 2, '✨')),
      d(cv2.button('tkc:close', 'Close', 4, '✖️')),
    ]),
  ];
  return cv2.message(kids, off ? MUTED : BLURPLE);
}

function categoryView(guild, catId, confirmDelete = false) {
  const t = tickets.cfgOf(guild.id);
  const c = t.categories.find((x) => x.id === catId);
  if (!c) return homeView(guild);
  const preview = tickets.fill(c.message, { user: '@Member', username: 'Member', category: c.label, ticket: '0001', server: guild.name, staff: tickets.staffText(c) });
  const kids = [
    cv2.text(`# ✏️ ${c.emoji ? c.emoji + ' ' : ''}${c.label}`),
    cv2.text([
      `**Description:** ${c.description || '_none_'}`,
      `**Staff roles:** ${c.roleIds.length ? c.roleIds.map((id) => `<@&${id}>`).join(' ') : '_none, only members with Manage Channels can see these tickets_'}`,
      `**Ticket category:** ${c.parentId ? channelName(guild, c.parentId) : '_server default_'} · **Ping staff:** ${c.pingStaff ? 'on' : 'off'}`,
    ].join('\n')),
    cv2.text(`**Welcome message preview**\n${preview.slice(0, 1500)}`),
    cv2.separator(),
    cv2.row([
      cv2.button('tkc:info', 'Name, emoji, description', 2, '✏️'),
      cv2.button('tkc:msg', 'Welcome message', 2, '💬'),
      cv2.button('tkc:ping', c.pingStaff ? 'Ping staff: ON' : 'Ping staff: OFF', c.pingStaff ? 3 : 2),
    ]),
    cv2.row([{ type: 6, custom_id: 'tkc:roles', placeholder: 'Staff roles for this category (up to 5)', min_values: 0, max_values: 5, default_values: c.roleIds.filter((id) => guild.roles.cache.has(id)).map((id) => ({ id, type: 'role' })) }]),
    cv2.row([{ type: 8, custom_id: 'tkc:parent', placeholder: 'Discord category where these tickets are created', min_values: 0, max_values: 1, channel_types: [CT.GuildCategory], ...(c.parentId && guild.channels.cache.has(c.parentId) ? { default_values: [{ id: c.parentId, type: 'channel' }] } : {}) }]),
    cv2.row([cv2.button('tkc:back', 'Back', 2, '⬅️'), cv2.button('tkc:del', confirmDelete ? 'Really delete?' : 'Delete category', 4, '🗑️')]),
  ];
  return cv2.message(kids, BLURPLE);
}

function settingsView(guild) {
  const t = tickets.cfgOf(guild.id);
  const kids = [
    cv2.text('# ⚙️ Ticket settings'),
    cv2.text([
      `**Max open tickets per member:** ${t.maxPerUser}`,
      `**Members can close their own ticket:** ${t.userClose ? 'yes' : 'no'}`,
      `**DM the transcript to the member:** ${t.dmTranscript ? 'yes' : 'no'}`,
      `**Log channel:** ${channelName(guild, t.logChannelId)}`,
      `**Default ticket category:** ${t.parentId ? channelName(guild, t.parentId) : 'none'}`,
    ].join('\n')),
    cv2.separator(),
    cv2.row([
      cv2.button('tkc:max-', '', 2, '➖'), cv2.button('tkc:max+', '', 2, '➕'),
      cv2.button('tkc:uclose', t.userClose ? 'Member close: ON' : 'Member close: OFF', t.userClose ? 3 : 2),
      cv2.button('tkc:dm', t.dmTranscript ? 'DM transcript: ON' : 'DM transcript: OFF', t.dmTranscript ? 3 : 2),
    ]),
    cv2.row([{ type: 8, custom_id: 'tkc:log', placeholder: 'Log channel for opened and closed tickets with transcripts', min_values: 0, max_values: 1, channel_types: [CT.GuildText, CT.GuildAnnouncement], ...(t.logChannelId && guild.channels.cache.has(t.logChannelId) ? { default_values: [{ id: t.logChannelId, type: 'channel' }] } : {}) }]),
    cv2.row([{ type: 8, custom_id: 'tkc:parent0', placeholder: 'Default Discord category for new tickets', min_values: 0, max_values: 1, channel_types: [CT.GuildCategory], ...(t.parentId && guild.channels.cache.has(t.parentId) ? { default_values: [{ id: t.parentId, type: 'channel' }] } : {}) }]),
    cv2.row([cv2.button('tkc:back', 'Back', 2, '⬅️')]),
  ];
  return cv2.message(kids, BLURPLE);
}

const field = (id, label, style, { value, required = true, max, placeholder } = {}) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, required, max_length: max, ...(value ? { value: String(value).slice(0, max) } : {}), ...(placeholder ? { placeholder } : {}) }] });
async function ask(b, data) {
  await b.showModal(data);
  return b.awaitModalSubmit({ time: 600000, filter: (m) => m.customId === data.custom_id && m.user.id === b.user.id }).catch(() => null);
}

async function open(c) {
  const guild = c.g;
  let state = { view: 'home', catId: null, confirm: false };
  const draw = (off = false) => (state.view === 'cat' ? categoryView(guild, state.catId, state.confirm) : state.view === 'settings' ? settingsView(guild) : homeView(guild, off));
  const message = await c.i.editReply(draw());
  const collector = message.createMessageComponentCollector({ time: 900000, idle: 300000, filter: (b) => b.customId.startsWith('tkc:') });
  const refresh = () => tickets.refreshPanel(guild);
  collector.on('collect', async (b) => {
    try {
      if (b.user.id !== c.i.user.id) return b.reply(eph('# 🔒 Ticket setup\nOnly the member who opened this panel can use it. Run `!ticket config` for your own.', 0x8b5cf6));
      if (!isManager(guild, b.user.id, b.memberPermissions)) return b.reply(eph('# 🔒 Not allowed\nYou need the **Manage Server** permission.', 0x8b5cf6));
      const key = b.customId.split(':')[1];
      const t = tickets.cfgOf(guild.id);
      const fail = (error) => (error?.name === 'TicketError' ? error.message : 'Something went wrong. Please try again.');
      if (key === 'close') { collector.stop('closed'); return b.update(homeView(guild, true)); }
      if (key === 'back') { state = { view: 'home', catId: null, confirm: false }; return b.update(draw()); }
      if (key === 'settings') { state.view = 'settings'; return b.update(draw()); }
      if (key === 'seed') {
        let added = 0;
        for (const example of tickets.EXAMPLE_CATEGORIES) { try { tickets.addCategory(guild.id, example); added += 1; } catch { /* already there or limit */ } }
        await b.update(draw()); await refresh();
        return added ? undefined : b.followUp(eph('Those example categories already exist.', WARN));
      }
      if (key === 'pick') {
        const value = b.values[0];
        if (value === '__new') {
          const m = await ask(b, { custom_id: 'tkc:m-new', title: 'New ticket category', components: [
            field('label', 'Name', 1, { max: tickets.LIMITS.label, placeholder: 'Support' }),
            field('emoji', 'Emoji (optional)', 1, { required: false, max: 60, placeholder: '🛠️ or <:name:123456789012345678>' }),
            field('description', 'Short description (optional)', 1, { required: false, max: tickets.LIMITS.description }),
          ] });
          if (!m) return undefined;
          try {
            const category = tickets.addCategory(guild.id, { label: m.fields.getTextInputValue('label'), emoji: m.fields.getTextInputValue('emoji'), description: m.fields.getTextInputValue('description') });
            state = { view: 'cat', catId: category.id, confirm: false };
            await m.update(draw()); await refresh();
          } catch (error) { await m.reply(eph('# ⚠️ ' + fail(error), WARN)); }
          return undefined;
        }
        if (!t.categories.some((x) => x.id === value)) return b.update(draw());
        state = { view: 'cat', catId: value, confirm: false };
        return b.update(draw());
      }
      if (key === 'postto') {
        const channel = await guild.channels.fetch(b.values[0]).catch(() => null);
        if (!channel) return b.reply(eph('# ⚠️ Channel unavailable', WARN));
        try { await tickets.postPanel(guild, channel); } catch (error) { return b.reply(eph('# ⚠️ Could not post the panel\n' + (error.name === 'TicketError' ? error.message : 'I cannot send messages there. Check my permissions in that channel.'), WARN)); }
        await b.update(draw());
        return b.followUp(eph(`# ✅ Panel posted\n<#${channel.id}>`, OK));
      }
      if (key === 'panel') {
        const m = await ask(b, { custom_id: 'tkc:m-panel', title: 'Ticket panel text', components: [
          field('title', 'Title', 1, { value: t.panel.title, max: tickets.LIMITS.title }),
          field('description', 'Message above the menu', 2, { value: t.panel.description, max: tickets.LIMITS.panelText }),
          field('placeholder', 'Menu placeholder text', 1, { value: t.panel.placeholder, max: tickets.LIMITS.placeholder }),
          field('color', 'Color (hex, optional)', 1, { required: false, max: 7, value: '#' + t.panel.color.toString(16).padStart(6, '0') }),
        ] });
        if (!m) return undefined;
        const color = m.fields.getTextInputValue('color').trim();
        if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) return m.reply(eph('# ⚠️ Use a hex color like #5865f2', WARN));
        t.panel.title = m.fields.getTextInputValue('title').trim().slice(0, tickets.LIMITS.title) || 'Tickets';
        t.panel.description = m.fields.getTextInputValue('description').trim().slice(0, tickets.LIMITS.panelText) || t.panel.description;
        t.panel.placeholder = m.fields.getTextInputValue('placeholder').trim().slice(0, tickets.LIMITS.placeholder) || t.panel.placeholder;
        if (color) t.panel.color = parseInt(color.replace('#', ''), 16);
        require('./db').save();
        await m.update(draw()); await refresh();
        return undefined;
      }
      if (state.view === 'settings') {
        if (key === 'max-' || key === 'max+') t.maxPerUser = Math.min(5, Math.max(1, t.maxPerUser + (key === 'max+' ? 1 : -1)));
        else if (key === 'uclose') t.userClose = !t.userClose;
        else if (key === 'dm') t.dmTranscript = !t.dmTranscript;
        else if (key === 'log') t.logChannelId = b.values[0] || null;
        else if (key === 'parent0') t.parentId = b.values[0] || null;
        require('./db').save();
        return b.update(draw());
      }
      if (state.view === 'cat') {
        const id = state.catId;
        if (key === 'info') {
          const c0 = t.categories.find((x) => x.id === id);
          if (!c0) return b.update(homeView(guild));
          const m = await ask(b, { custom_id: 'tkc:m-info', title: 'Edit category', components: [
            field('label', 'Name', 1, { value: c0.label, max: tickets.LIMITS.label }),
            field('emoji', 'Emoji (optional)', 1, { value: c0.emoji, required: false, max: 60 }),
            field('description', 'Short description (optional)', 1, { value: c0.description, required: false, max: tickets.LIMITS.description }),
          ] });
          if (!m) return undefined;
          try { tickets.updateCategory(guild.id, id, { label: m.fields.getTextInputValue('label'), emoji: m.fields.getTextInputValue('emoji'), description: m.fields.getTextInputValue('description') }); await m.update(draw()); await refresh(); }
          catch (error) { await m.reply(eph('# ⚠️ ' + fail(error), WARN)); }
          return undefined;
        }
        if (key === 'msg') {
          const c0 = t.categories.find((x) => x.id === id);
          if (!c0) return b.update(homeView(guild));
          const m = await ask(b, { custom_id: 'tkc:m-msg', title: 'Welcome message', components: [
            field('message', 'Shown when a ticket opens', 2, { value: c0.message || tickets.DEFAULT_MESSAGE, max: tickets.LIMITS.message, placeholder: 'Use {user} {staff} {category} {ticket} {server}' }),
          ] });
          if (!m) return undefined;
          try { tickets.updateCategory(guild.id, id, { message: m.fields.getTextInputValue('message') }); await m.update(draw()); }
          catch (error) { await m.reply(eph('# ⚠️ ' + fail(error), WARN)); }
          return undefined;
        }
        if (key === 'ping') { const c0 = t.categories.find((x) => x.id === id); tickets.updateCategory(guild.id, id, { pingStaff: !c0.pingStaff }); return b.update(draw()); }
        if (key === 'roles') { tickets.updateCategory(guild.id, id, { roleIds: b.values.filter((r) => r !== guild.id) }); return b.update(draw()); }
        if (key === 'parent') { tickets.updateCategory(guild.id, id, { parentId: b.values[0] || null }); return b.update(draw()); }
        if (key === 'del') {
          if (!state.confirm) { state.confirm = true; return b.update(draw()); }
          tickets.removeCategory(guild.id, id);
          state = { view: 'home', catId: null, confirm: false };
          await b.update(draw()); await refresh();
          return undefined;
        }
      }
      return b.update(draw());
    } catch (error) {
      console.error('[ticket config]', error);
      const text = eph('# ⚠️ That control failed\nOpen a fresh panel with `!ticket config`.', WARN);
      if (b.deferred || b.replied) await b.followUp(text).catch(() => {}); else await b.reply(text).catch(() => {});
    }
  });
  collector.on('end', (_, reason) => { if (reason !== 'closed') c.i.editReply(homeView(guild, true)).catch(() => {}); });
  return { handled: true };
}

module.exports = { open, isManager, homeView, categoryView, settingsView };
