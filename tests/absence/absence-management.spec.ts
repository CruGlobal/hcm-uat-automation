import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { AbsenceEntryFlow } from '../../src/flows/absence/absence-entry.flow';
import { AbsenceApprovalFlow } from '../../src/flows/absence/absence-approval.flow';
import { AbsenceAdminFlow } from '../../src/flows/absence/absence-admin.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Absence Management';
const cases = loadUATModule(MODULE);

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      // Route to appropriate flow based on transaction category
      const category = tc.transactionCategory.toLowerCase();

      if (category.includes('manager')) {
        const flow = new AbsenceApprovalFlow(page);
        await flow.execute(tc);
      } else if (category.includes('employee') || category.includes('self-service')) {
        const flow = new AbsenceEntryFlow(page);
        await flow.execute(tc);
      } else {
        // HR Specialist, admin, or unspecified — use admin flow
        const flow = new AbsenceAdminFlow(page);
        await flow.execute(tc);
      }
    });
  }
});
