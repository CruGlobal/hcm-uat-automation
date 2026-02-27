import { test, expect } from '../fixtures/uat-plan.fixture';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { JourneyAssignmentFlow } from '../../src/flows/journeys/journey-assignment.flow';
import type { UATTestCase } from '../../src/data/types';

const MODULE = 'Journeys';
const cases = loadUATModule(MODULE);

test.describe(MODULE, () => {
  for (const tc of cases) {
    test(uatTestTitle(tc), async ({ page }) => {
      test.skip(!isTestable(tc), `${tc.testId} status: ${tc.status}`);
      const flow = new JourneyAssignmentFlow(page);
      await flow.execute(tc);
    });
  }
});
