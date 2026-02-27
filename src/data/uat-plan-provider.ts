import fs from 'fs';
import path from 'path';
import type { UATTestCase, TestCase } from './types';

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

/** Check if a UAT test case is not deferred/cancelled. */
export function isTestable(tc: UATTestCase): boolean {
  const status = tc.status.toLowerCase();
  return status !== 'deferred' && status !== 'cancelled';
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
