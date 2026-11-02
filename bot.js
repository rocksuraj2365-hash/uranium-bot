const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if Uranium is alive'),
].map((c) => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Uranium online as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
    console.log('Slash commands registered');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply(`Pong! ${Math.round(client.ws.ping)}ms`);
  }
});

client.login(DISCORD_BOT_TOKEN);
