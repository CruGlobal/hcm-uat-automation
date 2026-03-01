import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { PayrollProcessingFlow } from '../../src/flows/payroll/payroll-processing.flow';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import { validateKnownFailure } from '../../src/data/known-failures';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Payroll';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(`${MODULE} (UAT Plan)`, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new PayrollProcessingFlow(page);
      await flow.execute(tc);

      // Post-execution outcome validation
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
      await validateKnownFailure(page, tc);
    });
  }
});
