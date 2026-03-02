import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { CoreHRUATFlow } from '../../src/flows/core-hr/core-hr-uat.flow';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import { PreFlightChecker } from '../../src/validation/pre-flight-checker';
import { validateKnownFailure } from '../../src/data/known-failures';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Core HR';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(`${MODULE} (UAT Plan)`, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const preflight = new PreFlightChecker();
      const preCheck = await preflight.prepare(tc);
      test.skip(!preCheck.ready, `[PreFlight] ${preCheck.reason}`);
      if (preCheck.action !== 'ok') console.log(`[PreFlight] ${tc.testId}: ${preCheck.action} — ${preCheck.reason}`);

      const flow = new CoreHRUATFlow(page);
      await flow.execute(tc);

      // Post-execution outcome validation (API + UI checks)
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
      await validateKnownFailure(page, tc);
    });
  }
});
