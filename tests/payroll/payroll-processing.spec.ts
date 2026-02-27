import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { PayrollProcessingFlow } from '../../src/flows/payroll/payroll-processing.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Payroll';
const cases = loadUATModule(MODULE);

test.describe(`${MODULE} (UAT Plan)`, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new PayrollProcessingFlow(page);
      await flow.execute(tc);
    });
  }
});
