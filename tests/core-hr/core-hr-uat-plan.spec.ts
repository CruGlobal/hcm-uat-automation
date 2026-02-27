import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { CoreHRUATFlow } from '../../src/flows/core-hr/core-hr-uat.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Core HR';
const cases = loadUATModule(MODULE);

test.describe(`${MODULE} (UAT Plan)`, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new CoreHRUATFlow(page);
      await flow.execute(tc);
    });
  }
});
