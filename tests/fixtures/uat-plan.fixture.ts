import { test as base } from '@playwright/test';
import { loadUATModule, loadByCategory, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import type { UATTestCase } from '../../src/data/types';

/**
 * Check if a UAT test case has required fields populated.
 * For UAT Plan tests, check that businessProcess and testScenario exist.
 */
export function hasUATRequiredFields(tc: UATTestCase): boolean {
  return tc.testId.length > 0 && (tc.businessProcess.length > 0 || tc.testScenario.length > 0);
}

/** Extended test fixture for UAT Plan test cases. */
export type UATFixtures = {
  loadModule: (module: string) => UATTestCase[];
  loadCategory: (module: string, category: string) => UATTestCase[];
};

export const test = base.extend<UATFixtures>({
  loadModule: async ({}, use) => {
    await use((module: string) => loadUATModule(module));
  },
  loadCategory: async ({}, use) => {
    await use((module: string, category: string) => loadByCategory(module, category));
  },
});

export { expect } from '@playwright/test';
export { uatTestTitle, isTestable, hasUATRequiredFields as hasRequired };
export type { UATTestCase };
