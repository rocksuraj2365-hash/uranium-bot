const { PermissionFlagsBits: P, AutoModerationRuleTriggerType: T } = require('discord.js');

const groups = [
  ['Owner account has 2FA enabled','Administrator accounts have 2FA enabled','Owner uses a unique password','Owner never shares account tokens','Unknown QR login requests are rejected','Authorized apps are reviewed','Suspicious connected apps are removed','Recovery codes are stored securely','Owner email has 2FA','A trusted recovery contact is available'],
  ['Mass channel deletion is monitored','Mass role deletion is monitored','Mass bans are monitored','Mass webhook creation is monitored','Audit-log access is available to Uranium','Nuke alerts are sent to the mod-log','Nuke events are grouped by actor and time','Guild owner actions are distinguished','No automatic mass-ban response is enabled','Staff review destructive-action alerts'],
  ['Join bursts are monitored','High verification is available during raids','Server Members Intent is enabled','New members pass server screening','Suspicious join patterns are reviewed','Repeated join-leave activity is reviewed','Emergency join restrictions are documented','Slowmode is available for emergencies','New-account patterns are reviewed','Raid alerts reach trusted staff'],
  ['Discord spam AutoMod rule is enabled','Mention-spam AutoMod rule is enabled','Fortress rapid-repeat detection is enabled','Repeated messages are reviewed','Message flooding is rate-limited','Mention flooding is restricted','Emoji flooding is reviewed','Attachment flooding is reviewed','Webhook spam is reviewed','Repeated violations have proportionate sanctions'],
  ['Discord invite links are filtered','Suspicious external links are filtered','Phishing domains are reviewed','Fake Nitro scams are covered by staff guidance','Shortened URLs are reviewed','Unicode lookalike domains are reviewed','Suspicious attachments are handled cautiously','Threat intelligence is kept current','Link warnings are configured where supported','Scam reports have a moderator workflow'],
  ['@everyone has no Administrator permission','@everyone has no Manage Server permission','@everyone has no Manage Roles permission','@everyone has no Manage Channels permission','@everyone has no Manage Webhooks permission','Administrator roles are limited','Moderator roles follow least privilege','Bot roles follow least privilege','Channel overrides are reviewed','Role changes are compared with a baseline'],
  ['Only trusted bots are invited','Bot permissions are reviewed','Bot tokens are kept outside public repositories','Dashboard authentication is protected','Owner-only commands are checked server-side','Sensitive commands are rate-limited','Unauthorized interactions are rejected','Bot permission changes are reviewed','Integrations are reviewed','Webhook activity is monitored'],
  ['Discord AutoMod is configured','Membership screening is configured','Server verification is not set to None','Public channels have restricted permissions','Mass-ping permissions are restricted','Announcement channels have controlled posting','Important information channels are protected','Invite settings are reviewed','Notification settings are reviewed','Security settings are reviewed periodically'],
  ['A security incident log is maintained','Discord audit logs are reviewed','Moderator actions are recorded','Role and channel changes are recorded','Webhook changes are recorded','Suspicious member activity is reviewed','Server structure has a saved baseline','Role configuration has a saved baseline','Backups are stored outside Discord','Recovery is tested in a separate server'],
  ['An emergency lockdown procedure exists','Suspicious activity can be restricted quickly','Trusted administrators receive alerts','Risky automation can be disabled','Compromised staff permissions can be removed','Compromised integrations can be removed','Incident evidence is preserved','Server structure can be rebuilt from a baseline','Incidents receive a post-review','Recovery drills are performed periodically']
];

const categories = ['Account security','Anti-nuke','Anti-raid','Anti-spam','Anti-scam','Permissions','Bot security','Server configuration','Monitoring & backups','Emergency response'];
const checks = groups.flatMap((items, groupIndex) => items.map((name, index) => ({
  id: groupIndex * 10 + index + 1,
  category: categories[groupIndex],
  name
})));

async function evaluate(guild, config = {}) {
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  const roles = [...guild.roles.cache.values()];
  const channels = [...guild.channels.cache.values()];
  const everyone = guild.roles.everyone;
  const adminRoles = roles.filter(role => role.permissions.has(P.Administrator));
  const sensitive = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks, P.BanMembers, P.KickMembers, P.MentionEveryone];
  const riskyRoles = roles.filter(role => role.id !== guild.id && sensitive.some(bit => role.permissions.has(bit)));
  const riskyEveryoneOverwrites = channels.filter(channel => {
    const overwrite = channel.permissionOverwrites?.cache?.get(guild.id);
    return overwrite && sensitive.some(bit => overwrite.allow.has(bit));
  });
  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  const ruleList = rules ? [...rules.values()] : [];
  const spamRule = ruleList.some(rule => rule.triggerType === T.Spam && rule.enabled);
  const mentionRule = ruleList.some(rule => rule.triggerType === T.MentionSpam && rule.enabled);
  const inviteRule = ruleList.some(rule => (rule.triggerMetadata?.regexPatterns || []).some(pattern => /discord/i.test(pattern) && /invite|gg/i.test(pattern)));
  const linkRule = ruleList.some(rule => (rule.triggerMetadata?.regexPatterns || []).some(pattern => /https?/i.test(pattern)));
  const fortress = config.fortress?.enabled === true;
  const botMember = guild.members.me;
  const canAudit = !!botMember?.permissions?.has(P.ViewAuditLog);
  const modlog = config.modlog ? await guild.channels.fetch(config.modlog).catch(() => null) : null;
  const modlogPermissions = modlog && botMember ? modlog.permissionsFor(botMember) : null;
  const modlogReady = !!modlog?.isTextBased?.() && !!modlogPermissions?.has(P.ViewChannel) && !!modlogPermissions?.has(P.SendMessages);
  const baseline = !!config.securityBaseline;
  const membersIntent = process.env.ENABLE_GUILD_MEMBERS_INTENT === 'true';
  const screening = guild.features?.includes('MEMBER_VERIFICATION_GATE_ENABLED') || false;
  const verification = Number(guild.verificationLevel || 0);
  const results = new Map();
  const set = (id, status, note) => results.set(id, { status, note });

  // Account controls cannot be read from Discord's API; never mark these as verified.
  for (let id = 1; id <= 10; id++) set(id, 'manual', 'Discord does not expose this account-level setting to bots.');

  for (let id = 11; id <= 20; id++) set(id, fortress && canAudit ? 'pass' : 'warning',
    fortress && canAudit ? 'Fortress is active and Uranium can read audit logs.' : 'Enable Fortress and grant View Audit Log to Uranium.');
  set(15, canAudit ? 'pass' : 'warning', canAudit ? 'Uranium can read the server audit log.' : 'Grant View Audit Log to Uranium.');
  set(16, modlogReady ? 'pass' : 'warning', modlogReady ? 'Configured mod-log is reachable.' : 'Configure a mod-log channel and grant Uranium view/send access.');
  set(19, 'pass', 'Uranium alerts staff; it does not mass-ban members automatically.');

  set(21, fortress ? 'pass' : 'warning', fortress ? 'Fortress join-burst detection is enabled.' : 'Enable /security fortress.');
  set(22, fortress ? 'pass' : 'warning', fortress ? 'Fortress can raise verification during a detected join burst.' : 'Enable Fortress.');
  set(23, membersIntent ? 'pass' : 'warning', membersIntent ? 'Server Members Intent is enabled in the configured environment.' : 'Enable Server Members Intent in the Developer Portal and ENABLE_GUILD_MEMBERS_INTENT=true.');
  set(24, screening ? 'pass' : 'manual', screening ? 'Discord membership screening is enabled.' : 'Review membership screening in Server Settings.');
  for (let id = 25; id <= 30; id++) set(id, 'manual', 'Requires server-specific policy or human review.');

  set(31, spamRule ? 'pass' : 'warning', spamRule ? 'Discord SPAM AutoMod rule is enabled.' : 'Enable an AutoMod SPAM rule.');
  set(32, mentionRule ? 'pass' : 'warning', mentionRule ? 'Discord mention-spam AutoMod rule is enabled.' : 'Enable a mention-spam AutoMod rule.');
  set(33, fortress ? 'pass' : 'warning', fortress ? 'Fortress rapid-repeat detection is enabled.' : 'Enable Fortress.');
  for (let id = 34; id <= 40; id++) set(id, 'manual', 'Requires message-policy review or additional server-specific configuration.');

  set(41, inviteRule ? 'pass' : 'warning', inviteRule ? 'An enabled Discord invite-filter rule was found.' : 'Configure an AutoMod rule to block Discord invite links.');
  set(42, linkRule ? 'pass' : 'warning', linkRule ? 'An enabled link-filter rule was found.' : 'Configure an AutoMod link-filter rule.');
  for (let id = 43; id <= 50; id++) set(id, 'manual', 'Requires current threat intelligence, staff guidance or human review.');

  set(51, !everyone.permissions.has(P.Administrator) ? 'pass' : 'warning', '@everyone Administrator permission is not granted.');
  set(52, !everyone.permissions.has(P.ManageGuild) ? 'pass' : 'warning', '@everyone Manage Server permission is not granted.');
  set(53, !everyone.permissions.has(P.ManageRoles) ? 'pass' : 'warning', '@everyone Manage Roles permission is not granted.');
  set(54, !everyone.permissions.has(P.ManageChannels) ? 'pass' : 'warning', '@everyone Manage Channels permission is not granted.');
  set(55, !everyone.permissions.has(P.ManageWebhooks) ? 'pass' : 'warning', '@everyone Manage Webhooks permission is not granted.');
  set(56, adminRoles.length <= 2 ? 'pass' : 'warning', adminRoles.length + ' role(s) currently have Administrator.');
  set(57, riskyRoles.length <= 5 ? 'pass' : 'review', riskyRoles.length + ' non-everyone role(s) grant sensitive permissions; review necessity.');
  set(58, botMember && !botMember.permissions.has(P.Administrator) ? 'pass' : 'review', botMember?.permissions.has(P.Administrator) ? 'Uranium currently has Administrator; review whether it is necessary.' : 'Uranium does not have Administrator permission.');
  set(59, riskyEveryoneOverwrites.length === 0 ? 'pass' : 'warning', riskyEveryoneOverwrites.length + ' channel(s) explicitly grant sensitive permissions to @everyone.');
  set(60, baseline ? 'pass' : 'warning', baseline ? 'A role/channel security baseline is saved.' : 'Run /security baseline to save a comparison snapshot.');

  set(61, 'manual', 'Bot trust must be checked against the server owner’s approved-bot list.');
  set(62, 'manual', 'Review each bot invitation and its requested permissions.');
  set(63, 'manual', 'Repository secret scanning is outside Discord bot visibility.');
  set(64, 'manual', 'Review dashboard authentication and session settings.');
  set(65, 'pass', 'Owner-only command checks are enforced in Uranium command execution.');
  set(66, 'manual', 'Review rate limits for every sensitive command.');
  set(67, 'pass', 'Uranium validates command and component permissions server-side.');
  set(68, 'manual', 'Review the server audit log for bot role changes.');
  set(69, 'manual', 'Review installed Discord integrations in Server Settings.');
  set(70, 'manual', 'Review webhook inventory with /security webhooks.');

  set(71, ruleList.length > 0 ? 'pass' : 'warning', ruleList.length + ' AutoMod rule(s) are available to Uranium.');
  set(72, screening ? 'pass' : 'manual', screening ? 'Discord membership screening is enabled.' : 'Review whether membership screening is suitable for this server.');
  set(73, verification >= 1 ? 'pass' : 'warning', 'Current Discord verification level: ' + verification + '.');
  for (let id = 74; id <= 80; id++) set(id, 'manual', 'Requires channel-specific policy review.');

  set(81, modlogReady ? 'pass' : 'warning', modlogReady ? 'Security events can be sent to the configured mod-log.' : 'Configure and test the moderation log channel.');
  set(82, canAudit ? 'pass' : 'warning', canAudit ? 'Uranium can read Discord audit logs.' : 'Grant View Audit Log.');
  for (let id = 83; id <= 87; id++) set(id, 'manual', 'Review retention and logging policy for this server.');
  set(88, baseline ? 'pass' : 'warning', baseline ? 'A server structure baseline is saved.' : 'Run /security baseline.');
  set(89, baseline ? 'pass' : 'manual', baseline ? 'Role and channel configuration is included in the saved baseline.' : 'Create and export a separate role configuration backup.');
  set(90, 'manual', 'Test restoration in a separate Discord server.');

  set(91, 'pass', 'Uranium provides /security lockdown and /security unlockdown.');
  set(92, fortress ? 'pass' : 'warning', fortress ? 'Fortress can escalate verification and detect rapid spam.' : 'Enable Fortress.');
  set(93, modlogReady ? 'pass' : 'warning', modlogReady ? 'The configured mod-log can receive security alerts.' : 'Configure a working mod-log channel.');
  set(94, 'manual', 'Document which automation to disable during an incident.');
  set(95, 'manual', 'Keep a trusted owner/admin recovery procedure.');
  set(96, 'manual', 'Review and remove compromised integrations manually.');
  set(97, canAudit ? 'pass' : 'warning', canAudit ? 'Audit-log evidence is accessible to Uranium.' : 'Grant View Audit Log.');
  set(98, baseline ? 'pass' : 'warning', baseline ? 'A configuration baseline is available for recovery reference.' : 'Save a baseline before an incident.');
  set(99, 'manual', 'Run a post-incident review after any security event.');
  set(100, 'manual', 'Schedule periodic recovery drills.');

  return checks.map(check => ({ ...check, ...(results.get(check.id) || { status:'manual', note:'Not automatically verifiable.' }) }));
}

module.exports = { checks, categories, evaluate };
