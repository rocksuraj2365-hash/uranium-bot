const { PermissionFlagsBits: P, AutoModerationRuleEventType: EV, AutoModerationRuleTriggerType: TT, AutoModerationActionType: AT, AutoModerationRuleKeywordPresetType: PS, ChannelType: CT } = require('discord.js');
const { C, S, I, CH, R } = require('../lib/cmd');
const { UserError, res, trunc, parseDuration, fmt, clean } = require('../lib/util');

const MG = P.ManageGuild;
const RULE = () => S('rule', 'Pick an AutoMod rule', true, { ac: true });
const WORDS = (d = 'Words separated by commas') => S('words', d, true, { max: 900 });
const BLOCK = { type: AT.BlockMessage, metadata: { customMessage: 'This message was blocked by Uranium AutoMod.' } };
const words = (s) => {
  const w = [...new Set(String(s).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!w.length) throw new UserError('No words found', 'Type words separated by commas, like: spam, scam, badword');
  if (w.some((x) => x.length > 60)) throw new UserError('One word is longer than 60 characters', 'Use shorter words.');
  return w.slice(0, 100);
};
const norm = (a) => ({ type: a.type, metadata: clean({ channel: a.metadata?.channelId, durationSeconds: a.metadata?.durationSeconds, customMessage: a.metadata?.customMessage }) });
async function rule(c) {
  const r = await c.g.autoModerationRules.fetch(c.s('rule')).catch(() => null);
  if (!r) throw new UserError('That AutoMod rule was not found', 'Pick a rule from the list that appears while typing, or use /automod rules.');
  return r;
}
function kw(r) { if (r.triggerType !== TT.Keyword) throw new UserError('That rule is not a keyword rule', 'Pick a rule created with /automod keyword-create.'); return r; }
const make = (c, name, triggerType, triggerMetadata, actions = [BLOCK]) => c.g.autoModerationRules.create({ name, eventType: EV.MessageSend, triggerType, triggerMetadata, actions, enabled: true, reason: c.audit() });
const made = (r, what) => res(`${what} created`, `Rule **${r.name}** is active.`, { icon: '🛡️', fields: [['Rule ID', `\`${r.id}\``]], undo: { label: 'Rule deleted', fn: () => r.delete() } });
async function regex(c, name, pats) { return made(await make(c, name, TT.Keyword, { regexPatterns: pats }), name); }
async function preset(c, p, label) {
  const ex = [...(await c.g.autoModerationRules.fetch()).values()].find((r) => r.triggerType === TT.KeywordPreset);
  if (ex) { const set = [...new Set([...(ex.triggerMetadata.presets || []), ...p])]; await ex.setTriggerMetadata({ presets: set }, c.audit()); return res(`${label} enabled`, `Added to existing rule **${ex.name}**.`, { icon: '🛡️' }); }
  return made(await make(c, 'Uranium Filter', TT.KeywordPreset, { presets: p }), label);
}
async function ex(c, kind, add) {
  const r = await rule(c); const isRole = kind === 'roles'; const item = isRole ? c.r('role') : c.c('channel');
  const cur = [...(isRole ? r.exemptRoles : r.exemptChannels).keys()];
  const next = add ? [...new Set([...cur, item.id])] : cur.filter((x) => x !== item.id);
  if (isRole) await r.setExemptRoles(next, c.audit()); else await r.setExemptChannels(next, c.audit());
  return res(add ? 'Exemption added' : 'Exemption removed', `${isRole ? `<@&${item.id}>` : `<#${item.id}>`} ${add ? 'is now ignored by' : 'is now checked by'} **${r.name}**.`, { icon: '🛡️' });
}

module.exports = {
  name: 'automod', description: 'Discord AutoMod rules: filters, spam, links',
  commands: [
    C('rules', 'List all AutoMod rules', [], MG, async (c) => {
      const l = [...(await c.g.autoModerationRules.fetch()).values()];
      return res(`AutoMod rules (${l.length})`, l.length ? trunc(l.map((r) => `${r.enabled ? '🟢' : '🔴'} **${r.name}** • \`${r.id}\``).join('\n'), 3800) : '_No rules yet. Try /automod spam-enable._', { icon: '🛡️', color: 0x5b8cff });
    }),
    C('keyword-create', 'Block messages that contain certain words', [S('name', 'Rule name', true, { max: 100 }), WORDS()], MG, async (c) => made(await make(c, c.s('name'), TT.Keyword, { keywordFilter: words(c.s('words')) }), 'Keyword rule')),
    C('keyword-add', 'Add words to a keyword rule', [RULE(), WORDS()], MG, async (c) => {
      const r = kw(await rule(c)); const add = words(c.s('words')); const all = [...new Set([...(r.triggerMetadata.keywordFilter || []), ...add])];
      if (all.length > 1000) throw new UserError('A rule can hold at most 1000 words'); await r.setTriggerMetadata({ keywordFilter: all, regexPatterns: r.triggerMetadata.regexPatterns }, c.audit());
      return res('Words added', `**${add.length}** word(s) added to **${r.name}**.`, { icon: '➕' });
    }),
    C('keyword-remove', 'Remove words from a keyword rule', [RULE(), WORDS()], MG, async (c) => {
      const r = kw(await rule(c)); const del = words(c.s('words')); const left = (r.triggerMetadata.keywordFilter || []).filter((x) => !del.includes(x));
      await r.setTriggerMetadata({ keywordFilter: left, regexPatterns: r.triggerMetadata.regexPatterns }, c.audit());
      return res('Words removed', `**${r.name}** now has **${left.length}** word(s).`, { icon: '➖' });
    }),
    C('spam-enable', 'Block spam messages automatically', [], MG, async (c) => {
      const existing = [...(await c.g.autoModerationRules.fetch()).values()].find((r) => r.triggerType === TT.Spam);
      if (existing) {
        if (!existing.enabled) await existing.setEnabled(true, c.audit());
        return res('Anti-spam enabled', 'Using the existing Discord SPAM rule **' + existing.name + '**. No duplicate rule was created.', { icon:'🛡️', fields:[['Rule ID', String(existing.id)]] });
      }
      return made(await make(c, 'Uranium Anti-Spam', TT.Spam), 'Anti-spam rule');
    }),
    C('mention-spam', 'Block messages with too many mentions', [I('limit', 'Max mentions per message (1-50)', true, 1, 50)], MG, async (c) => made(await make(c, `Max ${c.n('limit')} mentions`, TT.MentionSpam, { mentionTotalLimit: c.n('limit') }), 'Mention limit')),
    C('preset-profanity', 'Turn on Discord\'s profanity filter', [], MG, (c) => preset(c, [PS.Profanity], 'Profanity filter')),
    C('preset-sexual', 'Turn on Discord\'s sexual content filter', [], MG, (c) => preset(c, [PS.SexualContent], 'Sexual content filter')),
    C('preset-slurs', 'Turn on Discord\'s slurs filter', [], MG, (c) => preset(c, [PS.Slurs], 'Slurs filter')),
    C('preset-all', 'Turn on all Discord word filters', [], MG, (c) => preset(c, [PS.Profanity, PS.SexualContent, PS.Slurs], 'All word filters')),
    C('rule-delete', 'Delete an AutoMod rule', [RULE()], MG, async (c) => { const r = await rule(c); const n = r.name; await r.delete(c.audit()); return res('Rule deleted', `**${n}** was removed.`, { icon: '🗑️', color: 0xff4d6d }); }, { danger: 'This will **delete the AutoMod rule**.' }),
    C('rule-enable', 'Turn a rule on', [RULE()], MG, async (c) => { const r = await rule(c); await r.setEnabled(true, c.audit()); return res('Rule enabled', `**${r.name}** is on.`, { icon: '🟢', undo: { label: 'Rule disabled', fn: () => r.setEnabled(false) } }); }),
    C('rule-disable', 'Turn a rule off', [RULE()], MG, async (c) => { const r = await rule(c); await r.setEnabled(false, c.audit()); return res('Rule disabled', `**${r.name}** is off.`, { icon: '🔴', undo: { label: 'Rule enabled', fn: () => r.setEnabled(true) } }); }),
    C('rule-view', 'Show details of a rule', [RULE()], MG, async (c) => {
      const r = await rule(c); const m = r.triggerMetadata || {};
      return res(r.name, null, { icon: '🛡️', color: 0x5b8cff, fields: [['Status', r.enabled ? '🟢 On' : '🔴 Off', true], ['ID', `\`${r.id}\``, true], ['Words', String((m.keywordFilter || []).length), true], ['Patterns', String((m.regexPatterns || []).length), true], ['Exempt roles', String(r.exemptRoles.size), true], ['Exempt channels', String(r.exemptChannels.size), true]] });
    }),
    C('rule-rename', 'Rename a rule', [RULE(), S('name', 'New name', true, { max: 100 })], MG, async (c) => { const r = await rule(c); const old = r.name; await r.setName(c.s('name'), c.audit()); return res('Rule renamed', `**${old}** → **${c.s('name')}**`, { icon: '✏️' }); }),
    C('exempt-role', 'Make a role ignore a rule', [RULE(), R('role', 'Role to ignore')], MG, (c) => ex(c, 'roles', true)),
    C('exempt-channel', 'Make a channel ignore a rule', [RULE(), CH('channel', 'Channel to ignore', true, [CT.GuildText, CT.GuildVoice, CT.GuildAnnouncement])], MG, (c) => ex(c, 'channels', true)),
    C('unexempt-role', 'Make a role follow a rule again', [RULE(), R('role', 'Role')], MG, (c) => ex(c, 'roles', false)),
    C('unexempt-channel', 'Make a channel follow a rule again', [RULE(), CH('channel', 'Channel', true, [CT.GuildText, CT.GuildVoice, CT.GuildAnnouncement])], MG, (c) => ex(c, 'channels', false)),
    C('alert-channel', 'Send an alert to a channel when a rule triggers', [RULE(), CH('channel', 'Alert channel', true, [CT.GuildText])], MG, async (c) => {
      const r = await rule(c); const ch = c.c('channel');
      await r.setActions([...r.actions.filter((a) => a.type !== AT.SendAlertMessage).map(norm), { type: AT.SendAlertMessage, metadata: { channel: ch.id } }], c.audit());
      return res('Alert channel set', `**${r.name}** will alert <#${ch.id}>.`, { icon: '🚨' });
    }),
    C('action-timeout', 'Timeout people who trigger a rule', [RULE(), S('duration', 'e.g. 10m, 1h (max 4 weeks)', true, { max: 20 })], MG, async (c) => {
      const r = await rule(c); const ms = parseDuration(c.s('duration'));
      if (ms > 28 * 864e5) throw new UserError('Timeout cannot be longer than 4 weeks', 'Use a shorter duration.');
      await r.setActions([...r.actions.filter((a) => a.type !== AT.Timeout).map(norm), { type: AT.Timeout, metadata: { durationSeconds: Math.floor(ms / 1000) } }], c.audit());
      return res('Timeout action set', `**${r.name}** now times people out for **${fmt(ms)}**.`, { icon: '⏱️' });
    }),
    C('action-block-message', 'Change the text shown when a message is blocked', [RULE(), S('message', 'Text shown to the user', true, { max: 150 })], MG, async (c) => {
      const r = await rule(c);
      await r.setActions([...r.actions.filter((a) => a.type !== AT.BlockMessage).map(norm), { type: AT.BlockMessage, metadata: { customMessage: c.s('message') } }], c.audit());
      return res('Block message set', c.s('message'), { icon: '💬' });
    }),
    C('block-links', 'Block messages that contain links', [], MG, (c) => regex(c, 'Uranium Block Links', ['https?://\\S+'])),
    C('block-invites', 'Block Discord invite links', [], MG, (c) => regex(c, 'Uranium Block Invites', ['(discord(app)?\\.com/invite|discord\\.gg)/\\S+'])),
    C('block-everyone', 'Block @everyone and @here text pings', [], MG, (c) => regex(c, 'Uranium Block Mass Pings', ['@(everyone|here)'])),
  ],
};
