import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { AbsenceEntryFlow } from '../../src/flows/absence/absence-entry.flow';
import { AbsenceApprovalFlow } from '../../src/flows/absence/absence-approval.flow';
import { AbsenceAdminFlow } from '../../src/flows/absence/absence-admin.flow';
import type { UATTestCase } from '../../src/data/types';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import { PreFlightChecker } from '../../src/validation/pre-flight-checker';
import { validateKnownFailure } from '../../src/data/known-failures';

const MODULE = 'Absence Management';
const cases = sortByUser(loadUATModule(MODULE));

/**
 * Determine which flow to use for an absence test case.
 *
 * Routing logic:
 * 1. HR Specialist tests with admin script IDs (1xx-9xx) → AbsenceAdminFlow
 *    (enrollment management, balance adjustments, accruals, scheduled processes)
 * 2. Manager Self-Service tests → AbsenceApprovalFlow
 *    (approve/reject, withdraw, view team, edit)
 *    EXCEPT: Manager "Absence Entry" and "Add Absence" tests → AbsenceEntryFlow
 *    (manager schedules/adds absence for employee)
 * 3. Employee Self-Service tests → AbsenceEntryFlow
 *    (submit, view, extend/shorten, withdraw)
 * 4. HR Specialist "Absence Entry/Add" tests → AbsenceEntryFlow
 *    (HR specialist adds absence on behalf of employee)
 * 5. HR Specialist "View/Edit Absence" tests → AbsenceEntryFlow
 * 6. HR Specialist "Withdraw" tests → AbsenceApprovalFlow
 * 7. Other HR Specialist tests → AbsenceAdminFlow
 */
function getFlowType(tc: UATTestCase): 'entry' | 'approval' | 'admin' {
  const category = (tc.transactionCategory || '').toLowerCase();
  const bp = (tc.businessProcess || '').toLowerCase();
  const scriptId = (tc.testScript || '').toUpperCase();

  // Extract script number if present
  const scriptMatch = scriptId.match(/ABS\.(\d+)/);
  const scriptNum = scriptMatch ? parseInt(scriptMatch[1], 10) : 0;

  // Manager Self-Service routing
  if (category.includes('manager')) {
    // Manager absence entry/add/submission tests go to entry flow
    if (bp.includes('absence entry') || bp.includes('add absence') ||
        bp.includes('submission') || bp.includes('submits') ||
        scriptId.includes('1501') || scriptId.includes('2801') ||
        scriptId.includes('3001') || scriptId.includes('3002')) {
      return 'entry';
    }
    // Manager approval for absences (including FMLA) goes to approval flow
    if (bp.includes('approval') || bp.includes('approve')) {
      return 'approval';
    }
    // Manager view/edit/withdraw/schedule tests
    if (bp.includes('view') || bp.includes('edit') || bp.includes('withdraw') ||
        bp.includes('schedule') || bp.includes('team')) {
      return 'approval';
    }
    // Manager work schedule assignment goes to admin
    if (bp.includes('work schedule') || scriptId.includes('2401')) {
      return 'admin';
    }
    // Default for manager: approval
    return 'approval';
  }

  // Employee Self-Service routing
  if (category.includes('employee') || category.includes('self-service')) {
    // Employee view absence balance goes to admin flow (it's a navigation test)
    if (scriptId.includes('1101') || bp.includes('view absence balance')) {
      return 'admin';
    }
    // Employee withdraw goes to approval flow
    if (bp.includes('withdraw') || scriptId.includes('1301')) {
      return 'approval';
    }
    return 'entry';
  }

  // HR Specialist routing
  if (category.includes('hr')) {
    // HR Specialist absence entry/add tests
    if (bp.includes('absence entry') || bp.includes('add absence') ||
        scriptId.includes('402')) {
      return 'entry';
    }
    // HR Specialist view/edit absence tests
    if ((bp.includes('view') && bp.includes('absence')) || scriptId.includes('2101') ||
        (bp.includes('edit') && bp.includes('absence')) || scriptId.includes('2201')) {
      return 'entry';
    }
    // HR Specialist withdraw
    if (bp.includes('withdraw') || scriptId.includes('2901')) {
      return 'approval';
    }
    // HR Specialist bereavement/FMLA approval
    if (bp.includes('approval') || bp.includes('approve')) {
      return 'approval';
    }
    // Admin scripts (enrollment, balance, accrual, scheduled processes, work schedule)
    if (scriptNum >= 100 && scriptNum < 1000) {
      return 'admin';
    }
    if (bp.includes('enroll') || bp.includes('balance') || bp.includes('accrual') ||
        bp.includes('disburse') || bp.includes('work schedule') || bp.includes('evaluate') ||
        bp.includes('calculate') || bp.includes('process')) {
      return 'admin';
    }
    // Default for HR Specialist: admin
    return 'admin';
  }

  // Default: entry flow
  return 'entry';
}

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const preflight = new PreFlightChecker();
      const preCheck = await preflight.prepare(tc);
      test.skip(!preCheck.ready, `[PreFlight] ${preCheck.reason}`);
      if (preCheck.action !== 'ok') console.log(`[PreFlight] ${tc.testId}: ${preCheck.action} — ${preCheck.reason}`);

      const flowType = getFlowType(tc);

      if (flowType === 'approval') {
        const flow = new AbsenceApprovalFlow(page);
        await flow.execute(tc);
      } else if (flowType === 'admin') {
        const flow = new AbsenceAdminFlow(page);
        await flow.execute(tc);
      } else {
        const flow = new AbsenceEntryFlow(page);
        await flow.execute(tc);
      }

      // Post-execution outcome validation
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
      await validateKnownFailure(page, tc);
    });
  }
});
