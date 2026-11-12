const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits: P,
} = require('discord.js');
const db = require('./db');
const supportContent = require('./support-content');
const cv2 = require('./cv2');
const icons = require('./emojis');
const { UserError } = require('./util');

const STAFF_KEYS = ['admin', 'moderator', 'supportLead', 'support', 'helper'];
const STAFF_ACCESS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak];
const BASIC_TICKET_ACCESS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

const ROLE_DEFS = [
  { key: 'owner', name: '👑 𝐎𝐖𝐍𝐄𝐑', color: 0xfacc15, hoist: true },
  { key: 'admin', name: '🛡️ 𝐀𝐃𝐌𝐈𝐍', color: 0xef4444, hoist: true },
  { key: 'moderator', name: '🔨 𝐌𝐎𝐃𝐄𝐑𝐀𝐓𝐎𝐑', color: 0xf97316, hoist: true },
  { key: 'supportLead', name: '🎧 𝐒𝐔𝐏𝐏𝐎𝐑𝐓 𝐋𝐄𝐀𝐃', color: 0x8b5cf6, hoist: true },
  { key: 'support', name: '🎫 𝐒𝐔𝐏𝐏𝐎𝐑𝐓 𝐓𝐄𝐀𝐌', color: 0xa78bfa, hoist: true },
  { key: 'helper', name: '🤝 𝐇𝐄𝐋𝐏𝐄𝐑', color: 0x38bdf8, hoist: true },
  { key: 'trial', name: '🌱 𝐓𝐑𝐈𝐀𝐋 𝐇𝐄𝐋𝐏𝐄𝐑', color: 0x22c55e, hoist: false },
  { key: 'events', name: '🎉 𝐄𝐕𝐄𝐍𝐓 𝐓𝐄𝐀𝐌', color: 0xec4899, hoist: false },
  { key: 'announcements', name: '📢 𝐀𝐍𝐍𝐎𝐔𝐍𝐂𝐄𝐌𝐄𝐍𝐓𝐒', color: 0xf59e0b, hoist: false },
  { key: 'verified', name: '✅ 𝐕𝐄𝐑𝐈𝐅𝐈𝐄𝐃', color: 0x10b981, hoist: true },
  { key: 'member', name: '👤 𝐌𝐄𝐌𝐁𝐄𝐑', color: 0x64748b, hoist: false },
  { key: 'muted', name: '🔇 𝐌𝐔𝐓𝐄𝐃', color: 0x475569, hoist: false },
];

const CATEGORY_DEFS = [
  { key: 'start', name: '━━ 📍 𝐒𝐓𝐀𝐑𝐓 𝐇𝐄𝐑𝐄 ━━' },
  { key: 'community', name: '━━ 💬 𝐂𝐎𝐌𝐌𝐔𝐍𝐈𝐓𝐘 ━━' },
  { key: 'support', name: '━━ 🛟 𝐒𝐔𝐏𝐏𝐎𝐑𝐓 𝐃𝐄𝐒𝐊 ━━' },
  { key: 'resources', name: '━━ 📚 𝐔𝐑𝐀𝐍𝐈𝐔𝐌 𝐑𝐄𝐒𝐎𝐔𝐑𝐂𝐄𝐒 ━━' },
  { key: 'voice', name: '━━ 🔊 𝐕𝐎𝐈𝐂𝐄 𝐋𝐎𝐔𝐍𝐆𝐄 ━━' },
  { key: 'staff', name: '━━ 🔒 𝐒𝐓𝐀𝐅𝐅 𝐇𝐐 ━━' },
];

const CHANNEL_DEFS = [
  { key: 'welcome', category: 'start', name: '👋・welcome', topic: 'Welcome to the community. Start here to find your way around.', access: 'readOnly' },
  { key: 'rules', category: 'start', name: '📜・rules', topic: 'Read the rules before chatting.', access: 'readOnly' },
  { key: 'announcements', category: 'start', name: '📢・announcements', topic: 'Official server announcements.', access: 'readOnly' },
  { key: 'guide', category: 'start', name: '🧭・server-guide', topic: 'A quick guide to this support community.', access: 'readOnly' },
  { key: 'verify', category: 'start', name: '✅・verify-here', topic: 'Agree to the rules to receive the Verified role.', access: 'readOnly' },

  { key: 'general', category: 'community', name: '💬・general-chat', topic: 'Chat with the community.', access: 'verified' },
  { key: 'introductions', category: 'community', name: '👋・introductions', topic: 'Introduce yourself to the community.', access: 'verified' },
  { key: 'media', category: 'community', name: '🖼️・media-share', topic: 'Share community-safe images and creations.', access: 'verified' },
  { key: 'suggestions', category: 'community', name: '💡・suggestions', topic: 'Share ideas to improve Uranium.', access: 'verified' },
  { key: 'offtopic', category: 'community', name: '🌿・off-topic', topic: 'Friendly conversations outside the main topic.', access: 'verified' },
  { key: 'botcommands', category: 'community', name: '🤖・bot-commands', topic: 'Try Uranium and other bot commands here.', access: 'verified' },

  { key: 'openTicket', category: 'support', name: '🎫・open-a-ticket', topic: 'Open a private support ticket with the button below.', access: 'readOnly' },
  { key: 'supportFaq', category: 'support', name: '❔・support-faq', topic: 'Answers to common support questions.', access: 'readOnly' },
  { key: 'reportIssue', category: 'support', name: '🐛・report-an-issue', topic: 'Use the ticket panel to privately report an issue.', access: 'readOnly' },
  { key: 'ticketUpdates', category: 'support', name: '📬・ticket-updates', topic: 'Public updates about support availability.', access: 'readOnly' },

  { key: 'gettingStarted', category: 'resources', name: '🚀・getting-started', topic: 'Learn how to invite and configure Uranium.', access: 'readOnly' },
  { key: 'commands', category: 'resources', name: '⌨️・commands', topic: 'Browse all Uranium commands and examples.', access: 'readOnly' },
  { key: 'documentation', category: 'resources', name: '📖・documentation', topic: 'Guides, permissions and troubleshooting.', access: 'readOnly' },
  { key: 'changelog', category: 'resources', name: '🧾・changelog', topic: 'Product updates and release notes.', access: 'readOnly' },
  { key: 'status', category: 'resources', name: '🟢・status', topic: 'Service status and maintenance notices.', access: 'readOnly' },

  { key: 'communityVoice', category: 'voice', name: '🔊・community-voice', type: ChannelType.GuildVoice, access: 'verified' },
  { key: 'supportVoice', category: 'voice', name: '🎧・support-voice', type: ChannelType.GuildVoice, access: 'verified' },

  { key: 'staffChat', category: 'staff', name: '💬・staff-chat', topic: 'Private staff coordination.' },
  { key: 'staffAnnouncements', category: 'staff', name: '📢・staff-announcements', topic: 'Private staff notices.' },
  { key: 'modLogs', category: 'staff', name: '🛡️・mod-logs', topic: 'Private moderation log destination.' },
  { key: 'ticketLogs', category: 'staff', name: '🎫・ticket-logs', topic: 'Private ticket handover notes.' },
  { key: 'staffVoice', category: 'staff', name: '🔒・staff-voice', type: ChannelType.GuildVoice },
];

function statusEmbed(title, description, color = 0x8b5cf6) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: 'Uranium • Support Server Builder' }).setTimestamp();
}
function statusPayload(title, description, color = 0x8b5cf6, rows = []) {
  const children = [cv2.text(`# ${icons.E('atom')} ${title}\\n\\n${description || ''}\\n\\n-# Uranium • Support Server Builder`)];
  for (const row of rows) children.push(cv2.separator(), cv2.row(row.toJSON().components));
  return cv2.message(children, color);
}

function staffRoleOverwrites(guildId, roles, botId) {
  const entries = [{ id: guildId, deny: [P.ViewChannel] }];
  for (const key of STAFF_KEYS) {
    if (roles[key]) entries.push({ id: roles[key], allow: STAFF_ACCESS });
  }
  entries.push({ id: botId, allow: [...STAFF_ACCESS, P.EmbedLinks] });
  return entries;
}

async function fetchOrCreateRole(guild, state, def) {
  let role = state.roles[def.key] ? await guild.roles.fetch(state.roles[def.key]).catch(() => null) : null;
  if (!role) {
    role = await guild.roles.create({
      name: def.name,
      color: def.color,
      hoist: def.hoist,
      mentionable: false,
      permissions: [],
      reason: 'Uranium support server template',
    });
    state.roles[def.key] = role.id;
    db.save();
  }
  return role;
}

async function fetchOrCreateCategory(guild, state, def, roles, botId) {
  let category = state.categories[def.key] ? await guild.channels.fetch(state.categories[def.key]).catch(() => null) : null;
  if (!category) {
    const options = {
      name: def.name,
      type: ChannelType.GuildCategory,
      reason: 'Uranium support server template',
    };
    if (def.key === 'staff') options.permissionOverwrites = staffRoleOverwrites(guild.id, roles, botId);
    category = await guild.channels.create(options);
    state.categories[def.key] = category.id;
    db.save();
  }
  return category;
}

function channelOverwrites(guild, roles, botId, access, type) {
  if (!access) return undefined;
  const voice = type === ChannelType.GuildVoice;
  const deny = voice ? [P.Connect] : [P.SendMessages];
  const allow = voice
    ? [P.Connect, P.Speak, P.ViewChannel]
    : [P.SendMessages, P.ReadMessageHistory, P.ViewChannel];
  const entries = [{ id: guild.id, deny }];
  if (access === 'verified') {
    for (const key of ['verified', 'member']) {
      if (roles[key]) entries.push({ id: roles[key], allow });
    }
  }
  for (const key of STAFF_KEYS) {
    if (roles[key]) entries.push({ id: roles[key], allow });
  }
  entries.push({ id: botId, allow: voice ? [P.Connect, P.Speak, P.ViewChannel] : [P.SendMessages, P.ReadMessageHistory, P.ViewChannel, P.EmbedLinks] });
  return entries;
}

async function fetchOrCreateChannel(guild, state, def, categories, roles, botId) {
  let channel = state.channels[def.key] ? await guild.channels.fetch(state.channels[def.key]).catch(() => null) : null;
  if (!channel) {
    const options = {
      name: def.name,
      type: def.type || ChannelType.GuildText,
      parent: categories[def.category].id,
      reason: 'Uranium support server template',
    };
    if (def.topic && (!def.type || def.type === ChannelType.GuildText)) options.topic = def.topic;
    const overwrites = channelOverwrites(guild, roles, botId, def.access, def.type);
    if (overwrites) options.permissionOverwrites = overwrites;
    channel = await guild.channels.create(options);
    state.channels[def.key] = channel.id;
    db.save();
  }
  return channel;
}

async function sendPanel(channel, savedId, payload) {
  if (savedId) {
    const old = await channel.messages.fetch(savedId).catch(() => null);
    if (old) return old;
  }
  return channel.send(payload);
}

async function createSupportTemplate(c) {
  const guild = c.g;
  const member = c.i.member;
  const botMember = c.me;
  if (!member.permissions.has(P.ManageGuild) && !member.permissions.has(P.Administrator)) {
    throw new UserError('You need Manage Server permission to build this template.');
  }
  if (!botMember.permissions.has(P.ManageChannels) || !botMember.permissions.has(P.ManageRoles)) {
    throw new UserError('Uranium needs both Manage Channels and Manage Roles.', 'Grant those two permissions, then run /template support again.');
  }

  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});
  if (guild.roles.cache.size + ROLE_DEFS.length > 250) throw new UserError('This server is too close to Discord’s role limit.', 'Remove unused roles before running the template.');
  if (guild.channels.cache.size + CATEGORY_DEFS.length + CHANNEL_DEFS.length > 500) throw new UserError('This server is too close to Discord’s channel limit.', 'Remove unused channels before running the template.');

  const data = db.g(guild.id);
  let state = data.supportTemplate;
  if (state?.status === 'complete') throw new UserError('The Uranium support template is already installed.', 'This command will not create duplicate channels or roles.');
  if (!state) {
    state = { status: 'building', startedAt: Date.now(), roles: {}, categories: {}, channels: {}, panels: {} };
    data.supportTemplate = state;
    db.save();
  } else {
    state.status = 'building';
    state.roles ||= {};
    state.categories ||= {};
    state.channels ||= {};
    state.panels ||= {};
    db.save();
  }

  try {
    await c.i.editReply(statusPayload('Preparing your support server', 'Creating the role system first. No existing channels or roles will be deleted.'));

    const roles = {};
    for (const def of ROLE_DEFS) roles[def.key] = await fetchOrCreateRole(guild, state, def);

    await c.i.editReply(statusPayload('Building the channel layout', 'Creating six organized categories and 27 channels with matching permissions.'));

    const categories = {};
    for (const def of CATEGORY_DEFS) categories[def.key] = await fetchOrCreateCategory(guild, state, def, state.roles, botMember.id);

    for (const def of CHANNEL_DEFS) {
      const channel = await fetchOrCreateChannel(guild, state, def, categories, state.roles, botMember.id);
      if (def.key === 'modLogs') data.config.modlog = channel.id;
    }

    await c.i.editReply(statusPayload('Adding interactive panels', 'Setting up the rules acknowledgement and private support-ticket buttons.'));

    const verifyChannel = await guild.channels.fetch(state.channels.verify);
    const verifyPanel = await sendPanel(verifyChannel, state.panels.verify, {
      ...statusPayload('Welcome to the community', 'Read <#' + state.channels.rules + '> first. When you are ready, click **I agree to the rules** to receive the Verified role and unlock community chat.', 0x22c55e, [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('template:verify').setLabel('I agree to the rules').setEmoji(icons.E('check')).setStyle(ButtonStyle.Success))]),
      allowedMentions: { parse: [] },
    });
    state.panels.verify = verifyPanel.id;
    db.save();

    const ticketChannel = await guild.channels.fetch(state.channels.openTicket);
    const ticketPanel = await sendPanel(ticketChannel, state.panels.ticket, {
      ...statusPayload('Need help?', 'Press **Open a support ticket** to create a private channel with the support team. Please include the details needed to understand your issue.', 0x8b5cf6, [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('template:ticket').setLabel('Open a support ticket').setEmoji(icons.E('support')).setStyle(ButtonStyle.Primary))]),
      allowedMentions: { parse: [] },
    });
    state.panels.ticket = ticketPanel.id;
    db.save();

    const welcomeChannel = await guild.channels.fetch(state.channels.welcome);
    await sendPanel(welcomeChannel, state.panels.welcome, {
      ...statusPayload('Welcome to ' + guild.name, 'Start with <#' + state.channels.rules + '>, then visit <#' + state.channels.verify + '> to unlock the community. Need assistance? Open a ticket in <#' + state.channels.openTicket + '>.', 0x39d98a),
      allowedMentions: { parse: [] },
    }).then(m => { state.panels.welcome = m.id; db.save(); });

    const commandsChannel = await guild.channels.fetch(state.channels.commands);
    const site = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const commandDescription = 'Browse the full command library with search and categories.' + (site ? '\n' + site + '/commands' : '\nUse /help in any server channel.');
    await sendPanel(commandsChannel, state.panels.commands, {
      ...statusPayload('Uranium command library', commandDescription, 0x38bdf8),
      allowedMentions: { parse: [] },
    }).then(m => { state.panels.commands = m.id; db.save(); });

    const contentResult = await supportContent.publishTemplateContent(guild, state, c.i.client);
    data.config.supportTemplate = true;
    state.status = 'complete';
    state.completedAt = Date.now();
    state.lastError = null;
    db.save();

    await c.i.editReply(statusPayload('Support server created!', 'Your layout is ready: **6 categories**, **27 channels**, and **12 styled roles**.\n\n• Channel-specific starter posts: **' + contentResult.posted + '**\n• Rules acknowledgement and Verified role button\n• Private support-ticket creation and close controls\n• Staff-only channels and logs\n• Read-only announcements and resource channels\n• Verified-only community chat\n\nNext: assign your real staff members to the matching roles and review the rules before inviting people.', 0x22c55e));
    return { handled: true };
  } catch (error) {
    state.status = 'partial';
    state.lastError = String(error?.message || error).slice(0, 250);
    db.save();
    throw new UserError('The template stopped partway through. Any channels and roles already created were left in place.', 'Fix the permission or hierarchy issue, then run /template support again to resume. Details: ' + state.lastError);
  }
}

async function refreshSupportTemplate(c) {
  const guild = c.g;
  if (!c.i.member.permissions.has(P.ManageGuild) && !c.i.member.permissions.has(P.Administrator)) {
    throw new UserError('You need Manage Server permission to refresh support content.');
  }
  const state = db.g(guild.id).supportTemplate;
  if (!state || state.status !== 'complete') {
    throw new UserError('No completed Uranium support template was found in this server.', 'Run /template support first.');
  }
  const result = await supportContent.publishTemplateContent(guild, state, c.i.client);
  db.save();
  const lines = [
    'Posted: **' + result.posted + '**',
    'Updated: **' + result.updated + '**',
    'Skipped: **' + result.skipped + '**',
    'Errors: **' + result.errors.length + '**'
  ];
  if (result.errors.length) lines.push('Some channels could not be updated: ' + result.errors.map(x => x.channel + ' (' + x.message + ')').join('; ').slice(0, 700));
  await c.i.editReply(statusPayload('Support content refreshed', lines.join('\n'), result.errors.length ? 0xf59e0b : 0x22c55e));
  return { handled: true };
}

async function onButton(i) {
  if (!i.customId || !i.customId.startsWith('template:')) return false;
  if (!i.inGuild() || !i.guild) return i.reply({ content: 'This button only works inside a server.', flags: MessageFlags.Ephemeral });

  const data = db.g(i.guildId);
  const state = data.supportTemplate;
  if (!state || state.status !== 'complete') {
    return i.reply({ content: 'The support template is not fully configured in this server.', flags: MessageFlags.Ephemeral });
  }

  const action = i.customId.split(':')[1];
  if (action === 'verify') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const role = await i.guild.roles.fetch(state.roles.verified).catch(() => null);
    if (!role) return i.editReply({ content: 'The Verified role is missing. Ask a server admin to repair the template.' });
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return i.editReply({ content: 'I could not find your server membership.' });
    if (member.roles.cache.has(role.id)) return i.editReply({ content: 'You already have the Verified role. Welcome in! 💜' });
    try {
      await member.roles.add(role, 'Accepted the server rules using the Uranium verification panel');
      return i.editReply({ content: '✅ Rules accepted. Your Verified role has been added. Welcome!' });
    } catch {
      return i.editReply({ content: 'I could not assign the Verified role. The bot needs Manage Roles and its highest role must be above Verified.' });
    }
  }

  if (action === 'ticket') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return i.editReply({ content: 'I could not find your server membership.' });
    await i.guild.channels.fetch().catch(() => {});
    const existing = i.guild.channels.cache.find(ch => ch.topic === 'uranium-ticket:' + member.id + ':open');
    if (existing) return i.editReply({ content: 'You already have an open ticket: ' + existing.toString() });

    const parent = await i.guild.channels.fetch(state.categories.support).catch(() => null);
    if (!parent) return i.editReply({ content: 'The support category is missing. Ask an admin to repair the template.' });

    const overwrites = [
      { id: i.guild.id, deny: [P.ViewChannel] },
      { id: member.id, allow: BASIC_TICKET_ACCESS },
      { id: i.client.user.id, allow: [...BASIC_TICKET_ACCESS, P.ManageChannels] },
    ];
    for (const key of STAFF_KEYS) {
      const roleId = state.roles[key];
      if (roleId) overwrites.push({ id: roleId, allow: BASIC_TICKET_ACCESS });
    }

    const slug = String(member.user.username || 'member').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'member';
    try {
      const channel = await i.guild.channels.create({
        name: 'ticket-' + slug,
        type: ChannelType.GuildText,
        parent: parent.id,
        topic: 'uranium-ticket:' + member.id + ':open',
        permissionOverwrites: overwrites,
        reason: 'Support ticket opened by ' + member.user.tag,
      });
      await channel.send({
        ...statusPayload('Support ticket', 'Welcome <@' + member.id + '>! Describe your issue and attach any useful context. A support team member will reply here.', 0x8b5cf6, [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('template:close').setLabel('Close ticket').setEmoji(icons.E('lock')).setStyle(ButtonStyle.Danger))]),
        allowedMentions: { users: [member.id] },
      });
      return i.editReply(cv2.message([cv2.text('# ' + icons.E('check') + ' Ticket created\\nYour private ticket is ready: ' + channel.toString())], 0x22c55e));
    } catch (error) {
      console.error('[support ticket create]', error);
      return i.editReply(cv2.message([cv2.text('# ' + icons.E('warn') + ' Ticket creation failed\\nCheck that Uranium has Manage Channels and View Channel permissions.')], 0xff4d6d));
    }
  }

  if (action === 'close') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = i.channel;
    const match = /^uranium-ticket:(\d{17,20}):open$/.exec(String(channel?.topic || ''));
    if (!match) return i.editReply(cv2.ephemeralMessage([cv2.text('# ' + icons.E('warn') + ' This is not an open Uranium ticket.')], 0xffb84d));
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return i.editReply(cv2.ephemeralMessage([cv2.text('# ' + icons.E('warn') + ' I could not verify your server membership.')], 0xffb84d));
    const isOpener = member.id === match[1];
    const isStaff = member.permissions.has(P.ManageChannels) || STAFF_KEYS.some(key => state.roles[key] && member.roles.cache.has(state.roles[key]));
    if (!isOpener && !isStaff) return i.editReply(cv2.ephemeralMessage([cv2.text('# ' + icons.E('cross') + ' Access denied\\nOnly the ticket opener or support staff can close this ticket.')], 0xff4d6d));
    try {
      await channel.permissionOverwrites.edit(match[1], { ViewChannel: false, SendMessages: false }, { reason: 'Uranium support ticket closed' }).catch(() => {});
      await channel.setName(('closed-' + channel.name.replace(/^ticket-/, '')).slice(0, 95), 'Uranium support ticket closed');
      await channel.setTopic('uranium-ticket:' + match[1] + ':closed');
      await channel.send({ ...cv2.message([cv2.text('# ' + icons.E('lock') + ' Ticket closed\\nStaff can continue reviewing this channel.')], 0x8b5cf6), allowedMentions: { users: [i.user.id] } });
      await i.message.edit({ components: [] }).catch(() => {});
      return i.editReply(cv2.message([cv2.text('# ' + icons.E('check') + ' Ticket closed\\nThe channel is now hidden from its opener and remains available to staff.')], 0x22c55e));
    } catch {
      return i.editReply(cv2.ephemeralMessage([cv2.text('# ' + icons.E('warn') + ' Could not close ticket\\nCheck the bot’s Manage Channels permission.')], 0xff4d6d));
    }
  }

  return i.reply(cv2.ephemeralMessage([cv2.text('# ' + icons.E('warn') + ' This template button is not recognized.')], 0xffb84d));
}

module.exports = { createSupportTemplate, refreshSupportTemplate, onButton };
