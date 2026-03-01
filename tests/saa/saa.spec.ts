import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { SAAFlow } from '../../src/flows/saa/saa.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'SAA';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new SAAFlow(page);
      await flow.execute(tc);
    });
  }
});
