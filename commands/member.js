const { PermissionFlagsBits: P } = require('discord.js');
const { C, U, S, I, DUR, RS } = require('../lib/cmd');
const db = require('../lib/db');
const { UserError, parseDuration, fmt, checkTarget, res, ts, trunc, snowflake } = require('../lib/util');

const MAXTO = 28 * 864e5;
const ids = (s) => [...new Set(String(s).split(/[\s,]+/).filter((x) => /^\d{17,20}$/.test(x)))].slice(0, 25);
const list = (arr, f) => (arr.length ? arr.map(f).join('\n') : '_Nothing here yet._');
const unban = (c, id) => () => c.g.members.unban(id, 'Undo by ' + c.i.user.username);

module.exports = {
  name: 'member', description: 'Member moderation: kick, ban, timeout, warn, notes',
  commands: [
    C('kick', 'Remove a member from the server (they can rejoin)', [U(), RS()], P.KickMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'kick');
      const dm = await c.notify(m.user, '👢 You were kicked', `From **${c.g.name}**\nReason: ${c.reason()}`);
      await m.kick(c.audit());
      return res('Member kicked', `**${m.user.username}** was removed from the server.`, { user: m.user, case: c.case('kick', m.id), fields: [['Reason', c.reason()], ['DM', dm, true]] });
    }),
    C('ban', 'Ban a user (works even if they already left)', [U(true, 'user', 'User to ban'), RS(), I('delete_days', 'Delete their messages from the last N days (0-7)', false, 0, 7)], P.BanMembers, async (c) => {
      const u = c.u('user'); const m = await c.g.members.fetch(u.id).catch(() => null); if (m) checkTarget(c, m, 'ban');
      const dm = m ? await c.notify(u, '🔨 You were banned', `From **${c.g.name}**\nReason: ${c.reason()}`) : 'Not in server';
      const days = c.n('delete_days') || 0;
      await c.g.members.ban(u.id, { deleteMessageSeconds: days * 86400, reason: c.audit() });
      return res('Member banned', `**${u.username}** has been banned.`, { user: u, case: c.case('ban', u.id), fields: [['Reason', c.reason()], ['DM', dm, true], ['Messages deleted', `${days} day(s)`, true]], undo: { label: `Unbanned ${u.username}`, fn: unban(c, u.id) } });
    }, { danger: 'This will **ban** the user from the server.' }),
    C('unban', 'Remove a ban', [U(true, 'user', 'User to unban'), RS()], P.BanMembers, async (c) => {
      const u = c.u('user'); await c.g.members.unban(u.id, c.audit());
      return res('Member unbanned', `**${u.username}** can join again.`, { user: u, case: c.case('unban', u.id), fields: [['Reason', c.reason()]] });
    }),
    C('softban', 'Ban and instantly unban to wipe their recent messages', [U(), I('delete_days', 'Days of messages to delete (1-7)', false, 1, 7), RS()], P.BanMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'softban'); const days = c.n('delete_days') || 1;
      await c.g.members.ban(m.id, { deleteMessageSeconds: days * 86400, reason: c.audit() });
      await c.g.members.unban(m.id, 'Softban finish');
      return res('Member softbanned', `**${m.user.username}** was kicked and ${days} day(s) of messages were deleted.`, { user: m.user, case: c.case('softban', m.id), fields: [['Reason', c.reason()]] });
    }, { danger: 'This will kick the member and delete their recent messages.' }),
    C('tempban', 'Ban for a limited time, then auto unban', [U(), DUR(), RS()], P.BanMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'ban'); const ms = parseDuration(c.s('duration'));
      const dm = await c.notify(m.user, '⏳ You were temporarily banned', `From **${c.g.name}** for **${fmt(ms)}**\nReason: ${c.reason()}`);
      await c.g.members.ban(m.id, { reason: c.audit() });
      db.schedule({ type: 'unban', at: Date.now() + ms, guildId: c.g.id, userId: m.id });
      return res('Member temp-banned', `**${m.user.username}** is banned until ${ts(Date.now() + ms)}.`, { user: m.user, case: c.case('tempban', m.id, { duration: ms }), fields: [['Duration', fmt(ms), true], ['Reason', c.reason()], ['DM', dm, true]], undo: { label: 'Ban removed', fn: unban(c, m.id) } });
    }, { danger: 'This will ban the member for the chosen time.' }),
    C('timeout', 'Mute a member for a set time (max 28 days)', [U(), DUR(), RS()], P.ModerateMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'timeout'); const ms = parseDuration(c.s('duration'));
      if (ms > MAXTO) throw new UserError('A timeout cannot be longer than 28 days', 'Try something like 10m, 2h or 7d.');
      const dm = await c.notify(m.user, '🔇 You were timed out', `In **${c.g.name}** for **${fmt(ms)}**\nReason: ${c.reason()}`);
      await m.timeout(ms, c.audit());
      return res('Member timed out', `**${m.user.username}** is muted until ${ts(Date.now() + ms)}.`, { user: m.user, case: c.case('timeout', m.id, { duration: ms }), fields: [['Duration', fmt(ms), true], ['Reason', c.reason()], ['DM', dm, true]], undo: { label: 'Timeout removed', fn: () => m.timeout(null, 'Undo') } });
    }),
    C('untimeout', 'Remove a timeout', [U(), RS()], P.ModerateMembers, async (c) => {
      const m = await c.m('user'); if (!m) throw new UserError('That user is not in this server');
      if (!m.isCommunicationDisabled()) throw new UserError(`**${m.user.username}** is not timed out`, 'Nothing to remove.');
      await m.timeout(null, c.audit());
      return res('Timeout removed', `**${m.user.username}** can talk again.`, { user: m.user, case: c.case('untimeout', m.id) });
    }),
    C('warn', 'Warn a member (saved in their record)', [U(), RS()], P.ModerateMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'warn');
      const w = db.addWarn(c.g.id, { userId: m.id, modId: c.i.user.id, reason: c.reason() });
      const total = db.g(c.g.id).warns.filter((x) => x.userId === m.id).length;
      const dm = await c.notify(m.user, '⚠️ You received a warning', `In **${c.g.name}**\nReason: ${c.reason()}\nTotal warnings: **${total}**`);
      return res('Member warned', `**${m.user.username}** now has **${total}** warning(s).`, { icon: '⚠️', color: 0xffb84d, user: m.user, case: c.case('warn', m.id), fields: [['Warning ID', `#${w.id}`, true], ['Reason', c.reason()], ['DM', dm, true]], undo: { label: `Warning #${w.id} removed`, fn: () => db.remove(c.g.id, 'warns', w.id) } });
    }),
    C('unwarn', 'Remove one warning by its ID', [I('id', 'Warning ID (see /member warnings)', true, 1)], P.ModerateMembers, async (c) => {
      if (!db.remove(c.g.id, 'warns', c.n('id'))) throw new UserError(`Warning #${c.n('id')} does not exist`, 'Use /member warnings to see IDs.');
      return res('Warning removed', `Warning **#${c.n('id')}** was deleted.`);
    }),
    C('warnings', 'Show a member\'s warnings', [U()], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const w = db.g(c.g.id).warns.filter((x) => x.userId === u.id);
      return res(`Warnings for ${u.username}`, list(w.slice(-15), (x) => `**#${x.id}** • ${trunc(x.reason, 120)} • ${ts(x.at)} by <@${x.modId}>`), { icon: '📋', user: u, color: 0x5b8cff, fields: [['Total', String(w.length), true]] });
    }),
    C('clear-warnings', 'Delete all warnings of a member', [U()], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const n = db.removeWhere(c.g.id, 'warns', (x) => x.userId === u.id);
      if (!n) throw new UserError(`**${u.username}** has no warnings`, 'Nothing to clear.');
      return res('Warnings cleared', `Deleted **${n}** warning(s) of **${u.username}**.`, { user: u });
    }),
    C('nick', 'Change a member\'s nickname', [U(), S('nickname', 'New nickname', true, { max: 32 })], P.ManageNicknames, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'rename'); const old = m.displayName; const oldNick = m.nickname;
      await m.setNickname(c.s('nickname'), c.audit());
      return res('Nickname changed', `**${old}** → **${c.s('nickname')}**`, { user: m.user, undo: { label: 'Nickname restored', fn: () => m.setNickname(oldNick) } });
    }),
    C('reset-nick', 'Remove a member\'s nickname', [U(), RS()], P.ManageNicknames, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'rename');
      if (!m.nickname) throw new UserError(`**${m.user.username}** has no nickname`, 'Nothing to reset.');
      await m.setNickname(null, c.audit());
      return res('Nickname reset', `**${m.user.username}** has their normal name again.`, { user: m.user });
    }),
    C('note-add', 'Add a private mod note about a member', [U(), S('note', 'The note', true, { max: 400 })], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const n = db.addNote(c.g.id, { userId: u.id, modId: c.i.user.id, text: c.s('note') });
      return res('Note added', `Note **#${n.id}** saved for **${u.username}**.`, { icon: '📝', user: u, fields: [['Note', c.s('note')]] });
    }),
    C('notes', 'Show mod notes and watchlist state of a member', [U()], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const d = db.g(c.g.id); const n = d.notes.filter((x) => x.userId === u.id); const w = d.watch.find((x) => x.userId === u.id);
      return res(`Notes for ${u.username}`, list(n.slice(-15), (x) => `**#${x.id}** • ${trunc(x.text, 150)} • ${ts(x.at)} by <@${x.modId}>`), { icon: '📝', color: 0x5b8cff, user: u, fields: [['On watchlist', w ? `Yes — ${trunc(w.reason, 100)}` : 'No', true]] });
    }),
    C('note-remove', 'Delete a note by its ID', [I('id', 'Note ID (see /member notes)', true, 1)], P.ModerateMembers, async (c) => {
      if (!db.remove(c.g.id, 'notes', c.n('id'))) throw new UserError(`Note #${c.n('id')} does not exist`, 'Use /member notes to see IDs.');
      return res('Note removed', `Note **#${c.n('id')}** was deleted.`);
    }),
    C('massban', 'Ban up to 25 user IDs at once', [S('ids', 'User IDs separated by space or comma', true, { max: 600 }), RS()], P.BanMembers, async (c) => {
      const list2 = ids(c.s('ids')); if (!list2.length) throw new UserError('No valid user IDs found', 'Paste 17-20 digit IDs separated by spaces.');
      let ok = 0; const bad = [];
      for (const id of list2) {
        try { const m = await c.g.members.fetch(id).catch(() => null); if (m) checkTarget(c, m, 'ban'); await c.g.members.ban(id, { reason: c.audit() }); c.case('ban', id); ok++; } catch { bad.push(id); }
      }
      return res('Mass ban finished', `Banned **${ok}** of **${list2.length}** user(s).`, { color: bad.length ? 0xffb84d : 0x39d98a, fields: bad.length ? [['Failed', bad.join(', ')]] : [] });
    }, { danger: 'This will ban **every ID** you listed.' }),
    C('mass-kick', 'Kick up to 25 members by ID at once', [S('ids', 'User IDs separated by space or comma', true, { max: 600 }), RS()], P.KickMembers, async (c) => {
      const list2 = ids(c.s('ids')); if (!list2.length) throw new UserError('No valid user IDs found', 'Paste 17-20 digit IDs separated by spaces.');
      let ok = 0; const bad = [];
      for (const id of list2) {
        try { const m = await c.g.members.fetch(id); checkTarget(c, m, 'kick'); await m.kick(c.audit()); c.case('kick', id); ok++; } catch { bad.push(id); }
      }
      return res('Mass kick finished', `Kicked **${ok}** of **${list2.length}** member(s).`, { color: bad.length ? 0xffb84d : 0x39d98a, fields: bad.length ? [['Failed / not in server', bad.join(', ')]] : [] });
    }, { danger: 'This will kick **every member** you listed.' }),
    C('ban-list', 'Show the latest banned users', [], P.BanMembers, async (c) => {
      const bans = await c.g.bans.fetch({ limit: 100 });
      return res('Banned users', bans.size ? [...bans.values()].slice(0, 25).map((b) => `**${b.user.username}** (\`${b.user.id}\`) — ${trunc(b.reason || 'No reason', 80)}`).join('\n') : '_Nobody is banned._', { icon: '🔨', color: 0x5b8cff, fields: [['Total shown', `${Math.min(bans.size, 25)} of ${bans.size}`, true]] });
    }),
    C('ban-check', 'Check if a user is banned', [U(true, 'user', 'User to check')], P.BanMembers, async (c) => {
      const u = c.u('user'); const b = await c.g.bans.fetch(u.id).catch(() => null);
      return res(b ? 'User is banned' : 'User is not banned', b ? `**${u.username}** — ${b.reason || 'No reason'}` : `**${u.username}** is not banned here.`, { icon: b ? '🔨' : '🟢', color: b ? 0xff4d6d : 0x39d98a, user: u });
    }),
    C('timeout-extend', 'Add more time to an active timeout', [U(), DUR(), RS()], P.ModerateMembers, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'timeout');
      if (!m.isCommunicationDisabled()) throw new UserError(`**${m.user.username}** is not timed out`, 'Use /member timeout first.');
      const add = parseDuration(c.s('duration')); const end = m.communicationDisabledUntilTimestamp + add;
      if (end - Date.now() > MAXTO) throw new UserError('Total timeout cannot pass 28 days', 'Use a smaller extra time.');
      await m.timeout(end - Date.now(), c.audit());
      return res('Timeout extended', `**${m.user.username}** is now muted until ${ts(end)}.`, { user: m.user, case: c.case('timeout-extend', m.id, { duration: add }), fields: [['Added', fmt(add), true]] });
    }),
    C('timeout-check', 'See how long a member\'s timeout has left', [U()], P.ModerateMembers, async (c) => {
      const m = await c.m('user'); if (!m) throw new UserError('That user is not in this server');
      const on = m.isCommunicationDisabled();
      return res(on ? 'Timeout active' : 'No timeout', on ? `**${m.user.username}** can talk again ${ts(m.communicationDisabledUntilTimestamp)}.` : `**${m.user.username}** is not timed out.`, { icon: on ? '🔇' : '🟢', color: on ? 0xffb84d : 0x39d98a, user: m.user });
    }),
    C('watch-add', 'Put a member on the mod watchlist', [U(), RS()], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const d = db.g(c.g.id);
      if (d.watch.some((x) => x.userId === u.id)) throw new UserError(`**${u.username}** is already on the watchlist`, 'Use /member notes to see why.');
      d.watch.push({ id: Date.now(), userId: u.id, reason: c.reason(), modId: c.i.user.id, at: Date.now() }); db.save();
      return res('Added to watchlist', `**${u.username}** is now being watched.`, { icon: '👁️', user: u, fields: [['Reason', c.reason()]] });
    }),
    C('watch-remove', 'Take a member off the mod watchlist', [U()], P.ModerateMembers, async (c) => {
      const u = c.u('user'); const n = db.removeWhere(c.g.id, 'watch', (x) => x.userId === u.id);
      if (!n) throw new UserError(`**${u.username}** is not on the watchlist`, 'Nothing to remove.');
      return res('Removed from watchlist', `**${u.username}** is no longer watched.`, { user: u });
    }),
  ],
};
