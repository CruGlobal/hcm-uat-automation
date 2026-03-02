import fs from 'fs';
import path from 'path';
import type { UATTestCase, TestCase } from './types';
import { getBotForTester } from '../config/bot-users';

const CACHE_FILE = path.resolve(process.cwd(), '.cache', 'uat-plan.json');
const FIELD_DATA_FILE = path.resolve(process.cwd(), '.cache-generated', 'field-data.json');

let _cachedPlan: UATTestCase[] | null = null;
let _fieldDataCache: Map<string, TestCase> | null = null;

/** Load all UAT Plan test cases from cache. */
export function loadUATPlan(): UATTestCase[] {
  if (_cachedPlan) return _cachedPlan;
  if (!fs.existsSync(CACHE_FILE)) {
    console.warn('UAT Plan not cached. Run: npx tsx scripts/fetch-uat-plan.ts');
    return [];
  }
  _cachedPlan = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  return _cachedPlan!;
}

/** Tab names to skip (summary/meta tabs, not real test sources). */
const SKIP_TABS = new Set(['UAT_DATA', 'Instructions and Index', 'Sample Scenarios']);

/** Tab-name-to-module mapping for rows with empty module field. */
const TAB_TO_MODULE: Record<string, string> = {
  'Core HR': 'Core HR',
  'Payroll': 'Payroll',
  'Absence Management': 'Absence Management',
  'Benefits': 'Benefits',
  'Time and Labor': 'Time and Labor',
  'Journeys': 'Journeys',
  'Workforce Compensation': 'Workforce Compensation',
  'MPDX': 'MPDX',
  'OneApp': 'OneApp',
  'SAA': 'SAA',
  'Other Functions': 'Other Functions',
};

/**
 * Load UAT Plan cases filtered by module.
 * Keeps all rows from module tabs (including duplicate testIds with
 * different business processes — these are distinct test scenarios).
 * Only skips summary/meta tabs.
 */
export function loadUATModule(module: string): UATTestCase[] {
  const all = loadUATPlan();
  return all.filter(tc => {
    if (SKIP_TABS.has(tc.tabName)) return false;
    // Infer module from tab name when module field is empty
    const effectiveModule = tc.module || TAB_TO_MODULE[tc.tabName] || '';
    return effectiveModule === module;
  });
}

/** Load UAT Plan cases filtered by test script pattern. */
export function loadByTestScript(scriptPattern: string): UATTestCase[] {
  const all = loadUATPlan();
  return all.filter(tc => {
    if (SKIP_TABS.has(tc.tabName)) return false;
    return tc.testScript.includes(scriptPattern);
  });
}

/** Load UAT Plan cases filtered by transaction category. */
export function loadByCategory(module: string, category: string): UATTestCase[] {
  return loadUATModule(module).filter(tc =>
    tc.transactionCategory.toLowerCase().includes(category.toLowerCase())
  );
}

/**
 * Get a unique test title for a UAT Plan test case.
 * Includes businessProcess and testScenario to disambiguate duplicate
 * testIds that represent different test scenarios (e.g. PY-009-03
 * appears 3x with different off-cycle payroll types, and AB-012.00
 * appears 3x with the same businessProcess but different scenarios).
 */
export function uatTestTitle(tc: UATTestCase): string {
  const bp = tc.businessProcess || '';
  const sc = tc.testScenario || '';
  // Use businessProcess + scenario snippet for uniqueness
  if (bp && sc) {
    return `${tc.testId}: ${bp.substring(0, 50)} — ${sc.substring(0, 40)}`;
  }
  const desc = bp || sc || 'test';
  return `${tc.testId}: ${desc.substring(0, 80)}`;
}

/**
 * Check if a UAT test case should run.
 *
 * Filters applied (in order):
 * 1. Skip deferred tests
 * 2. Skip empty rows (no business process, test script, or transaction category)
 * 3. RUN_PASSED_ONLY — only tests with "passed"/"pass" status
 * 4. RUN_FAILED_ONLY — only tests with "failed"/"fail" status
 * 5. PARALLEL_BOT — only tests assigned to the specified bot user (for parallel execution)
 */
export function isTestable(tc: UATTestCase): boolean {
  const status = tc.status.toLowerCase();
  if (status === 'deferred') return false;
  // Skip empty rows: no business process, no test script, and no transaction category
  if (!tc.businessProcess && !tc.testScript && !tc.transactionCategory) return false;
  if (process.env.RUN_STATUS_FILTER) {
    const allowed = process.env.RUN_STATUS_FILTER.split(',').map(s => s.trim().toLowerCase());
    if (!allowed.includes(status)) return false;
  }
  if (process.env.RUN_PASSED_ONLY) {
    if (status !== 'passed' && status !== 'pass') return false;
  }
  if (process.env.RUN_FAILED_ONLY) {
    if (status !== 'failed' && status !== 'fail') return false;
  }
  // Parallel mode: only run tests assigned to the specified bot
  if (process.env.PARALLEL_BOT) {
    const bot = getBotForTester(tc.testerName, tc.module, tc.testId);
    if (bot.botName !== process.env.PARALLEL_BOT) return false;
  }
  return true;
}

/**
 * Get field-level test data for a UAT Plan test ID.
 * Returns a TestCase with form field values from the migration DB,
 * or undefined if no field data exists for this testId.
 */
export function getFieldData(testId: string): TestCase | undefined {
  if (!_fieldDataCache) {
    if (fs.existsSync(FIELD_DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIELD_DATA_FILE, 'utf-8'));
      _fieldDataCache = new Map(Object.entries(raw));
    } else {
      _fieldDataCache = new Map();
    }
  }
  return _fieldDataCache.get(testId);
}

/**
 * Sort test cases to minimize login switches.
 * Default-user tests first, then grouped by bot user (largest groups first).
 * Preserves original order within each group.
 */
export function sortByUser(cases: UATTestCase[]): UATTestCase[] {
  const defaultGroup: UATTestCase[] = [];
  const botGroups = new Map<string, UATTestCase[]>();

  for (const tc of cases) {
    const bot = getBotForTester(tc.testerName, tc.module, tc.testId);
    if (!bot) {
      defaultGroup.push(tc);
    } else {
      const group = botGroups.get(bot.botName) || [];
      group.push(tc);
      botGroups.set(bot.botName, group);
    }
  }

  // Sort bot groups by size (largest first) to minimize switches
  const sortedBotGroups = [...botGroups.values()].sort((a, b) => b.length - a.length);

  return [...defaultGroup, ...sortedBotGroups.flat()];
}
