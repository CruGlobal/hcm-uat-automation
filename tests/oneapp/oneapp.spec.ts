import { test } from '../fixtures/uat-plan.fixture';
import { OneAppFlow } from '../../src/flows/oneapp/oneapp.flow';
import { loadUATModule, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';

const MODULE = 'OneApp';

const cases = loadUATModule(MODULE);

for (const tc of cases) {
  test(`${uatTestTitle(tc)}`, async ({ page }) => {
    test.skip(!isTestable(tc), `${tc.testId} is deferred/cancelled`);
    test.skip(!tc.testId || (!tc.businessProcess && !tc.testScenario), `${tc.testId} missing required fields`);

    const flow = new OneAppFlow(page);
    await flow.execute(tc);
  });
}
