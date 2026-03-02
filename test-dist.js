const fs = require('fs');
const plan = JSON.parse(fs.readFileSync('.cache/uat-plan.json', 'utf-8'));

// Deduplicate by testId+module (plan has mirror tab)
const seen = new Set();
const unique = [];
for (const tc of plan) {
  const key = tc.testId + '|' + tc.module;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(tc);
}

const passed = unique.filter(t => t.status === 'Passed');
console.log('Total unique passed:', passed.length);

// Load bot mapping
const botUsers = require('./src/config/bot-users');
const byBot = {};
for (const tc of passed) {
  const bot = botUsers.getBotForTester(tc.testerName);
  const name = bot.botName;
  if (byBot[name] === undefined) byBot[name] = [];
  byBot[name].push({ testId: tc.testId, module: tc.module, scenario: tc.testScenario });
}

const sorted = Object.entries(byBot).sort((a, b) => b[1].length - a[1].length);
for (const [bot, tests] of sorted) {
  console.log(`${bot}: ${tests.length} → ${tests.map(t => t.testId).join(', ')}`);
}
console.log('\nTotal bots with passed tests:', sorted.length);
console.log('Total tests:', sorted.reduce((s, e) => s + e[1].length, 0));

// Output JSON for downstream use
fs.writeFileSync('/tmp/passed-by-bot.json', JSON.stringify(byBot, null, 2));
console.log('\nWritten to /tmp/passed-by-bot.json');
