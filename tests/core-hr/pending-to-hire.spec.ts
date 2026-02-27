import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { PendingToHireFlow } from '../../src/flows/core-hr/pending-to-hire.flow';

const TAB = 'Core - One app Pending to Hire';
const REQUIRED = ['Search for Person Number', 'Legal Employer', 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new PendingToHireFlow(page);
      await flow.execute(tc);
    });
  }
});
