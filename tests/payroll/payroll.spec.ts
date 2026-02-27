import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { ElementEntryFlow } from '../../src/flows/payroll/element-entry.flow';

const TAB = 'Payroll';
const REQUIRED = ['Element name', 'Effective date'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new ElementEntryFlow(page);
      await flow.execute(tc);
    });
  }
});
