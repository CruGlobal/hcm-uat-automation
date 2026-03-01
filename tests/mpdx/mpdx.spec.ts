import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { MPDXFlow } from '../../src/flows/mpdx/mpdx.flow';
import { OutcomeValidator } from '../../src/validation/outcome-validator';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'MPDX';
const cases = sortByUser(loadUATModule(MODULE));

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new MPDXFlow(page);
      await flow.execute(tc);

      // Post-execution outcome validation
      const validator = new OutcomeValidator(page);
      await validator.validate(tc);
    });
  }
});
