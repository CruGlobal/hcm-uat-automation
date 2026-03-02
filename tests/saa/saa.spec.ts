import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { SAAFlow } from '../../src/flows/saa/saa.flow';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import { PreFlightChecker } from '../../src/validation/pre-flight-checker';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'SAA';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);

      const preflight = new PreFlightChecker();
      const preCheck = await preflight.prepare(tc);
      test.skip(!preCheck.ready, `[PreFlight] ${preCheck.reason}`);
      if (preCheck.action !== 'ok') console.log(`[PreFlight] ${tc.testId}: ${preCheck.action} — ${preCheck.reason}`);

      const flow = new SAAFlow(page);
      await flow.execute(tc);

      // Post-execution outcome validation
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
    });
  }
});
