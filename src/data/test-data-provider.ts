import fs from 'fs';
import path from 'path';
import { type TestCase, tabToFilename } from './types';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const GENERATED_DIR = path.resolve(process.cwd(), '.cache-generated');

/**
 * Load cached test cases for a tab.
 * Reads from .cache/<tab-name>.json (written by global-setup).
 * Also loads generated test data from .cache-generated/ and merges both sources.
 */
export function loadCachedTestCases(tabName: string): TestCase[] {
  const filename = `${tabToFilename(tabName)}.json`;
  const cases: TestCase[] = [];

  // Load from Google Sheets cache
  const sheetPath = path.join(CACHE_DIR, filename);
  if (fs.existsSync(sheetPath)) {
    cases.push(...JSON.parse(fs.readFileSync(sheetPath, 'utf-8')));
  }

  // Load from generated cache (migration DB)
  const genPath = path.join(GENERATED_DIR, filename);
  if (fs.existsSync(genPath)) {
    cases.push(...JSON.parse(fs.readFileSync(genPath, 'utf-8')));
  }

  if (cases.length === 0) {
    console.warn(`No test data for "${tabName}". Run global-setup or generate-test-data first.`);
  }

  return cases;
}

/** Get a single test case by ID (e.g. "HR-001", "PY-001-01"). */
export function getTestCaseById(cases: TestCase[], testId: string): TestCase | undefined {
  return cases.find((tc) => tc.testId === testId);
}

/** Get test cases matching any of the given IDs. */
export function getTestCasesByIds(cases: TestCase[], testIds: string[]): TestCase[] {
  const idSet = new Set(testIds);
  return cases.filter((tc) => idSet.has(tc.testId));
}

/** Get all test cases from a tab that match a prefix (e.g. "HR-" for all Core HR). */
export function filterByPrefix(cases: TestCase[], prefix: string): TestCase[] {
  return cases.filter((tc) => tc.testId.startsWith(prefix));
}

/** Load all cached test cases across all tabs. */
export function loadAllCachedTestCases(): TestCase[] {
  if (!fs.existsSync(CACHE_DIR)) return [];
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  return files.flatMap((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8'));
    } catch {
      return [];
    }
  });
}

/** Get a field value from a test case by partial key match (case-insensitive). */
export function getField(tc: TestCase, partialKey: string): string {
  const lower = partialKey.toLowerCase();
  for (const [key, val] of Object.entries(tc.fields)) {
    if (key.toLowerCase().includes(lower)) return val;
  }
  return '';
}
