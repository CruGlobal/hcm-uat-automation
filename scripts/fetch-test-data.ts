#!/usr/bin/env tsx
/**
 * Debug/preview script — fetches test data from Google Sheets and prints summary.
 * Usage:
 *   npx tsx scripts/fetch-test-data.ts                   # fetch all tabs, show summary
 *   npx tsx scripts/fetch-test-data.ts "Core - Hires"    # fetch a single tab
 *   npx tsx scripts/fetch-test-data.ts --detail HR-019   # show one test case in detail
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchTabAsTestCases, fetchAllTabs } from '../src/data/google-sheets-client';
import { loadCachedTestCases, loadAllCachedTestCases, getTestCaseById } from '../src/data/test-data-provider';
import { MODULE_TABS, tabToFilename } from '../src/data/types';
import type { TestCase } from '../src/data/types';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');

async function main() {
  const args = process.argv.slice(2);

  // Detail mode: show one test case
  if (args[0] === '--detail' && args[1]) {
    const all = loadAllCachedTestCases();
    const tc = getTestCaseById(all, args[1]);
    if (!tc) {
      console.log(`Test case "${args[1]}" not found in cache. Run fetch first.`);
      return;
    }
    console.log(`\n=== ${tc.testId} (${tc.tab}) ===`);
    console.log(`Scenario: ${tc.scenario}`);
    console.log(`Column: ${tc.columnIndex}`);
    console.log(`Fields (${Object.keys(tc.fields).length}):`);
    for (const [key, val] of Object.entries(tc.fields)) {
      console.log(`  ${key}: ${val}`);
    }
    return;
  }

  const targetTab = args[0];

  if (targetTab) {
    // Fetch a single tab
    console.log(`Fetching "${targetTab}" from Google Sheets...`);
    const cases = await fetchTabAsTestCases(targetTab);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const filePath = path.join(CACHE_DIR, `${tabToFilename(targetTab)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cases, null, 2));
    console.log(`Saved ${cases.length} cases to ${filePath}`);
    printSummary(targetTab, cases);
  } else {
    // Fetch all tabs
    console.log(`Fetching all ${MODULE_TABS.length} tabs from Google Sheets...\n`);
    const allData = await fetchAllTabs(MODULE_TABS);
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    let totalCases = 0;
    for (const [tab, cases] of allData) {
      const filePath = path.join(CACHE_DIR, `${tabToFilename(tab)}.json`);
      fs.writeFileSync(filePath, JSON.stringify(cases, null, 2));
      totalCases += cases.length;
      printSummary(tab, cases);
    }
    console.log(`\n=== Total: ${totalCases} test cases across ${MODULE_TABS.length} tabs ===`);
  }
}

function printSummary(tab: string, cases: TestCase[]) {
  console.log(`\n--- ${tab}: ${cases.length} test cases ---`);
  if (cases.length > 0) {
    const ids = cases.map((tc) => tc.testId);
    console.log(`  IDs: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ` ... (+${ids.length - 8} more)` : ''}`);
    // Show first case's scenario
    console.log(`  First: ${cases[0].testId} — ${cases[0].scenario || '(no scenario)'}`);
    console.log(`  Fields per case: ~${Math.round(cases.reduce((s, c) => s + Object.keys(c.fields).length, 0) / cases.length)}`);
  }
}

main().catch(console.error);
