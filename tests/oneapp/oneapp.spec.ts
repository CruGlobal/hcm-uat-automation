import { test, expect, uatTestTitle, isTestable, hasRequired } from '../fixtures/uat-plan.fixture';
import { OneAppFlow } from '../../src/flows/oneapp/oneapp.flow';

const MODULE = 'OneApp';

test.describe('OneApp', () => {
  let cases: ReturnType<typeof test.extend> extends infer T ? any[] : never;

  test.beforeAll(async () => {
    // Dynamic import to get the loadModule fixture value
  });

  test.describe('OneApp Operations', () => {
    test('dynamically generated from UAT Plan', async ({ page, loadModule }) => {
      const allCases = loadModule(MODULE);
      test.skip(allCases.length === 0, 'No OneApp test cases in cache');
    });
  });
});

// Dynamic test generation
import { loadUATModule, uatTestTitle as getTitle, isTestable as checkTestable } from '../../src/data/uat-plan-provider';
import type { UATTestCase } from '../../src/data/types';

const cases = loadUATModule(MODULE);

for (const tc of cases) {
  test(`${getTitle(tc)}`, async ({ page }) => {
    test.skip(!checkTestable(tc), `${tc.testId} is deferred/cancelled`);
    test.skip(!tc.testId || (!tc.businessProcess && !tc.testScenario), `${tc.testId} missing required fields`);

    const flow = new OneAppFlow(page);
    await flow.execute(tc);
  });
}
