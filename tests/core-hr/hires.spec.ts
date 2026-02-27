import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { HireEmployeeFlow } from '../../src/flows/core-hr/hire-employee.flow';

const TAB = 'Core - Hires';
const REQUIRED = ['Last Name', 'Legal Employer', 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new HireEmployeeFlow(page);
      await flow.execute(tc);
    });
  }
});
