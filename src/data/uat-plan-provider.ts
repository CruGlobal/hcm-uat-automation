import fs from 'fs';
import path from 'path';
import type { UATTestCase, TestCase } from './types';
import { getBotForTester } from '../config/bot-users';
import { pickEmployeeFromPool, PAYROLL_ELEMENT_OVERRIDES, PAYROLL_REASON_OVERRIDES } from './payroll-employee-pools';

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
 *
 * When RUN_COUNTER env var is set (by run-parallel.ts), hire/create tests
 * get run-unique names and SSNs so they can be re-run without conflicts.
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
  const tc = _fieldDataCache.get(testId);
  if (!tc) return undefined;

  const runCounter = parseInt(process.env.RUN_COUNTER || '0', 10);
  if (runCounter > 0 && isCreatePersonTest(tc)) {
    return applyRunUniqueMutations(tc, runCounter);
  }

  // Rotating employee pool + element/reason overrides for off-cycle payroll tests.
  const poolEmployee = pickEmployeeFromPool(testId, runCounter);
  const elementOverride = PAYROLL_ELEMENT_OVERRIDES[testId];
  const reasonOverride = PAYROLL_REASON_OVERRIDES[testId];
  if (poolEmployee || elementOverride || reasonOverride) {
    const fields = { ...tc.fields };
    if (poolEmployee) fields['Search For'] = poolEmployee;
    if (elementOverride) fields['Element name'] = elementOverride;
    if (reasonOverride) fields['Reason'] = reasonOverride;
    return { ...tc, fields };
  }

  return tc;
}

/** Tabs that create new people in Oracle HCM (hire, add pending, add non-worker). */
const CREATE_PERSON_TABS = ['core - hires', 'core - add pending', 'core - add non-worker'];

function isCreatePersonTest(tc: TestCase): boolean {
  return CREATE_PERSON_TABS.includes(tc.tab.toLowerCase());
}

/**
 * Return a shallow copy of the TestCase with run-unique name and SSN fields.
 * - Last name gets " R{counter}" suffix (e.g., "HR-023 R2")
 * - SSN gets offset by counter * 5000 to avoid collisions across runs
 */
function applyRunUniqueMutations(tc: TestCase, counter: number): TestCase {
  const fields = { ...tc.fields };

  // Mutate last name: find the key that contains "Last Name"
  for (const key of Object.keys(fields)) {
    if (key.toLowerCase().includes('last name')) {
      fields[key] = `${fields[key]} R${counter}`;
      break;
    }
  }

  // Mutate SSN: offset to avoid duplicate SSN conflicts
  for (const key of Object.keys(fields)) {
    if (key.toLowerCase().includes('national id') && !key.toLowerCase().includes('type')) {
      const original = fields[key];
      // SSN format: 9 digits (AAAggSSSS). Offset the serial portion.
      if (/^\d{9}$/.test(original)) {
        const area = parseInt(original.slice(0, 3), 10);
        const rest = parseInt(original.slice(3), 10);
        const newRest = (rest + counter * 5000) % 1000000;
        fields[key] = `${area}${String(newRest).padStart(6, '0')}`;
      }
      break;
    }
  }

  return { ...tc, fields };
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
