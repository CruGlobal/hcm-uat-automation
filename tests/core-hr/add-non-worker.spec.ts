import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { AddNonWorkerFlow } from '../../src/flows/core-hr/add-non-worker.flow';

const TAB = 'Core - Add Non Worker';
const REQUIRED = ['Last Name', 'Legal Employer', 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new AddNonWorkerFlow(page);
      await flow.execute(tc);
    });
  }
});
