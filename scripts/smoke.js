const assert = require('node:assert/strict');
const prefix = require('../lib/prefix');
const license = { name: 'license', commands: ['grant', 'revoke', 'access', 'profile'].map((name) => ({ name })) };
license.map = new Map(license.commands.map((command) => [command.name, command]));
const newCats = ['utility', 'community', 'fun', 'servertools'].map((name) => require('../commands/' + name));
for (const cat of newCats) {
  assert.equal(cat.commands.length, 25, cat.name + ' must contain exactly 25 new commands');
  assert.equal(new Set(cat.commands.map((x) => x.name)).size, 25, cat.name + ' command names must be unique');
}
assert.equal(newCats.reduce((n, cat) => n + cat.commands.length, 0), 100);
prefix.init([...newCats, license]);
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
console.log('100 new prefix command and Premium shortcut smoke tests passed.');
