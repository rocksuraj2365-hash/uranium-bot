const { C } = require('../lib/cmd');
const supportTemplate = require('../lib/support-template');

module.exports = {
  name: 'template',
  description: 'Create interactive server layouts',
  commands: [
    C(
      'support',
      'Build a complete Uranium support server with channels, roles and interactive panels',
      [],
      null,
      supportTemplate.createSupportTemplate,
      {
        custom: true,
        ephemeral: true,
        danger: 'Create six categories, 27 channels and 12 roles. Existing channels and roles will not be deleted. Continue?',
      },
    ),
  ],
};
