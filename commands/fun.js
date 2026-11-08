const { T, TXT, pick, hash, bar, S, I, U } = require('../lib/simple');
const { UserError } = require('../lib/util');

const BALL = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.', 'Most likely.', 'Looks good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.', 'Do not count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];
const JOKES = ['Why do programmers prefer dark mode? Because light attracts bugs.', 'I would tell you a UDP joke, but you might not get it.', 'There are 10 kinds of people: those who know binary and those who do not.', 'A SQL query walks into a bar, walks up to two tables and asks: can I join you?', 'Why did the developer go broke? He used up all his cache.', 'To understand recursion, you must first understand recursion.', 'Why was the function sad? It did not get a callback.', 'My code never has bugs. It just develops random features.', 'How many programmers does it take to change a light bulb? None, that is a hardware problem.', 'Debugging: being the detective in a crime movie where you are also the murderer.'];
const FACTS = ['Honey never spoils: edible honey was found in ancient Egyptian tombs.', 'Octopuses have three hearts.', 'A day on Venus is longer than its year.', 'Bananas are berries, but strawberries are not.', 'Sharks existed before trees.', 'The Eiffel Tower grows a few centimetres taller in summer heat.', 'A group of flamingos is called a flamboyance.', 'Wombat droppings are cube-shaped.', 'Lightning is about five times hotter than the surface of the Sun.', 'There are more possible chess games than atoms in the observable universe.'];
const QUOTES = ['“The only way to do great work is to love what you do.” — Steve Jobs', '“Well done is better than well said.” — Benjamin Franklin', '“It always seems impossible until it is done.” — Nelson Mandela', '“Whether you think you can or you think you can’t, you’re right.” — Henry Ford', '“Do what you can, with what you have, where you are.” — Theodore Roosevelt', '“Simplicity is the ultimate sophistication.” — Leonardo da Vinci', '“Stay hungry, stay foolish.” — Stewart Brand'];
const RIDDLES = [['What has keys but cannot open locks?', 'A keyboard'], ['What gets wetter the more it dries?', 'A towel'], ['What has hands but cannot clap?', 'A clock'], ['What can you catch but not throw?', 'A cold'], ['What has a head and a tail but no body?', 'A coin'], ['The more you take, the more you leave behind. What am I?', 'Footsteps']];
const TRUTH = ['What is your most embarrassing moment?', 'What is a secret talent you have?', 'What is the last thing you searched online?', 'Who was your first crush?', 'What is a habit you wish you could drop?', 'What is the silliest fear you have?', 'What is the best gift you ever received?'];
const DARE = ['Send a message using only emojis for the next 5 minutes.', 'Change your nickname to something silly for an hour.', 'Sing a line of your favourite song in a voice chat.', 'Describe your day like a movie trailer.', 'Type with your eyes closed and send the result.', 'Speak in rhymes for the next 3 messages.'];
const WYR = ['Would you rather always be 10 minutes late or 20 minutes early?', 'Would you rather lose your phone or your wallet?', 'Would you rather fly or be invisible?', 'Would you rather have unlimited pizza or unlimited ice cream?', 'Would you rather never use social media again or never watch videos again?', 'Would you rather be able to talk to animals or speak every human language?'];
const FORTUNE = ['A pleasant surprise is waiting for you.', 'Good things come to those who code patiently.', 'Today is a good day to start something new.', 'A friend will help you soon.', 'Your hard work will be noticed.', 'Adventure is near.'];
const NICE = ['You make the server a better place.', 'Your ideas are really creative.', 'You are a great teammate.', 'You have an awesome sense of humour.', 'You are stronger than you think.', 'People are lucky to know you.'];
const TRIVIA = [['What is the largest planet in our solar system?', 'Jupiter'], ['How many continents are there?', '7'], ['What gas do plants absorb from the air?', 'Carbon dioxide'], ['Which ocean is the largest?', 'The Pacific Ocean'], ['What is the capital of Japan?', 'Tokyo'], ['How many sides does a hexagon have?', '6'], ['What is H2O commonly called?', 'Water'], ['Who painted the Mona Lisa?', 'Leonardo da Vinci']];
const act = (verb, icon, plural) => (c) => { const u = c.u('user'); return `**${c.i.user.username}** ${plural} **${u.username}** ${icon}`; };
const USER = (d = 'Who?') => U(true, 'user', d);

module.exports = {
  name: 'fun', description: 'Fun: games, jokes and chat actions',
  commands: [
    T('8ball', 'Ask the magic 8-ball a question', [TXT('Your question')], (c) => `🎱 **${c.s('text')}**\n${pick(BALL)}`, '🎱'),
    T('coinflip', 'Flip a coin', [], () => `The coin lands on **${Math.random() < 0.5 ? 'Heads' : 'Tails'}**.`, '🪙'),
    T('dice', 'Roll dice like 2d6 or 1d20', [S('roll', 'Dice, for example 2d6', false, { max: 12 })], (c) => {
      const m = /^(\d{1,2})d(\d{1,3})$/i.exec((c.s('roll') || '1d6').trim()); if (!m || +m[1] < 1 || +m[2] < 2) throw new UserError('Use dice like 2d6 or 1d20', 'Up to 20 dice with up to 999 sides.');
      if (+m[1] > 20) throw new UserError('You can roll at most 20 dice at once');
      const r = Array.from({ length: +m[1] }, () => 1 + Math.floor(Math.random() * +m[2])); return `Rolled **${m[1]}d${m[2]}**: ${r.join(', ')}\nTotal: **${r.reduce((a, b) => a + b, 0)}**`;
    }, '🎲'),
    T('choose', 'Pick one option, separated by | or commas', [S('options', 'Options like pizza | burger | pasta', true, { max: 600 })], (c) => {
      const o = c.s('options').split(/[|,]/).map((x) => x.trim()).filter(Boolean); if (o.length < 2) throw new UserError('Give at least 2 options', 'Example: pizza | burger | pasta'); return `I choose **${pick(o)}**.`;
    }, '🤔'),
    T('rps', 'Play rock, paper, scissors', [S('move', 'rock, paper or scissors', true, { choices: ['rock', 'paper', 'scissors'] })], (c) => {
      const m = c.s('move'); const b = pick(['rock', 'paper', 'scissors']); const win = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      return `You: **${m}** · Me: **${b}**\n${m === b ? "It's a tie!" : win[m] === b ? 'You win! 🎉' : 'I win! 😎'}`;
    }, '✂️'),
    T('ship', 'Check the match percentage of two people', [USER('First person'), U(true, 'partner', 'Second person')], (c) => {
      const a = c.u('user'), b = c.u('partner'); const p = hash([a.id, b.id].sort().join('-')) % 101; return `**${a.username}** 💞 **${b.username}**\n\`${bar(p / 100)}\` **${p}%**`;
    }, '💞'),
    T('rate', 'Rate anything out of 10', [TXT('What to rate')], (c) => { const n = hash(c.s('text').toLowerCase()) % 11; return `I rate **${c.s('text')}** a **${n}/10** \`${bar(n / 10)}\``; }, '⭐'),
    T('hug', 'Give someone a hug', [USER()], act('hugs', '🤗', 'hugs'), '🤗'),
    T('slap', 'Playfully slap someone with a fish', [USER()], (c) => `**${c.i.user.username}** slaps **${c.u('user').username}** with a ${pick(['wet fish', 'pillow', 'rubber duck', 'foam sword'])} 🐟`, '👋'),
    T('pat', 'Pat someone on the head', [USER()], act('pats', '🫳', 'pats'), '🫳'),
    T('highfive', 'Give someone a high five', [USER()], act('high-fives', '🙌', 'high-fives'), '🙌'),
    T('bonk', 'Playfully bonk someone', [USER()], (c) => `**${c.i.user.username}** bonks **${c.u('user').username}** 🔨 *bonk!*`, '🔨'),
    T('joke', 'Get a programming joke', [], () => pick(JOKES), '😂'),
    T('fact', 'Get a random fun fact', [], () => pick(FACTS), '🧠'),
    T('quote', 'Get an inspiring quote', [], () => pick(QUOTES), '💬'),
    T('riddle', 'Get a riddle (answer hidden)', [], () => { const [q, a] = pick(RIDDLES); return `${q}\n\nAnswer: ||${a}||`; }, '🧩'),
    T('truth', 'Get a truth question', [], () => pick(TRUTH), '🫢'),
    T('dare', 'Get a dare', [], () => pick(DARE), '😈'),
    T('wyr', 'Get a would-you-rather question', [], () => pick(WYR), '🤷'),
    T('fortune', 'Read your fortune', [], () => `🔮 ${pick(FORTUNE)}`, '🔮'),
    T('compliment', 'Send a nice compliment', [U(false, 'user', 'Who? (default: you)')], (c) => `${(c.u('user') || c.i.user).username}, ${pick(NICE)}`, '💖'),
    T('trivia', 'Answer a trivia question (answer hidden)', [], () => { const [q, a] = pick(TRIVIA); return `${q}\n\nAnswer: ||${a}||`; }, '🧠'),
    T('slots', 'Spin the slot machine', [], () => { const s = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣']; const r = [pick(s), pick(s), pick(s)]; return `**[ ${r.join(' | ')} ]**\n${r[0] === r[1] && r[1] === r[2] ? '🎉 JACKPOT!' : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? 'Two of a kind!' : 'No luck this time.'}`; }, '🎰'),
    T('wheel', 'Spin a wheel with your options', [S('options', 'Options separated by | or commas', true, { max: 600 })], (c) => { const o = c.s('options').split(/[|,]/).map((x) => x.trim()).filter(Boolean); if (o.length < 2) throw new UserError('Give at least 2 options'); return `🎡 The wheel stops on... **${pick(o)}**!`; }, '🎡'),
    T('lottery', 'Draw lucky numbers', [I('count', 'How many numbers (1-10)', false, 1, 10)], (c) => { const n = c.n('count') || 6; const set = new Set(); while (set.size < n) set.add(1 + Math.floor(Math.random() * 49)); return `Your numbers: **${[...set].sort((a, b) => a - b).join(' · ')}**`; }, '🍀'),
  ],
};
