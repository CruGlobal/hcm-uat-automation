import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { TimecardEntryFlow } from '../../src/flows/time-labor/timecard-entry.flow';
import { TimeApprovalFlow } from '../../src/flows/time-labor/time-approval.flow';
import { TimeAdminFlow } from '../../src/flows/time-labor/time-admin.flow';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import { PreFlightChecker } from '../../src/validation/pre-flight-checker';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Time and Labor';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const preflight = new PreFlightChecker();
      const preCheck = await preflight.prepare(tc);
      test.skip(!preCheck.ready, `[PreFlight] ${preCheck.reason}`);
      if (preCheck.action !== 'ok') console.log(`[PreFlight] ${tc.testId}: ${preCheck.action} — ${preCheck.reason}`);

      // Route to appropriate flow based on transaction category.
      // Handle both "HR specialist" and "HR Specialist" (inconsistent casing in UAT Plan).
      const category = (tc.transactionCategory || '').toLowerCase();

      if (category.includes('manager')) {
        const flow = new TimeApprovalFlow(page);
        await flow.execute(tc);
      } else if (category.includes('hr spec') || category.includes('admin')) {
        const flow = new TimeAdminFlow(page);
        await flow.execute(tc);
      } else if (category.includes('system')) {
        // System tests (notifications, web clock, calculation) go to admin flow
        const flow = new TimeAdminFlow(page);
        await flow.execute(tc);
      } else if (!category || category.includes('employee') || category.includes('ess')) {
        // Employee Self-Service
        const flow = new TimecardEntryFlow(page);
        await flow.execute(tc);
      } else {
        throw new Error(`Unmapped T&L category: "${category}" (testId: ${tc.testId})`);
      }

      // Post-execution outcome validation
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
    });
  }
});
