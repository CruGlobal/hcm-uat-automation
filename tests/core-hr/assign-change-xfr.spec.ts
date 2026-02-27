import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { AssignmentChangeFlow } from '../../src/flows/core-hr/assignment-change.flow';

const TAB = 'Core - Assign Change/XFR';
const REQUIRED = ["What's the way", 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new AssignmentChangeFlow(page);
      await flow.execute(tc);
    });
  }
});
