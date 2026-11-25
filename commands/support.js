const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { C, S, I, CH, R } = require('../lib/cmd');
const { UserError, res, trunc } = require('../lib/util');
const tickets = require('../lib/tickets');

const reportCooldown = new Map();
const feedbackCooldown = new Map();

async function submitReport(c) {
  const userId = c.i.user.id, now = Date.now();
  for (const [id, until] of reportCooldown) if (until <= now) reportCooldown.delete(id);
  const until = reportCooldown.get(userId) || 0;
  if (until > now) throw new UserError('Please wait before sending another report.', 'Try again in ' + Math.ceil((until - now) / 60000) + ' minute(s).');
  const details = String(c.s('details') || '').trim();
  if (details.length < 8) throw new UserError('Please add a little more detail.', 'A useful report needs at least 8 characters.');
  const payload = {
    ...cv2.message([cv2.text('# ' + icons.E('support') + ' Uranium user report\n\n' + trunc(details, 1000) + '\n\n**Reporter:** ' + c.i.user.username + ' (' + userId + ')\n**Server:** ' + trunc(c.g.name, 100) + '\n**Channel:** #' + trunc(c.ch?.name || 'unknown', 90) + ' (' + (c.ch?.id || 'unknown') + ')')], 0x8b5cf6),
    allowedMentions: { parse: [] },
  };
  let delivered = false;
  const reportChannelId = String(process.env.BOT_REPORT_CHANNEL_ID || '').trim();
  if (reportChannelId) {
    const channel = await c.i.client.channels.fetch(reportChannelId).catch(() => null);
    const everyoneCanView = channel?.guild ? channel.permissionsFor(channel.guild.roles.everyone)?.has(P.ViewChannel) !== false : true;
    if (channel?.isTextBased?.() && typeof channel.send === 'function' && !everyoneCanView) {
      await channel.send(payload).then(() => { delivered = true; }).catch(() => {});
    }
  }
  if (!delivered) {
    const owners = [...new Set(String(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id)))];
    for (const ownerId of owners) {
      const owner = await c.i.client.users.fetch(ownerId).catch(() => null);
      if (!owner) continue;
      try { await owner.send(payload); delivered = true; } catch {}
    }
  }
  if (!delivered) throw new UserError('Reporting is temporarily unavailable.', 'Please contact a server administrator or the bot operator directly.');
  reportCooldown.set(userId, now + 5 * 60 * 1000);
  return res('Report sent', 'Thanks for reporting this. The Uranium operator has been notified. Your report is sent to the configured support destination and is not posted publicly.', { icon: '📨', color: 0x8b5cf6 });
}

async function submitFeedback(c) {
  const userId = c.i.user.id, now = Date.now();
  for (const [id, until] of feedbackCooldown) if (until <= now) feedbackCooldown.delete(id);
  const until = feedbackCooldown.get(userId) || 0;
  if (until > now) throw new UserError('You already sent feedback recently.', 'Please try again in ' + Math.ceil((until - now) / 3600000) + ' hour(s).');
  const rating = Number(c.n('rating'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new UserError('Choose a rating from 1 to 5.');
  const comment = String(c.s('comment') || '').trim();
  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const payload = {
    ...cv2.message([cv2.text('# ' + icons.E('atom') + ' Uranium user feedback\n\n**Rating:** ' + stars + ' **' + rating + '/5**\n**User:** ' + c.i.user.username + ' (' + userId + ')\n**Server:** ' + trunc(c.g.name, 100) + '\n\n**Feedback**\n' + trunc(comment || 'No written comment provided.', 1000))], rating >= 4 ? 0x39d98a : rating === 3 ? 0xffb84d : 0xff6b6b),
    allowedMentions: { parse: [] },
  };
  let delivered = false;
  const feedbackChannelId = String(process.env.BOT_FEEDBACK_CHANNEL_ID || '').trim();
  if (feedbackChannelId) {
    const channel = await c.i.client.channels.fetch(feedbackChannelId).catch(() => null);
    if (channel?.isTextBased?.() && typeof channel.send === 'function') {
      await channel.send(payload).then(() => { delivered = true; }).catch(() => {});
    }
  }
  if (!delivered) {
    const owners = [...new Set(String(process.env.OWNER_IDS || '').split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id)))];
    for (const ownerId of owners) {
      const owner = await c.i.client.users.fetch(ownerId).catch(() => null);
      if (!owner) continue;
      try { await owner.send(payload); delivered = true; } catch {}
    }
  }
  if (!delivered) throw new UserError('Feedback is temporarily unavailable.', 'The bot operator has not configured a feedback destination yet.');
  feedbackCooldown.set(userId, now + 60 * 60 * 1000);
  return res('Feedback received', 'Thank you for rating Uranium ' + rating + '/5. Your feedback was sent privately to the bot team.', { icon: '⭐', color: 0x8b5cf6 });
}

module.exports = {
  name: 'support',
  description: 'Tickets, feedback and user reports',
  commands: [
    C('report', 'Privately report a Uranium issue or policy concern', [S('details', 'Describe the issue (8-1000 characters)', true, { max: 1000 })], null, submitReport),
    C('feedback', 'Rate Uranium from 1 to 5 stars and leave optional feedback', [I('rating', 'Your rating from 1 (poor) to 5 (excellent)', true, 1, 5), S('comment', 'What should we improve? (optional)', false, { max: 500 })], null, submitFeedback),
    C('ticket-setup', 'Configure the free ticket panel and log channel', [
      CH('panel_channel', 'Channel where members open tickets', true, [ChannelType.GuildText]),
      CH('log_channel', 'Private channel for ticket close logs (optional)', false, [ChannelType.GuildText]),
      S('panel_title', 'Custom panel title (optional)', false, { max: 100 }),
      S('panel_message', 'Custom panel message (optional)', false, { max: 1000 }),
    ], null, tickets.setup, { custom: true, ephemeral: true }),
    C('ticket-category-add', 'Add or update a ticket category, staff role and welcome message', [
      S('name', 'Category name, e.g. Support or Rewards', true, { max: 80 }),
      S('emoji', 'Emoji shown in the dropdown (optional)', false, { max: 64 }),
      S('description', 'Short dropdown description (optional)', false, { max: 100 }),
      CH('ticket_category', 'Discord category where tickets will be created', true, [ChannelType.GuildCategory]),
      R('staff_role', 'Role allowed to view and manage these tickets', true),
      S('welcome_message', 'Message posted inside new tickets', true, { max: 1500 }),
    ], null, tickets.addCategory, { custom: true, ephemeral: true }),
    C('ticket-category-remove', 'Remove a ticket category without deleting open tickets', [
      S('name', 'Name of the category to remove', true, { max: 80 }),
    ], null, tickets.removeCategory, { custom: true, ephemeral: true }),
    C('ticket-panel', 'Publish or update the interactive ticket dropdown panel', [], null, tickets.publishPanel, { custom: true, ephemeral: true }),
    C('ticket-list', 'View configured ticket categories and staff roles', [], null, tickets.listCategories, { custom: true, ephemeral: true }),
  ],
};
