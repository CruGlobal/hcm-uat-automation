import { loadUATPlan } from "../../src/data/uat-plan-provider";
import { getBotForTester } from "../../src/config/bot-users";

const plan = loadUATPlan();
const botCounts = new Map<string, number>();
let testable = 0;

for (const t of plan) {
  if (t.status.toLowerCase() === "deferred") continue;
  if (!t.businessProcess && !t.testScript && !t.transactionCategory) continue;
  testable++;

  const bot = getBotForTester(t.testerName, t.module, t.testId);
  botCounts.set(bot.botName, (botCounts.get(bot.botName) || 0) + 1);
}

console.log("Testable: " + testable);
console.log("Bots with tests:");
const sorted = [...botCounts.entries()].sort((a, b) => b[1] - a[1]);
let total = 0;
for (const [bot, count] of sorted) {
  console.log("  " + count + "  " + bot);
  total += count;
}
console.log("Total assigned: " + total);
