const assert = require('node:assert/strict');
const prefix = require('../lib/prefix');
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
console.log('Command catalog and Discord subcommand-limit checks passed.');
console.log('100 new prefix command and Premium shortcut smoke tests passed.');
