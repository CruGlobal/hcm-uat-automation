import * as fs from 'fs';
import { getBotForTester } from '../../src/config/bot-users';

interface RawTest {
  testId: string;
  module: string;
  businessProcess: string;
  testerName: string;
  testScenario: string;
  status?: string;
}

const plan: RawTest[] = JSON.parse(fs.readFileSync('.cache/uat-plan.json', 'utf-8'));

const SKIP_TABS = ['Instructions', 'Cover', 'Summary', 'Template', 'Lookup', 'Config'];
function isTestable(tc: RawTest): boolean {
  if (!tc.testId || !tc.module) return false;
  if (SKIP_TABS.some(t => tc.module.includes(t))) return false;
  if (['Deferred', 'Cancelled', 'N/A'].includes(tc.status || '')) return false;
  if (!tc.businessProcess && !tc.testScenario) return false;
  return true;
}

const testable = plan.filter(isTestable);
const botCounts: Record<string, number> = {};
let defaultCount = 0;
const unmapped: Record<string, number> = {};

for (const tc of testable) {
  const bot = getBotForTester(tc.testerName);
  if (bot) {
    botCounts[bot.botName] = (botCounts[bot.botName] || 0) + 1;
  } else {
    defaultCount++;
    const name = (tc.testerName || '(empty)').trim();
    unmapped[name] = (unmapped[name] || 0) + 1;
  }
}

console.log('=== Distribution across bot accounts ===\n');
const sorted = Object.entries(botCounts).sort((a, b) => b[1] - a[1]);
let total = 0;
for (const [bot, count] of sorted) {
  console.log(`  ${bot.padEnd(32)} ${String(count).padStart(4)} tests`);
  total += count;
}
console.log(`\n  DEFAULT (Joshua Starcher)       ${String(defaultCount).padStart(4)} tests`);
total += defaultCount;
console.log(`\n  TOTAL                           ${total} tests`);
console.log(`  Workers possible:               ${sorted.length + (defaultCount > 0 ? 1 : 0)}`);

if (Object.keys(unmapped).length > 0) {
  console.log(`\n=== Still unmapped (${defaultCount} tests) ===`);
  for (const [name, count] of Object.entries(unmapped).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${name}": ${count}`);
  }
}

const loads = sorted.map(s => s[1]);
if (defaultCount > 0) loads.push(defaultCount);
console.log(`\n=== Load balance ===`);
console.log(`  Min: ${Math.min(...loads)}, Max: ${Math.max(...loads)}, Avg: ${(loads.reduce((a,b)=>a+b,0)/loads.length).toFixed(1)}`);
console.log(`  Ratio (max/min): ${(Math.max(...loads)/Math.min(...loads)).toFixed(1)}x`);
