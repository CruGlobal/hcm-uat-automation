import { test as base } from '@playwright/test';
import { loadCachedTestCases, getTestCaseById, getTestCasesByIds, getField } from '../../src/data/test-data-provider';
import type { TestCase } from '../../src/data/types';

/**
 * Check whether a test case has non-empty values for all specified field keys.
 * Uses partial (case-insensitive) matching — same as getField().
 */
export function hasRequiredFields(tc: TestCase, fields: string[]): boolean {
  return fields.every((f) => getField(tc, f) !== '');
}

/**
 * Build a unique test title from a test case.
 * Appends columnIndex when scenario is empty to avoid Playwright duplicate-title errors.
 */
export function testTitle(tc: TestCase): string {
  const label = tc.scenario || `col-${tc.columnIndex}`;
  return `${tc.testId}: ${label}`;
}

/** Extended test fixture that provides test data from cached Google Sheets. */
export type TestDataFixtures = {
  /** Load all test cases for a module tab. */
  loadTab: (tabName: string) => TestCase[];
  /** Get a single test case by ID (e.g., "HR-019"). */
  getById: (cases: TestCase[], testId: string) => TestCase | undefined;
  /** Get multiple test cases by their IDs. */
  getByIds: (cases: TestCase[], testIds: string[]) => TestCase[];
};

export const test = base.extend<TestDataFixtures>({
  loadTab: async ({}, use) => {
    await use((tabName: string) => loadCachedTestCases(tabName));
  },

  getById: async ({}, use) => {
    await use((cases: TestCase[], testId: string) => getTestCaseById(cases, testId));
  },

  getByIds: async ({}, use) => {
    await use((cases: TestCase[], testIds: string[]) => getTestCasesByIds(cases, testIds));
  },
});

export { expect } from '@playwright/test';
