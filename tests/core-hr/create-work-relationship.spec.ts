import { test, expect } from '../fixtures/test-data.fixture';
import { hasRequiredFields, testTitle } from '../fixtures/test-data.fixture';
import { loadCachedTestCases } from '../../src/data/test-data-provider';
import { CreateWorkRelationshipFlow } from '../../src/flows/core-hr/create-work-relationship.flow';

const TAB = 'Core - Create Work Relationship';
const REQUIRED = ['Search for Person', 'Legal Employer', 'Assignment Status'];

const cases = loadCachedTestCases(TAB);

test.describe(TAB, () => {
  for (const tc of cases) {
    test(testTitle(tc), async ({ page }) => {
      test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
      const flow = new CreateWorkRelationshipFlow(page);
      await flow.execute(tc);
    });
  }
});
