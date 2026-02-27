import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { AddPendingWorkerFlow } from '../../src/flows/core-hr/add-pending-worker.flow';

const TAB = 'Core - Add Pending Workers';
const REQUIRED = ['Last Name', 'Legal Employer', 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new AddPendingWorkerFlow(page);
      await flow.execute(tc);
    });
  }
});
