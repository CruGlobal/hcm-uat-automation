import { test } from '../fixtures/uat-plan.fixture';
import { OneAppFlow } from '../../src/flows/oneapp/oneapp.flow';
import { loadUATModule, sortByUser, uatTestTitle, isTestable } from '../../src/data/uat-plan-provider';
import { OutcomeValidator } from '../../src/validation/outcome-validator';

const MODULE = 'OneApp';

const cases = sortByUser(loadUATModule(MODULE));

for (const tc of cases) {
  test(`${uatTestTitle(tc)}`, async ({ page }) => {
    test.skip(!isTestable(tc), `${tc.testId} is deferred/cancelled`);
    test.skip(!tc.testId || (!tc.businessProcess && !tc.testScenario), `${tc.testId} missing required fields`);

    const flow = new OneAppFlow(page);
    await flow.execute(tc);

    // Post-execution outcome validation
    const validator = new OutcomeValidator(page);
    await validator.validate(tc);
  });
}
