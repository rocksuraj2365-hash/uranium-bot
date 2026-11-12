const assert = require('node:assert/strict');
const prefix = require('../lib/prefix');
const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');
const { isSafeSelfAssignableRole, blockedSelfAssignablePermissions } = require('../lib/role-safety');
const { PermissionFlagsBits } = require('discord.js');
const license = { name: 'license', commands: ['grant', 'revoke', 'access', 'profile'].map((name) => ({ name })) };
license.map = new Map(license.commands.map((command) => [command.name, command]));
const newCats = ['utility', 'community', 'fun', 'servertools'].map((name) => require('../commands/' + name));
const template = require('../commands/template');
const support = require('../commands/support');
const security = require('../commands/security');
security.map = new Map(security.commands.map((command) => [command.name, command]));
template.map = new Map(template.commands.map((command) => [command.name, command]));
support.map = new Map(support.commands.map((command) => [command.name, command]));
for (const cat of newCats) cat.map = new Map(cat.commands.map((command) => [command.name, command]));
for (const cat of newCats) {
  assert.equal(cat.commands.length, 25, cat.name + ' must contain exactly 25 new commands');
  assert.equal(new Set(cat.commands.map((x) => x.name)).size, 25, cat.name + ' command names must be unique');
}
assert.equal(newCats.reduce((n, cat) => n + cat.commands.length, 0), 100);
prefix.init([...newCats, template, license, security, support]);
for (const cat of newCats) {
  for (const def of cat.commands) {
    const hit = prefix.resolve(prefix.tokenize(cat.name + ' ' + def.name));
    assert.ok(hit, 'Prefix route missing: ' + cat.name + ' ' + def.name);
    assert.equal(hit.cat, cat);
    assert.equal(hit.def, def);
  }
}
for (const [shortcut, expected] of [['add','grant'],['remove','revoke'],['check','access'],['profile','profile']]) {
  const hit = prefix.resolve(prefix.tokenize('premium ' + shortcut + ' @member'));
  assert.ok(hit, '!premium ' + shortcut + ' should resolve');
  assert.equal(hit.cat, license);
  assert.equal(hit.def.name, expected);
  assert.equal(hit.used, 2);
}
const catalog = require('../commands.json');
assert.equal(catalog.total, 354, 'Published catalog total must match the implemented command set');
assert.equal(catalog.categories.length, 19, 'Every command category must be published');
for (const entry of catalog.categories) {
  const source = require('../commands/' + entry.name);
  assert.ok(source.commands.length <= 25, entry.name + ' exceeds Discord subcommand limit');
  assert.equal(entry.commands.length, source.commands.length, entry.name + ' catalog count mismatch');
  const sourceByName = new Map(source.commands.map(command => [command.name, command]));
  for (const item of entry.commands) {
    const command = sourceByName.get(item.name);
    assert.ok(command, 'Catalog command missing from source: ' + entry.name + ' ' + item.name);
    assert.equal(item.description, command.desc, 'Catalog description mismatch: ' + entry.name + ' ' + item.name);
    assert.equal(item.slash, '/' + entry.name + ' ' + item.name);
  }
}
assert.equal(require('../commands/info').commands.length, 25, 'Info group must stay within Discord subcommand limit');
assert.equal(require('../commands/support').commands.length, 2, 'Support report and feedback commands must be registered');
const feedbackHit = prefix.resolve(prefix.tokenize('feedback 5 Uranium is useful'));
assert.ok(feedbackHit, 'Feedback prefix command should resolve');
assert.equal(feedbackHit.def.name, 'feedback');
assert.equal(template.commands.length, 2, 'Support template and refresh commands must be registered');
assert.ok(template.commands.some((x) => x.name === 'refresh'), 'Support template refresh command must be registered');
assert.equal(security.commands.length, 6, 'Premium security suite must register six commands');
for (const def of security.commands) {
  const hit = prefix.resolve(prefix.tokenize('security ' + def.name));
  assert.ok(hit, 'Security prefix route missing: ' + def.name);
  assert.equal(hit.cat, security);
  assert.equal(hit.def, def);
  assert.equal(def.premium, true, 'Security command must require Premium access');
}
const templateHit = prefix.resolve(prefix.tokenize('template support'));
assert.ok(templateHit, 'Support template prefix command must resolve');
assert.equal(templateHit.def.name, 'support');
assert.ok(!catalog.categories.find(x => x.name === 'premium').commands.some(x => x.name === 'broadcast'), 'Global broadcast command must stay disabled');
assert.ok(!catalog.categories.find(x => x.name === 'member').commands.some(x => x.name === 'dm-user'), 'Arbitrary member DM command must stay disabled');
const safeRole = { id: '123', managed: false, permissions: { has: () => false } };
assert.equal(isSafeSelfAssignableRole(safeRole), true, 'A role without elevated permissions may be self-assigned');
const adminRole = { ...safeRole, permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } };
assert.equal(isSafeSelfAssignableRole(adminRole), false, 'Administrator roles must never be self-assignable');
assert.ok(blockedSelfAssignablePermissions(adminRole).includes('Administrator'));
const managedRole = { ...safeRole, managed: true };
assert.equal(isSafeSelfAssignableRole(managedRole), false, 'Managed roles must never be self-assignable');

// Components V2 payload contract (also exercised by the Node checks workflow): V2 flag, component-only body, and valid container tree.
const v2 = cv2.message([cv2.text('# Uranium'), cv2.separator(), cv2.row([cv2.button('test:action', 'Test', 1)])], 0x5b8cff);
assert.equal(v2.flags, 1 << 15, 'CV2 messages must set IS_COMPONENTS_V2');
assert.equal(v2.content, null, 'CV2 messages must not use legacy content');
assert.deepEqual(v2.embeds, [], 'CV2 messages must not include legacy embeds');
assert.equal(v2.components.length, 1);
assert.equal(v2.components[0].type, 17, 'CV2 message should use a container');
assert.equal(v2.components[0].components[0].type, 10, 'CV2 text should use Text Display');
const selectRow = cv2.row([cv2.select('test:select', 'Choose', [{ label: 'One', value: 'one' }])]);
assert.equal(selectRow.type, 1, 'String select menus must be wrapped in an Action Row');
assert.equal(selectRow.components[0].type, 3, 'Action Row should contain the String Select Menu');
assert.equal(cv2.ephemeralMessage([cv2.text('Private')]).flags, (1 << 15) | (1 << 6), 'Private CV2 replies must preserve the ephemeral flag');
const custom = cv2.emoji('<:ux_member:123456789012345678>');
assert.deepEqual(custom, { id: '123456789012345678', name: 'ux_member', animated: false }, 'Custom emoji mentions must become valid component emoji objects');
assert.deepEqual(cv2.emoji('🔒'), { name: '🔒' }, 'Unicode fallback emojis must remain supported');
assert.ok(icons.FALLBACK.member && icons.FALLBACK.premium, 'Every major command category must have a safe icon fallback');

console.log('Components V2 payload checks passed.');
console.log('Command catalog and Discord subcommand-limit checks passed.');
console.log('100 new prefix command and Premium shortcut smoke tests passed.');

// Shared command renderer contract: every ordinary command result must be a CV2 payload.
const renderer = require('../lib/ui2');
async function testSharedRenderer() {
  let sent = null;
  const interaction = { user: { id: '123456789012345678', username: 'tester' }, editReply: async (payload) => { sent = payload; } };
  await renderer.sendResult(interaction, { title: 'Member warned', desc: 'A moderation action completed.', fields: [['Reason', 'Repeated spam']] });
  assert.equal(sent.flags, cv2.FLAG, 'Shared command result must use Components V2');
  assert.deepEqual(sent.embeds, [], 'Shared command result must not use legacy embeds');
  assert.equal(sent.components[0].type, 17, 'Shared command result must use a V2 container');
  assert.ok(sent.components[0].components.some((part) => part.type === 10 && part.content.includes('Member warned')), 'Shared command result must include its title in Text Display');
  assert.ok(sent.components[0].components.some((part) => part.type === 1), 'Shared command result must keep its action buttons in an Action Row');
  sent = null;
  await renderer.sendResult(interaction, { title: 'Image generated', files: [{ name: 'preview.png', data: Buffer.from('test') }] });
  assert.equal(sent.flags, cv2.FLAG, 'Attachment command results must also use Components V2');
  assert.ok(sent.components[0].components.some((part) => part.type === 13), 'Attachment results must use a V2 File component');
}
testSharedRenderer().then(() => console.log('Shared Components V2 command renderer checks passed.')).catch((error) => { console.error(error); process.exitCode = 1; });
// Rebuild the actual 19-category router and verify every published command resolves.
const allCommandCategories = catalog.categories.map((entry) => {
  const category = require('../commands/' + entry.name);
  category.map = new Map(category.commands.map((command) => [command.name, command]));
  return category;
});
prefix.init(allCommandCategories);
let routedCommandCount = 0;
for (const category of allCommandCategories) {
  for (const command of category.commands) {
    const full = prefix.resolve(prefix.tokenize(category.name + ' ' + command.name));
    assert.ok(full, 'Full prefix route missing: ' + category.name + ' ' + command.name);
    assert.equal(full.cat, category);
    assert.equal(full.def, command);
    const compactForm = prefix.shortOf(category.name, command.name);
    const compact = prefix.resolve(prefix.tokenize(compactForm));
    assert.ok(compact, 'Generated short form missing: ' + compactForm);
    assert.equal(compact.def, command, 'Generated short form resolved to the wrong command: ' + compactForm);
    const shortCategory = prefix.CAT_SHORT[category.name];
    if (shortCategory) {
      const short = prefix.resolve(prefix.tokenize(shortCategory + ' ' + command.name));
      assert.ok(short, 'Short category route missing: ' + shortCategory + ' ' + command.name);
      assert.equal(short.def, command);
    }
    routedCommandCount += 1;
  }
}
assert.equal(routedCommandCount, 354, 'Every one of the 354 commands must have a working full prefix route');
console.log('All 354 full-name and available short-category prefix routes passed.');