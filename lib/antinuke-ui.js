// lib/antinuke-ui.js
// Components V2 control panel + alert card for Uranium Anti-Nuke.
// Buttons use the bot's custom emoji pack when it is ready and fall back to plain emoji otherwise.
const { PermissionFlagsBits: P } = require('discord.js');
const cv2 = require('./cv2');
const { E } = require('./emojis');
const fortress = require('./fortress');
const db = require('./db');

// E() returns a plain diamond while the custom emoji is not uploaded yet: use a normal emoji instead.
const ic = (name, fallback) => { const v = E(name); return v && v !== '◆' ? v : fallback; };
const PK = (name, fallback) => ic('pk_' + name, fallback);

const OK = 0x22c55e, OFF = 0xef4444, ALERT = 0xff5555, INFO = 0x5b8cff;
const PUNISH_HELP = {
  timeout: 'Mute the actor for a while',
  strip: 'Remove dangerous roles, then mute',
  kick: 'Kick the actor from the server',
  ban: 'Ban the actor from the server',
};

function isManager(guild, userId, perms) {
  const cfg = fortress.antiConfig(guild);
  const owners = (process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean);
  return String(userId) === String(guild.ownerId) || owners.includes(String(userId)) ||
    (cfg.extraOwners || []).includes(String(userId)) || !!perms?.has(P.ManageGuild);
}

// Permissions the bot still needs for Anti-Nuke to really work.
function missingPerms(guild, cfg) {
  const me = guild.members?.me;
  if (!me) return [];
  const need = [['View Audit Log', P.ViewAuditLog]];
  if (cfg.punishment === 'ban') need.push(['Ban Members', P.BanMembers]);
  else if (cfg.punishment === 'kick') need.push(['Kick Members', P.KickMembers]);
  else {
    need.push(['Moderate Members', P.ModerateMembers]);
    if (cfg.punishment === 'strip') need.push(['Manage Roles', P.ManageRoles]);
  }
  return need.filter(([, perm]) => !me.permissions.has(perm)).map(([name]) => name);
}

function render(guild, off = false) {
  const cfg = fortress.antiConfig(guild);
  const st = fortress.status(guild);
  const on = !!cfg.enabled;
  const onCount = st.features.filter((f) => f.enabled).length;
  const modlog = db.g(guild.id).config.modlog;
  const missing = missingPerms(guild, cfg);
  const d = (x) => (off ? { ...x, disabled: true } : x);

  const header = `# ${PK('role_admin', '🛡️')} Uranium Anti-Nuke\n` +
    (on ? `${PK('lets_go', '🟢')} **ACTIVE**` : `${PK('alert_yellow', '🔴')} **OFF**`) +
    ` • ${onCount}/${st.features.length} protections on`;

  const lines = [
    `${PK('arrow_red', '▶️')} **Punishment:** ${fortress.PUNISHMENTS[cfg.punishment] || 'Timeout'}`,
    `${PK('arrow_blue_double', '⏱️')} **Trigger:** ${cfg.threshold} protected actions within ${Math.round(cfg.windowMs / 1000)}s`,
    `${PK('role_vip', '📋')} **Whitelist:** ${st.whitelist.length} • ${PK('role_admin', '👑')} **Extra Owners:** ${st.extraOwners.length}`,
    `${PK('announce', '📣')} **Alerts:** ${modlog ? `<#${modlog}>` : 'no log channel set, so I use the system channel or DM the owner (set one with `!modlog`)'}`,
  ];
  const kids = [cv2.text(header), cv2.separator(), cv2.text(lines.join('\n'))];
  if (missing.length) {
    kids.push(cv2.text(`${PK('star_alert', '⚠️')} **I am missing:** ${missing.join(', ')}. Anti-Nuke cannot work properly until I get these.`));
  }
  kids.push(cv2.separator());
  kids.push(cv2.row([
    d(cv2.button('an:toggle', on ? 'Turn OFF' : 'Turn ON', on ? 4 : 3, on ? PK('alert_yellow', '🔓') : PK('role_verified', '🛡️'))),
    d(cv2.button('an:lim-', '', 2, '➖')),
    d(cv2.button('an:lim+', '', 2, '➕')),
    d(cv2.button('an:wl', 'Whitelist', 2, PK('role_vip', '📋'))),
    d(cv2.button('an:eo', 'Extra Owners', 2, PK('role_admin', '👑'))),
  ]));
  kids.push(cv2.row([cv2.select('an:pun', 'How should I punish a nuker?',
    Object.entries(fortress.PUNISHMENTS).map(([value, label]) => ({
      label, value, description: PUNISH_HELP[value], default: value === (cfg.punishment || 'timeout'),
    })), off)]));
  const featureOptions = st.features.map((f) => ({
    label: f.label, value: f.key, description: f.enabled ? 'Currently ON' : 'Currently OFF', default: f.enabled,
  }));
  kids.push(cv2.row([{ ...cv2.select('an:feat', 'Pick which protections are ON', featureOptions, off), min_values: 0, max_values: featureOptions.length }]));
  kids.push(cv2.row([
    d(cv2.button('an:test', 'Send test alert', 1, PK('star_alert', '🔔'))),
    d(cv2.button('an:refresh', 'Refresh', 2, '🔄')),
    d(cv2.button('an:close', 'Close', 4, '✖️')),
  ]));
  return cv2.message(kids, off ? 0x6b7280 : on ? OK : OFF);
}

function listText(guild, list) {
  const cfg = fortress.antiConfig(guild);
  const values = cfg[list] || [];
  if (!values.length) return 'Nobody is on this list yet.';
  return values.slice(0, 40).map((x, i) => `${i + 1}. ` + (String(x).startsWith('role:') ? `<@&${String(x).slice(5)}>` : `<@${String(x).replace('user:', '')}>`)).join('\n');
}

function alertPayload({ guild, actorId, count, windowMs, labels, result, test }) {
  const kids = [
    cv2.text(`# ${PK('alert_yellow', '🚨')} ${test ? 'Anti-Nuke test alert' : 'Anti-Nuke triggered'}`),
    cv2.text([
      `**Actor:** <@${actorId}> (\`${actorId}\`)`,
      `**Activity:** ${count} protected actions in ${Math.round(windowMs / 1000)}s`,
      `**Protections hit:** ${[...new Set(labels)].join(', ').slice(0, 600)}`,
      `**Action taken:** ${String(result).slice(0, 600)}`,
    ].join('\n')),
    cv2.separator(),
    cv2.row([
      { ...cv2.button(`anx:ban:${actorId}`, 'Ban actor', 4, PK('arrow_red', '🔨')), disabled: !!test },
      { ...cv2.button(`anx:wl:${actorId}`, 'Whitelist', 3, PK('role_verified', '✅')), disabled: !!test },
      { ...cv2.button(`anx:ok:${actorId}`, 'Mark reviewed', 2, PK('star_alert', '👀')), disabled: !!test },
    ]),
  ];
  return { ...cv2.message(kids, test ? INFO : ALERT), allowedMentions: { parse: [] } };
}

const denied = () => cv2.ephemeralMessage([cv2.text('# 🔒 Not allowed\nOnly the server owner, Extra Owners or members with **Manage Server** can use Anti-Nuke controls.')], 0x8b5cf6);

// Persistent buttons on alert messages (customId: anx:<action>:<actorId>), routed from bot.js.
async function onAlertButton(i) {
  try {
    const [, action, actorId] = i.customId.split(':');
    const guild = i.guild;
    if (!guild) return i.reply(cv2.ephemeralMessage([cv2.text('Use this button inside the server.')], INFO));
    if (!isManager(guild, i.user.id, i.memberPermissions)) return i.reply(denied());
    if (!/^\d{17,20}$/.test(actorId || '')) return i.reply(cv2.ephemeralMessage([cv2.text('That alert is broken, please open `!antinuke` instead.')], INFO));
    if (action === 'ban') {
      try {
        await guild.members.ban(actorId, { reason: `Uranium Anti-Nuke alert: banned by ${i.user.tag}` });
        return i.reply(cv2.ephemeralMessage([cv2.text(`# ${PK('role_verified', '✅')} Banned\n<@${actorId}> was banned.`)], OK));
      } catch (error) {
        return i.reply(cv2.ephemeralMessage([cv2.text(`# ⚠️ Could not ban\n${String(error.message || error).slice(0, 200)}`)], 0xffb84d));
      }
    }
    if (action === 'wl') {
      fortress.addAccess(guild, 'whitelist', actorId);
      return i.reply(cv2.ephemeralMessage([cv2.text(`# ${PK('role_verified', '✅')} Whitelisted\n<@${actorId}> will not trigger Anti-Nuke any more.`)], OK));
    }
    return i.reply(cv2.ephemeralMessage([cv2.text(`# 👀 Reviewed\nMarked as reviewed by <@${i.user.id}>.`)], INFO));
  } catch (error) {
    console.error('[anti-nuke alert button]', error);
    if (!i.replied && !i.deferred) await i.reply(cv2.ephemeralMessage([cv2.text('Something went wrong with that button.')], 0xffb84d)).catch(() => {});
  }
}

// /antinuke panel and !antinuke
async function open(c) {
  const guild = c.g;
  const msg = await c.i.editReply(render(guild));
  const col = msg.createMessageComponentCollector({ time: 900000, idle: 300000, filter: (b) => b.customId.startsWith('an:') });
  col.on('collect', async (b) => {
    try {
      if (b.user.id !== c.i.user.id) {
        return b.reply(cv2.ephemeralMessage([cv2.text('# 🔒 Anti-Nuke panel\nOnly the member who opened this panel can use it. Run `!antinuke` to open your own.')], 0x8b5cf6));
      }
      if (!isManager(guild, b.user.id, b.memberPermissions)) return b.reply(denied());
      const key = b.customId.split(':')[1];
      const cfg = fortress.antiConfig(guild);
      if (key === 'close') { col.stop('closed'); return b.update(render(guild, true)); }
      if (key === 'toggle') { fortress.configureAntiNuke(guild, { enabled: !cfg.enabled }); return b.update(render(guild)); }
      if (key === 'lim-' || key === 'lim+') {
        const next = Math.min(10, Math.max(2, (cfg.threshold || 3) + (key === 'lim+' ? 1 : -1)));
        fortress.configureAntiNuke(guild, { threshold: next });
        return b.update(render(guild));
      }
      if (key === 'pun') {
        const value = b.values[0];
        if (fortress.PUNISHMENTS[value]) fortress.configureAntiNuke(guild, { punishment: value });
        return b.update(render(guild));
      }
      if (key === 'feat') {
        const picked = new Set(b.values);
        for (const k of fortress.FEATURE_KEYS) fortress.setFeature(guild, k, picked.has(k));
        return b.update(render(guild));
      }
      if (key === 'refresh') return b.update(render(guild));
      if (key === 'wl' || key === 'eo') {
        const list = key === 'wl' ? 'whitelist' : 'extraOwners';
        const title = key === 'wl' ? 'Whitelist' : 'Extra Owners';
        return b.reply(cv2.ephemeralMessage([cv2.text(`# ${PK('role_vip', '📋')} ${title}\n${listText(guild, list)}\n\nAdd with \`!${key === 'wl' ? 'wladd' : 'extraowneradd'} <id>\`, remove with \`!${key === 'wl' ? 'wlremove' : 'extraownerremove'} <id>\`.`)], INFO));
      }
      if (key === 'test') {
        const sent = await fortress.sendAlert(guild, alertPayload({
          guild, actorId: b.user.id, count: cfg.threshold, windowMs: cfg.windowMs,
          labels: ['Anti Channel Delete', 'Anti Role Delete'], result: 'Test only. Nobody was punished.', test: true,
        }), 'Anti-Nuke test alert. If you can read this, alerts work.');
        const where = !sent ? 'nowhere (no log channel, no system channel and the owner has DMs closed). Set one with `!modlog`.' : sent.isTextBased?.() ? `<#${sent.id}>` : 'the server owner by DM';
        return b.reply(cv2.ephemeralMessage([cv2.text(`# ${PK('star_alert', '🔔')} Test alert\nSent to ${where}`)], sent ? OK : 0xffb84d));
      }
      return b.update(render(guild));
    } catch (error) {
      console.error('[anti-nuke panel]', error);
      const fallback = cv2.ephemeralMessage([cv2.text('# ⚠️ That control failed\nOpen a fresh panel with `!antinuke`.')], 0xffb84d);
      if (b.deferred || b.replied) await b.editReply(fallback).catch(() => {});
      else await b.reply(fallback).catch(() => {});
    }
  });
  col.on('end', (_, reason) => { if (reason !== 'closed') c.i.editReply(render(guild, true)).catch(() => {}); });
  return { handled: true };
}

module.exports = { open, render, alertPayload, onAlertButton, isManager, missingPerms };
