import { type Page } from '@playwright/test';
import { BaseBenefitsFlow } from './base-benefits.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Benefits Administration
 * Module: Benefits
 * Covers 90 admin-side test cases.
 *
 * Handles:
 *   - Admin-initiated enrollment processing
 *   - Termination benefits processing
 *   - Reclass / plan updates
 *   - Life event administration
 *   - Dependent/beneficiary verification
 *   - Reporting and auditing
 *
 * UI: Redwood Benefits Activity Center — person search combobox at top
 *     (placeholder "Search by name, person number, business title, or primary work email"),
 *     filter chips (Worker Type, Assignment Status, Effective As-of Date,
 *     Life Event Status, Filters), and worker detail cards with assignment info.
 */
export class BenefitsAdminFlow extends BaseBenefitsFlow {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Execute a benefits admin test case.
   * Routes to the appropriate admin flow based on the business process and scenario.
   */
  async execute(tc: UATTestCase): Promise<void> {
    const scenario = tc.testScenario.toLowerCase();
    const process = tc.businessProcess.toLowerCase();
    const combined = `${scenario} ${process}`;

    if (combined.includes('terminat') || combined.includes('term')) {
      await this.executeTerminationBenefits(tc);
    } else if (combined.includes('reclass') || combined.includes('reclassif')) {
      await this.executeReclassification(tc);
    } else if (combined.includes('life event')) {
      await this.executeLifeEventAdmin(tc);
    } else if (combined.includes('enrollment') || combined.includes('enroll')) {
      await this.executeAdminEnrollment(tc);
    } else if (combined.includes('dependent')) {
      await this.executeDependentManagement(tc);
    } else if (combined.includes('beneficiar')) {
      await this.executeBeneficiaryManagement(tc);
    } else if (combined.includes('report') || combined.includes('audit')) {
      await this.executeReportingAudit(tc);
    } else {
      await this.executeGeneralAdmin(tc);
    }
  }

  /**
   * Admin-initiated enrollment processing.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search for the person using the combobox search bar
   * 3. Select the worker from the result list
   * 4. Open enrollment for the selected worker
   * 5. Select plans and process enrollment
   * 6. Submit and verify confirmation
   */
  private async executeAdminEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    // Open enrollment from the worker detail view
    await this.benefits.openAdminEnrollment();

    // Select plans referenced in test data
    await this.selectPlansFromTestData(tc);

    // Navigate through wizard steps and submit
    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`admin-enrollment-${tc.testId}`);
  }

  /**
   * Process benefits upon employee termination.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Use the "Assignment Status" filter chip to find terminated workers
   * 3. Search for the specific person
   * 4. Select the worker and review their benefit status
   * 5. Verify benefits are correctly ended/COBRA-eligible
   * 6. Capture the plan summary as evidence
   */
  private async executeTerminationBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();

    // Apply assignment status filter to find terminated workers
    await this.benefits.filterByStatus('Assignment Status');
    await this.benefits.selectFilterValue('Terminated');

    // Search and select the specific person
    await this.searchAndSelectPerson(tc);

    // Verify the benefit status after termination
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`termination-${tc.testId}`);
  }

  /**
   * Process benefits reclassification / plan updates.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Open enrollment to reclassify plan elections
   * 4. Modify plans per test data
   * 5. Submit and verify
   */
  private async executeReclassification(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromTestData(tc);

    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`reclass-${tc.testId}`);
  }

  /**
   * Admin-side life event processing.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Open life events and report the event from admin context
   * 4. Process resulting enrollment changes
   * 5. Submit and verify
   */
  private async executeLifeEventAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();

    // Optionally filter by Life Event Status chip
    await this.benefits.filterByStatus('Life Event Status');
    await this.benefits.selectFilterValue('Processed');

    await this.searchAndSelectPerson(tc);

    // Report the life event
    const eventType = this.extractLifeEventType(tc);
    const eventDate = this.extractDate(tc, 'event date')
      || this.extractDate(tc, 'date')
      || '';
    if (eventType) {
      await this.benefits.reportAdminLifeEvent(eventType, eventDate || undefined);
    }

    // Process resulting enrollment changes
    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromTestData(tc);
    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`admin-life-event-${tc.testId}`);
  }

  /**
   * Admin dependent management.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Navigate to dependent management for the worker
   * 4. Add or verify dependents from test data
   * 5. Capture the state
   */
  private async executeDependentManagement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    // Extract and add dependent info
    const depMatch = tc.testData.match(/dependent\s*[:\-]?\s*([^,;\n]+)/i);
    const relMatch = tc.testData.match(/relationship\s*[:\-]?\s*([^,;\n]+)/i);
    if (depMatch) {
      await this.benefits.addDependent(
        depMatch[1].trim(),
        relMatch ? relMatch[1].trim() : 'Spouse',
      );
    } else {
      // Just navigate to dependents for verification
      await this.benefits.manageDependents();
    }

    await this.benefits.captureBenefitsState(`dependent-mgmt-${tc.testId}`);
  }

  /**
   * Admin beneficiary management.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Navigate to beneficiary management
   * 4. Add or verify beneficiaries from test data
   * 5. Capture the state
   */
  private async executeBeneficiaryManagement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    const benMatch = tc.testData.match(/beneficiary\s*[:\-]?\s*([^,;\n]+)/i);
    const pctMatch = tc.testData.match(/(?:percentage|allocation|%)\s*[:\-]?\s*(\d+)/i);
    if (benMatch) {
      await this.benefits.addBeneficiary(
        benMatch[1].trim(),
        pctMatch ? pctMatch[1] : '100',
      );
    }

    await this.benefits.captureBenefitsState(`beneficiary-mgmt-${tc.testId}`);
  }

  /**
   * Reporting and audit verification.
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Verify plan summary displays correct information
   * 4. Capture state for audit trail
   */
  private async executeReportingAudit(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`report-audit-${tc.testId}`);
  }

  /**
   * General admin flow (fallback for unmatched scenarios).
   *
   * Steps:
   * 1. Login and navigate to Benefits Activity Center
   * 2. Search and select the person
   * 3. Open enrollment to view current state
   * 4. Verify plan summary
   * 5. Capture state
   */
  private async executeGeneralAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin();
    await this.searchAndSelectPerson(tc);

    await this.benefits.openAdminEnrollment();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`admin-general-${tc.testId}`);
  }

  /**
   * Select plans from test case data fields.
   * Extracts plan type keywords and selects each one in the enrollment wizard.
   */
  private async selectPlansFromTestData(tc: UATTestCase): Promise<void> {
    const plans = this.extractPlanTypes(tc);
    for (const plan of plans) {
      await this.benefits.selectPlan(plan);
    }

    const coverageLevel = this.extractCoverageLevel(tc);
    if (coverageLevel) {
      await this.benefits.selectCoverage(coverageLevel);
    }
  }
}
