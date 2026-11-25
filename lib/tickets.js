const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionFlagsBits: P, StringSelectMenuBuilder,
} = require('discord.js');
const db = require('./db');
const ACCESS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
const MAX_CATEGORIES = 25;
const slug = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'ticket';
const clean = (value, max, fallback = '') => String(value ?? fallback).trim().slice(0, max);
function ensureAdmin(c) {
  if (!c.i.memberPermissions?.has(P.ManageGuild) && c.i.user.id !== c.g.ownerId) throw new Error('You need Manage Server permission to configure tickets.');
}
function configFor(guildId) {
  const g = db.g(guildId);
  g.config.ticketing ||= { categories: [] };
  g.config.ticketing.categories ||= [];
  return g.config.ticketing;
}
function embed(title, description, color = 0x8b5cf6) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: 'Uranium • Ticket System' }).setTimestamp();
}
function panelRows(categories) {
  const menu = new StringSelectMenuBuilder().setCustomId('ticket:open')
    .setPlaceholder('Select a category to open a ticket...').setMinValues(1).setMaxValues(1)
    .addOptions(categories.map(x => {
      const option = { label: x.name.slice(0, 100), value: x.key, description: (x.description || 'Open a private ticket').slice(0, 100) };
      if (x.emoji) option.emoji = x.emoji;
      return option;
    }));
  return [new ActionRowBuilder().addComponents(menu)];
}
function controls(closed) {
  const row = new ActionRowBuilder();
  if (closed) row.addComponents(new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Reopen ticket').setEmoji('🔓').setStyle(ButtonStyle.Success));
  else row.addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  return [row];
}
function metaOf(channel) {
  const m = /^uranium-ticket-v2:(\d{17,20}):([a-z0-9-]{1,28}):(open|closed)$/.exec(String(channel?.topic || ''));
  return m ? { openerId: m[1], categoryKey: m[2], status: m[3] } : null;
}
function staffRole(guildId, key) { return configFor(guildId).categories.find(x => x.key === key)?.staffRoleId || null; }
function isStaff(member, roleId) { return member.permissions.has(P.ManageChannels) || member.permissions.has(P.Administrator) || (!!roleId && member.roles.cache.has(roleId)); }

async function setup(c) {
  ensureAdmin(c);
  const config = configFor(c.g.id), panel = c.c('panel_channel'), logs = c.c('log_channel');
  if (!panel?.isTextBased?.() || panel.guildId !== c.g.id) throw new Error('Choose a text channel in this server for the panel.');
  if (logs && (!logs.isTextBased?.() || logs.guildId !== c.g.id)) throw new Error('The log channel must be a text channel in this server.');
  if (!panel.permissionsFor(c.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) throw new Error('Uranium needs View Channel, Send Messages and Embed Links in the panel channel.');
  config.panelChannelId = panel.id;
  if (logs) config.logChannelId = logs.id; else delete config.logChannelId;
  if (c.s('panel_title')) config.panelTitle = clean(c.s('panel_title'), 256);
  if (c.s('panel_message')) config.panelMessage = clean(c.s('panel_message'), 3500);
  db.save();
  return { title: 'Ticket system configured', desc: 'Panel: ' + panel + '\nLogs: ' + (logs || 'Not configured') + '\n\nAdd categories with /support ticket-category-add, then publish with /support ticket-panel. Ticket creation is free for every member.' };
}
async function addCategory(c) {
  ensureAdmin(c);
  const config = configFor(c.g.id), name = clean(c.s('name'), 80), parent = c.c('ticket_category'), role = c.r('staff_role');
  if (!name || !parent || parent.type !== ChannelType.GuildCategory) throw new Error('Choose a valid ticket parent category.');
  if (!role || role.guild.id !== c.g.id) throw new Error('Choose a staff role from this server.');
  const key = slug(name), current = config.categories.find(x => x.key === key);
  if (!current && config.categories.length >= MAX_CATEGORIES) throw new Error('A dropdown panel supports up to 25 categories.');
  const entry = {
    key, name, emoji: clean(c.s('emoji'), 64) || '🎫',
    description: clean(c.s('description'), 100) || 'Open a private ticket in this category',
    parentId: parent.id, staffRoleId: role.id,
    welcomeMessage: clean(c.s('welcome_message'), 1500) || 'Welcome {user}! Please explain your request. The {staffRole} team will help you shortly.'
  };
  if (current) Object.assign(current, entry); else config.categories.push(entry);
  db.save();
  return { title: current ? 'Ticket category updated' : 'Ticket category added', desc: entry.emoji + ' **' + name + '**\nParent: ' + parent + '\nStaff role: ' + role + '\nWelcome message saved. Republish the panel to apply changes.' };
}
async function removeCategory(c) {
  ensureAdmin(c);
  const config = configFor(c.g.id), key = slug(c.s('name')), before = config.categories.length;
  config.categories = config.categories.filter(x => x.key !== key);
  if (config.categories.length === before) throw new Error('That ticket category was not found.');
  db.save();
  return { title: 'Ticket category removed', desc: 'Removed ' + key + '. Existing ticket channels are not deleted. Republish the panel to apply the change.' };
}
async function publishPanel(c) {
  ensureAdmin(c);
  const config = configFor(c.g.id);
  if (!config.panelChannelId) throw new Error('Run /support ticket-setup first.');
  if (!config.categories.length) throw new Error('Add at least one category first.');
  const channel = await c.g.channels.fetch(config.panelChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error('The configured panel channel no longer exists. Run ticket-setup again.');
  const payload = {
    embeds: [embed(config.panelTitle || 'Need help?', config.panelMessage || 'Choose a category below to create a private ticket with the right team.')],
    components: panelRows(config.categories), allowedMentions: { parse: [] }
  };
  let message = config.panelMessageId ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  if (message) await message.edit(payload);
  else { message = await channel.send(payload); config.panelMessageId = message.id; }
  db.save();
  return { title: 'Ticket panel published', desc: 'Interactive panel ready in ' + channel + ' with ' + config.categories.length + ' categories. It is free for every member.' };
}
async function listCategories(c) {
  ensureAdmin(c);
  const items = configFor(c.g.id).categories;
  if (!items.length) return { title: 'No ticket categories', desc: 'Use /support ticket-category-add to create one.' };
  return { title: 'Ticket categories', desc: items.map(x => '**' + x.emoji + ' ' + x.name + '**\nStaff: <@&' + x.staffRoleId + '> • Parent: <#' + x.parentId + '>\n' + x.description).join('\n\n').slice(0, 3800) };
}
async function openTicket(i, key) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const config = configFor(i.guildId), category = config.categories.find(x => x.key === key);
  if (!category) return i.editReply('That category is no longer available. Ask an admin to republish the panel.');
  const member = await i.guild.members.fetch(i.user.id).catch(() => null);
  if (!member) return i.editReply('I could not verify your server membership.');
  const parent = await i.guild.channels.fetch(category.parentId).catch(() => null);
  const role = await i.guild.roles.fetch(category.staffRoleId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory || !role) return i.editReply('This ticket category is misconfigured. Ask an admin to update it.');
  const botMember = await i.guild.members.fetchMe();
  if (!botMember.permissions.has(P.ManageChannels)) return i.editReply('Uranium needs Manage Channels to create tickets.');
  await i.guild.channels.fetch().catch(() => {});
  const existing = i.guild.channels.cache.find(ch => { const m = metaOf(ch); return m?.openerId === member.id && m.status === 'open'; });
  if (existing) return i.editReply('You already have an open ticket: ' + existing);
  const overwrites = [
    { id: i.guild.id, deny: [P.ViewChannel] },
    { id: member.id, allow: ACCESS },
    { id: role.id, allow: ACCESS },
    { id: i.client.user.id, allow: [...ACCESS, P.ManageChannels] }
  ];
  try {
    const channel = await i.guild.channels.create({
      name: ('ticket-' + category.key + '-' + slug(member.user.username)).slice(0, 95),
      type: ChannelType.GuildText, parent: parent.id,
      topic: 'uranium-ticket-v2:' + member.id + ':' + category.key + ':open',
      permissionOverwrites: overwrites, reason: 'Uranium ticket opened by ' + member.user.tag
    });
    const data = db.g(i.guildId); data.tickets ||= {};
    data.tickets[channel.id] = { openerId: member.id, categoryKey: key, status: 'open', createdAt: Date.now(), claimedBy: null };
    db.save();
    const welcome = (category.welcomeMessage || 'Welcome {user}!').replaceAll('{user}', '<@' + member.id + '>')
      .replaceAll('{username}', member.user.username).replaceAll('{server}', i.guild.name)
      .replaceAll('{category}', category.name).replaceAll('{staffRole}', '<@&' + role.id + '>');
    await channel.send({
      embeds: [embed(category.emoji + ' ' + category.name, welcome)],
      components: controls(false), allowedMentions: { users: [member.id], roles: [role.id] }
    });
    return i.editReply('Your private ticket has been created: ' + channel);
  } catch (error) {
    console.error('[ticket create]', error);
    return i.editReply('Ticket creation failed. Check Uranium’s Manage Channels permission and role hierarchy.');
  }
}
async function componentButton(i, action) {
  const meta = metaOf(i.channel);
  if (!meta) return i.reply({ content: 'This is not an active Uranium ticket.', flags: MessageFlags.Ephemeral });
  const member = await i.guild.members.fetch(i.user.id).catch(() => null);
  if (!member) return i.reply({ content: 'I could not verify your server membership.', flags: MessageFlags.Ephemeral });
  const staff = isStaff(member, staffRole(i.guildId, meta.categoryKey));
  const opener = member.id === meta.openerId, data = db.g(i.guildId), record = data.tickets?.[i.channelId];
  if (action === 'claim') {
    if (!staff) return i.reply({ content: 'Only assigned staff or a channel manager can claim this ticket.', flags: MessageFlags.Ephemeral });
    if (meta.status !== 'open') return i.reply({ content: 'Reopen this ticket before claiming it.', flags: MessageFlags.Ephemeral });
    if (record?.claimedBy && record.claimedBy !== member.id) return i.reply({ content: 'This ticket is already claimed by another staff member.', flags: MessageFlags.Ephemeral });
    data.tickets ||= {}; data.tickets[i.channelId] = { ...(record || meta), claimedBy: member.id, status: 'open' }; db.save();
    return i.reply({ content: 'Ticket claimed by <@' + member.id + '>.', allowedMentions: { users: [member.id] } });
  }
  if (action === 'close') {
    if (!opener && !staff) return i.reply({ content: 'Only the ticket opener or assigned staff can close it.', flags: MessageFlags.Ephemeral });
    if (meta.status !== 'open') return i.reply({ content: 'This ticket is already closed.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await i.channel.permissionOverwrites.edit(meta.openerId, { ViewChannel: false, SendMessages: false }, { reason: 'Uranium ticket closed' });
      await i.channel.setTopic('uranium-ticket-v2:' + meta.openerId + ':' + meta.categoryKey + ':closed');
      data.tickets ||= {}; data.tickets[i.channelId] = { ...(record || meta), status: 'closed', closedAt: Date.now(), closedBy: member.id }; db.save();
      await i.channel.send({ embeds: [embed('🔒 Ticket closed', 'Closed by <@' + member.id + '>. Staff can reopen it if needed.', 0x64748b)], components: controls(true), allowedMentions: { users: [member.id] } });
      const log = data.config.ticketing?.logChannelId ? await i.guild.channels.fetch(data.config.ticketing.logChannelId).catch(() => null) : null;
      if (log?.isTextBased?.()) await log.send({ embeds: [embed('Ticket closed', '**Channel:** ' + i.channel.name + '\n**Opened by:** <@' + meta.openerId + '>\n**Closed by:** <@' + member.id + '>\n**Category:** ' + meta.categoryKey, 0x64748b)], allowedMentions: { users: [meta.openerId, member.id] } }).catch(() => {});
      return i.editReply('Ticket closed. The opener can no longer view it; staff can reopen it.');
    } catch (error) {
      console.error('[ticket close]', error);
      return i.editReply('Could not close this ticket. Check Uranium’s Manage Channels permission.');
    }
  }
  if (action === 'reopen') {
    if (!staff) return i.reply({ content: 'Only assigned staff or a channel manager can reopen a ticket.', flags: MessageFlags.Ephemeral });
    if (meta.status !== 'closed') return i.reply({ content: 'This ticket is already open.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await i.channel.permissionOverwrites.edit(meta.openerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }, { reason: 'Uranium ticket reopened' });
      await i.channel.setTopic('uranium-ticket-v2:' + meta.openerId + ':' + meta.categoryKey + ':open');
      data.tickets ||= {}; data.tickets[i.channelId] = { ...(record || meta), status: 'open', reopenedAt: Date.now(), reopenedBy: member.id }; db.save();
      await i.channel.send({ embeds: [embed('🔓 Ticket reopened', 'Reopened by <@' + member.id + '>. You can continue here.', 0x22c55e)], components: controls(false), allowedMentions: { users: [meta.openerId, member.id] } });
      return i.editReply('Ticket reopened.');
    } catch (error) {
      console.error('[ticket reopen]', error);
      return i.editReply('Could not reopen this ticket. Check Uranium’s Manage Channels permission.');
    }
  }
  return i.reply({ content: 'Unknown ticket action.', flags: MessageFlags.Ephemeral });
}
async function onComponent(i) {
  if (!i.customId?.startsWith('ticket:') || !i.inGuild() || !i.guild) return false;
  const action = i.customId.split(':')[1];
  if (i.isStringSelectMenu() && action === 'open') return openTicket(i, i.values[0]);
  if (i.isButton()) return componentButton(i, action);
  return false;
}
module.exports = { setup, addCategory, removeCategory, publishPanel, listCategories, onComponent };
