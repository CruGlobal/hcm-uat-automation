import fs from 'fs';
import path from 'path';
import type { UATTestCase } from './types';

const CACHE_FILE = path.resolve(process.cwd(), '.cache', 'uat-plan.json');

let _cachedPlan: UATTestCase[] | null = null;

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

/** Load UAT Plan cases filtered by module, deduplicated by testId. */
export function loadUATModule(module: string): UATTestCase[] {
  const all = loadUATPlan();
  const seen = new Set<string>();
  return all.filter(tc => {
    if (tc.module !== module) return false;
    // Deduplicate (UAT_DATA tab duplicates module tabs)
    if (tc.tabName === 'UAT_DATA' || tc.tabName === 'Instructions and Index' || tc.tabName === 'Sample Scenarios') return false;
    if (seen.has(tc.testId)) return false;
    seen.add(tc.testId);
    return true;
  });
}

/** Load UAT Plan cases filtered by test script pattern. */
export function loadByTestScript(scriptPattern: string): UATTestCase[] {
  const all = loadUATPlan();
  const seen = new Set<string>();
  return all.filter(tc => {
    if (!tc.testScript.includes(scriptPattern)) return false;
    if (tc.tabName === 'UAT_DATA') return false;
    if (seen.has(tc.testId)) return false;
    seen.add(tc.testId);
    return true;
  });
}

/** Load UAT Plan cases filtered by transaction category. */
export function loadByCategory(module: string, category: string): UATTestCase[] {
  return loadUATModule(module).filter(tc =>
    tc.transactionCategory.toLowerCase().includes(category.toLowerCase())
  );
}

/** Get a unique test title for a UAT Plan test case. */
export function uatTestTitle(tc: UATTestCase): string {
  const desc = tc.businessProcess || tc.testScenario || 'test';
  return `${tc.testId}: ${desc.substring(0, 80)}`;
}

/** Check if a UAT test case is not deferred/cancelled. */
export function isTestable(tc: UATTestCase): boolean {
  const status = tc.status.toLowerCase();
  return status !== 'deferred' && status !== 'cancelled';
}
