import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { TerminationFlow } from '../../src/flows/core-hr/termination.flow';

const TAB = 'Core - Terms/Ends';
const REQUIRED: string[] = []; // No required fields yet — tab is empty

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new TerminationFlow(page);
      await flow.execute(tc);
    });
  }
});
