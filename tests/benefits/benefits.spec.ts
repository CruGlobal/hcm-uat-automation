import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { BenefitsEnrollmentFlow } from '../../src/flows/benefits/benefits-enrollment.flow';
import { BenefitsAdminFlow } from '../../src/flows/benefits/benefits-admin.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Benefits';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const category = tc.transactionCategory.toLowerCase();
      if (category.includes('employee')) {
        const flow = new BenefitsEnrollmentFlow(page);
        await flow.execute(tc);
      } else {
        const flow = new BenefitsAdminFlow(page);
        await flow.execute(tc);
      }
    });
  }
});
