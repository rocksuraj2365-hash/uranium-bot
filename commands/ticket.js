const { C, U, S, CH } = require('../lib/cmd');
const { ChannelType: CT } = require('discord.js');
const { UserError, res } = require('../lib/util');
const tickets = require('../lib/tickets');
const ui = require('../lib/ticket-ui');

const title = (name) => '🎫 Tickets • ' + name;
function needManager(c) {
  if (!ui.isManager(c.g, c.i.user.id, c.i.memberPermissions)) throw new UserError('You need the **Manage Server** permission to set up tickets.');
}
function ticketHere(c) {
  const t = tickets.cfgOf(c.g.id);
  const record = t.open[c.ch.id];
  if (!record) throw new UserError('This is not an open ticket', 'Run this command inside a ticket channel.');
  const category = t.categories.find((x) => x.id === record.catId);
  return { t, record, category };
}
function needStaff(c, category) {
  if (!tickets.isStaff(c.i.member, category)) throw new UserError('Only ticket staff can do this', 'You need a staff role of this category or the Manage Channels permission.');
}

async function config(c) { needManager(c); return ui.open(c); }
async function post(c) {
  needManager(c);
  const channel = c.c('channel') || c.ch;
  try { await tickets.postPanel(c.g, channel); } catch (error) {
    if (error.name === 'TicketError') throw new UserError(error.message, 'Add categories with `/ticket config`.');
    throw new UserError('I could not post the panel there', 'Give me View Channel, Send Messages and Embed Links in that channel.');
  }
  return res(title('Panel posted'), `The ticket panel is live in <#${channel.id}>. Anyone can use it.`, { icon: '🎫' });
}
async function add(c) {
  const { category } = ticketHere(c); needStaff(c, category);
  const user = c.u('user');
  await c.ch.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
  return res(title('Member added'), `<@${user.id}> can now see this ticket.`, { icon: '➕' });
}
async function remove(c) {
  const { record, category } = ticketHere(c); needStaff(c, category);
  const user = c.u('user');
  if (user.id === record.userId) throw new UserError('You cannot remove the ticket owner', 'Close the ticket instead.');
  await c.ch.permissionOverwrites.delete(user.id);
  return res(title('Member removed'), `<@${user.id}> can no longer see this ticket.`, { icon: '➖' });
}
async function close(c) {
  const { t, record, category } = ticketHere(c);
  if (!tickets.isStaff(c.i.member, category) && !(t.userClose && record.userId === c.i.user.id)) throw new UserError('You cannot close this ticket', 'Only the ticket owner or the staff can close it.');
  await tickets.closeTicket(c.ch, c.i.user, c.s('reason') || '');
  return res(title('Closing'), 'A transcript is saved and this channel is deleted in 5 seconds.', { icon: '🔒' });
}

module.exports = {
  name: 'ticket',
  desc: 'Free ticket system: a category panel, staff roles and welcome messages you set yourself, with transcripts.',
  commands: [
    C('config', 'Open the interactive ticket setup panel', [], null, config, { custom: true }),
    C('post', 'Post the ticket panel (anyone can use it) in a channel', [CH('channel', 'Where to post (default: here)', false, [CT.GuildText, CT.GuildAnnouncement])], null, post),
    C('add', 'Add a member to this ticket', [U(true, 'user', 'Member to add')], null, add),
    C('remove', 'Remove a member from this ticket', [U(true, 'user', 'Member to remove')], null, remove),
    C('close', 'Close this ticket and save a transcript', [S('reason', 'Reason (saved in the log)', false, { max: 200 })], null, close),
  ],
};
