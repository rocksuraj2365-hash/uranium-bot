const assert = require('node:assert/strict');
const prefix = require('../lib/prefix');

const license = {
  name: 'license',
  commands: ['grant', 'revoke', 'access', 'profile'].map((name) => ({ name })),
};
license.map = new Map(license.commands.map((command) => [command.name, command]));

prefix.init([license]);

const cases = [
  ['add', 'grant'],
  ['remove', 'revoke'],
  ['check', 'access'],
  ['profile', 'profile'],
];

for (const [shortcut, expected] of cases) {
  const hit = prefix.resolve(prefix.tokenize(`premium ${shortcut} @member`));
  assert.ok(hit, `!premium ${shortcut} should resolve`);
  assert.equal(hit.cat, license);
  assert.equal(hit.def.name, expected);
  assert.equal(hit.used, 2);
}

console.log('Premium prefix shortcut smoke tests passed.');
