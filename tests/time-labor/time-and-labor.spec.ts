import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { TimecardEntryFlow } from '../../src/flows/time-labor/timecard-entry.flow';
import { TimeApprovalFlow } from '../../src/flows/time-labor/time-approval.flow';
import { TimeAdminFlow } from '../../src/flows/time-labor/time-admin.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Time and Labor';
const cases = loadUATModule(MODULE);

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const category = tc.transactionCategory.toLowerCase();
      if (category.includes('manager')) {
        const flow = new TimeApprovalFlow(page);
        await flow.execute(tc);
      } else if (category.includes('employee')) {
        const flow = new TimecardEntryFlow(page);
        await flow.execute(tc);
      } else {
        const flow = new TimeAdminFlow(page);
        await flow.execute(tc);
      }
    });
  }
});
