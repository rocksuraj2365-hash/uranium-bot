// Rebuild the public command catalog from the same command modules loaded by bot.js.
const fs = require('node:fs');
const path = require('node:path');
const prefix = require('../lib/prefix');

const categoryNames = [
  'member', 'message', 'channel', 'role', 'voice', 'server', 'automod',
  'info', 'music', 'ai', 'premium', 'license', 'utility', 'community',
  'fun', 'servertools', 'support', 'template', 'security', 'application',
  'stats', 'reminders', 'directory', 'engagement', 'devtools', 'antinuke'
];
const categories = categoryNames.map((name) => require('../commands/' + name));
prefix.init(categories);

const output = {
  version: 2,
  generatedFrom: 'commands/*.js at server startup',
  generatedAt: new Date().toISOString(),
  total: 0,
  categories: categories.map((category) => ({
    name: category.name,
    description: category.description || '',
    commands: category.commands.map((command) => ({
      name: command.name,
      description: command.desc || '',
      slash: '/' + category.name + ' ' + command.name,
      prefix: '!' + prefix.shortOf(category.name, command.name),
      access: command.owner ? 'Owner only' : command.premium ? 'Premium' : 'Available subject to command permissions'
    }))
  }))
};
output.total = output.categories.reduce((sum, category) => sum + category.commands.length, 0);
const destination = path.join(__dirname, '..', 'commands.json');
fs.writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
console.log('[command-catalog] Generated ' + output.total + ' commands across ' + output.categories.length + ' categories.');
