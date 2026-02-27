import { type Page } from '@playwright/test';
import { BaseBenefitsFlow } from './base-benefits.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Benefits Enrollment / Elections (Employee Self-Service)
 * Module: Benefits
 * Covers 49 employee self-service test cases.
 *
 * Handles:
 *   - New hire enrollment (via "Enroll Now" on ESS summary)
 *   - Open enrollment (plan selection during enrollment period)
 *   - Life event enrollment (report event then modify elections)
 *   - Plan selection and elections
 *   - Dependent/beneficiary management during enrollment
 *
 * UI: Redwood Benefits ESS — enrollment summary with plan cards,
 *      "Show Benefits" dropdown (#enrt_sum_select_single_ben1),
 *      "Enroll Now" button, and quick-action sidebar links.
 */
export class BenefitsEnrollmentFlow extends BaseBenefitsFlow {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Execute a benefits enrollment test case.
   * Routes to the appropriate enrollment flow based on the test scenario.
   */
  async execute(tc: UATTestCase): Promise<void> {
    const scenario = tc.testScenario.toLowerCase();
    const process = tc.businessProcess.toLowerCase();

    if (scenario.includes('new hire') || process.includes('new hire')) {
      await this.executeNewHireEnrollment(tc);
    } else if (scenario.includes('open enrollment') || process.includes('open enrollment')) {
      await this.executeOpenEnrollment(tc);
    } else if (scenario.includes('life event') || process.includes('life event')) {
      await this.executeLifeEventEnrollment(tc);
    } else if (scenario.includes('dependent') || process.includes('dependent')) {
      await this.executeDependentEnrollment(tc);
    } else if (scenario.includes('beneficiar') || process.includes('beneficiar')) {
      await this.executeBeneficiaryEnrollment(tc);
    } else {
      await this.executeGeneralEnrollment(tc);
    }
  }

  /**
   * New hire benefits enrollment flow.
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits enrollment summary
   * 2. Click "Enroll Now" to open the enrollment wizard
   * 3. Select plans referenced in the test case data
   * 4. Select coverage levels if specified
   * 5. Handle dependent additions if mentioned
   * 6. Handle beneficiary assignments if mentioned
   * 7. Navigate through wizard steps and submit
   * 8. Verify confirmation and capture screenshot
   */
  private async executeNewHireEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    // Verify enrollment summary loaded — "Show Benefits" dropdown is the anchor
    await this.benefits.viewEnrollmentSummary();

    // Open enrollment wizard
    await this.benefits.openEnrollment();

    // Select plans from test data
    await this.selectPlansFromTestCase(tc);

    // Handle dependents if referenced
    await this.handleDependents(tc);

    // Handle beneficiaries if referenced
    await this.handleBeneficiaries(tc);

    // Navigate through wizard and submit
    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`new-hire-${tc.testId}`);
  }

  /**
   * Open enrollment period flow.
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits
   * 2. Set "Show Benefits" filter to see available enrollment events
   * 3. Open enrollment wizard
   * 4. Select/modify plans
   * 5. Process dependents and beneficiaries
   * 6. Submit and verify
   */
  private async executeOpenEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    // Switch "Show Benefits" dropdown to see open enrollment options
    await this.benefits.setShowBenefitsFilter('Pending enrollment');

    await this.benefits.openEnrollment();
    await this.selectPlansFromTestCase(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`open-enrollment-${tc.testId}`);
  }

  /**
   * Life event triggered enrollment flow.
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits
   * 2. Click "Report a Life Event" from the quick actions sidebar
   * 3. Fill the life event type and date
   * 4. Submit the life event
   * 5. Open enrollment wizard (now showing life-event-eligible plans)
   * 6. Select/modify plans and submit
   */
  private async executeLifeEventEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    // Report the life event via the ESS sidebar quick action
    const eventType = this.extractLifeEventType(tc);
    const eventDate = this.extractDate(tc, 'event date')
      || this.extractDate(tc, 'date')
      || '';
    if (eventType) {
      await this.benefits.reportLifeEvent(eventType, eventDate || undefined);
    }

    // After life event is reported, enrollment options update
    await this.benefits.openEnrollment();
    await this.selectPlansFromTestCase(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`life-event-${tc.testId}`);
  }

  /**
   * Dependent-focused enrollment flow.
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits
   * 2. Open the Dependents page from sidebar
   * 3. Add/manage dependents
   * 4. Return to enrollment to verify dependent coverage
   */
  private async executeDependentEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    await this.handleDependents(tc);

    // Verify the enrollment summary reflects dependent changes
    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`dependent-${tc.testId}`);
  }

  /**
   * Beneficiary-focused enrollment flow.
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits
   * 2. Open enrollment to access beneficiary designation
   * 3. Add/manage beneficiaries
   * 4. Submit and verify
   */
  private async executeBeneficiaryEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    await this.benefits.openEnrollment();
    await this.handleBeneficiaries(tc);

    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`beneficiary-${tc.testId}`);
  }

  /**
   * General enrollment flow (fallback for unmatched scenarios).
   *
   * Steps:
   * 1. Login and navigate to ESS Benefits
   * 2. View enrollment summary
   * 3. Open enrollment wizard
   * 4. Select any referenced plans
   * 5. Submit and verify
   */
  private async executeGeneralEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService();

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.openEnrollment();
    await this.selectPlansFromTestCase(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`enrollment-${tc.testId}`);
  }

  /**
   * Select plans referenced in the test case data.
   * Extracts plan type keywords and coverage level from combined test fields,
   * then calls the page object methods.
   */
  private async selectPlansFromTestCase(tc: UATTestCase): Promise<void> {
    const plans = this.extractPlanTypes(tc);
    for (const plan of plans) {
      await this.benefits.selectPlan(plan);
    }

    const coverageLevel = this.extractCoverageLevel(tc);
    if (coverageLevel) {
      await this.benefits.selectCoverage(coverageLevel);
    }
  }

  /**
   * Handle dependent additions if referenced in the test data.
   * Parses "dependent: <name>" and "relationship: <type>" from testData.
   */
  private async handleDependents(tc: UATTestCase): Promise<void> {
    const data = `${tc.testData} ${tc.testScenario}`.toLowerCase();
    if (!data.includes('dependent')) return;

    const depMatch = tc.testData.match(/dependent\s*[:\-]?\s*([^,;\n]+)/i);
    const relMatch = tc.testData.match(/relationship\s*[:\-]?\s*([^,;\n]+)/i);

    if (depMatch) {
      const name = depMatch[1].trim();
      const relationship = relMatch ? relMatch[1].trim() : 'Spouse';
      await this.benefits.addDependent(name, relationship);
    } else {
      // Even without explicit name, navigate to dependents page for verification
      await this.benefits.manageDependents();
    }
  }

  /**
   * Handle beneficiary additions if referenced in the test data.
   * Parses "beneficiary: <name>" and "percentage: <num>" from testData.
   */
  private async handleBeneficiaries(tc: UATTestCase): Promise<void> {
    const data = `${tc.testData} ${tc.testScenario}`.toLowerCase();
    if (!data.includes('beneficiar')) return;

    const benMatch = tc.testData.match(/beneficiary\s*[:\-]?\s*([^,;\n]+)/i);
    const pctMatch = tc.testData.match(/(?:percentage|allocation|%)\s*[:\-]?\s*(\d+)/i);

    if (benMatch) {
      const name = benMatch[1].trim();
      const percentage = pctMatch ? pctMatch[1] : '100';
      await this.benefits.addBeneficiary(name, percentage);
    }
  }
}
