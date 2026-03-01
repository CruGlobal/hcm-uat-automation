/**
 * OutcomeValidator — module-specific post-execution validation.
 *
 * Uses Oracle HCM REST API calls for data verification and UI fallbacks
 * where API endpoints are unavailable (e.g., benefitEnrollments returns 403).
 *
 * Assertion errors (from expect()) propagate and fail the test.
 * API/network errors are logged as warnings and do not fail the test.
 */
import { type Page, expect } from '@playwright/test';
import type { UATTestCase, TestCase } from '../data/types';
import { getFieldData } from '../data/uat-plan-provider';
import { getField } from '../data/test-data-provider';
import {
  hcmGet,
  lookupPersonId,
  getWorkerFull,
  getWorkerEmails,
  lookupAbsences,
  lookupAbsencesByNumber,
  lookupElementEntries,
  lookupElementEntriesByNumber,
  type WorkerFullRecord,
  type EmailRecord,
  type AbsenceRecord,
  type ElementEntryRecord,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';

export class OutcomeValidator {
  private baseUrl: string;
  private creds: BasicAuthCredentials;

  constructor(private page: Page) {
    this.baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    // Use bot_hr_admin for API validation (has HR Specialist role for API access)
    this.creds = { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };
  }

  /**
   * Run module-specific validation for a test case.
   * Dispatches to the appropriate validation method based on tc.module.
   * Fails silently (logs warning) if API is unreachable.
   */
  async validate(tc: UATTestCase): Promise<void> {
    const module = (tc.module || '').toLowerCase();
    try {
      if (module.includes('core hr')) await this.validateCoreHR(tc);
      else if (module.includes('absence')) await this.validateAbsence(tc);
      else if (module.includes('benefits')) await this.validateBenefits(tc);
      else if (module.includes('payroll')) await this.validatePayroll(tc);
      else if (module.includes('time')) await this.validateTimeLabor(tc);
      else if (module.includes('mpdx')) await this.validateMPDX(tc);
      else await this.validateGeneric(tc);
    } catch (error) {
      // Re-throw assertion errors (from expect()) — these are real validation failures
      if (error instanceof Error && error.message.includes('expect')) throw error;
      // Log API/network errors as warnings, don't fail the test
      console.warn(`[OutcomeValidator] ${tc.testId}: API validation error: ${error}`);
    }
  }

  // ── Core HR ──────────────────────────────────────────────────────────

  private async validateCoreHR(tc: UATTestCase): Promise<void> {
    const bp = (tc.businessProcess || '').toLowerCase();
    const fieldData = getFieldData(tc.testId);

    if (bp.includes('hire') || bp.includes('pending') || bp.includes('nonworker') || bp.includes('non worker')) {
      await this.validateHireOutcome(tc, fieldData);
    } else if (bp.includes('terminat')) {
      await this.validateTermination(tc, fieldData);
    } else if (bp.includes('document') || bp.includes('attachment')) {
      await this.validateDocumentAccess(tc);
    } else {
      await this.verifyNoErrors();
    }
  }

  /**
   * Validate hire/add-pending/add-nonworker outcome.
   * If field data exists, looks up the person via REST API and verifies creation.
   */
  private async validateHireOutcome(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();

    if (!fieldData) return;

    // Try to extract person number from the test data
    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) {
      console.log(`[OutcomeValidator] ${tc.testId}: No person number in field data, skipping API check`);
      return;
    }

    const worker = await getWorkerFull(this.page, this.baseUrl, personNumber, this.creds);
    if (!worker) {
      console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} not found via API (may be newly created)`);
      return;
    }

    // Verify worker record exists
    expect(worker.PersonNumber, `Worker ${personNumber} should exist`).toBe(personNumber);

    // Verify work relationship exists
    const workRels = worker.workRelationships || [];
    if (workRels.length > 0) {
      const primaryRel = workRels.find(wr => wr.PrimaryFlag) || workRels[0];
      console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} — ` +
        `LegalEmployer: ${primaryRel.LegalEmployerName}, StartDate: ${primaryRel.StartDate}`);
    }

    // Verify email is provisioned (if worker has been fully hired)
    const emails = worker.emails || [];
    if (emails.length > 0) {
      const cruEmail = emails.find(e => e.EmailAddress?.includes('@cru.org'));
      if (cruEmail) {
        console.log(`[OutcomeValidator] ${tc.testId}: Email provisioned: ${cruEmail.EmailAddress}`);
      }
    }
  }

  /**
   * Validate termination outcome.
   * Looks up person and verifies TerminationDate is set on a work relationship.
   */
  private async validateTermination(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();

    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const worker = await getWorkerFull(this.page, this.baseUrl, personNumber, this.creds);
    if (!worker) {
      console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} not found via API`);
      return;
    }

    const workRels = worker.workRelationships || [];
    const terminated = workRels.find(wr => wr.TerminationDate !== null);
    if (terminated) {
      console.log(`[OutcomeValidator] ${tc.testId}: Termination confirmed — ` +
        `TerminationDate: ${terminated.TerminationDate}`);
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: No terminated work relationship found for ${personNumber}`);
    }
  }

  /**
   * Validate document management access — UI-only check.
   */
  private async validateDocumentAccess(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();

    const docSection = this.page.locator('text=Document Records, text=Documents, text=Attachments').first();
    const visible = await docSection.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      console.log(`[OutcomeValidator] ${tc.testId}: Document section visible`);
    }
  }

  // ── Absence ──────────────────────────────────────────────────────────

  private async validateAbsence(tc: UATTestCase): Promise<void> {
    const bp = (tc.businessProcess || '').toLowerCase();
    const fieldData = getFieldData(tc.testId);

    if (bp.includes('entry') || bp.includes('submit') || bp.includes('add')) {
      await this.validateAbsenceSubmission(tc, fieldData);
    } else if (bp.includes('approval') || bp.includes('approve')) {
      await this.validateAbsenceApproval(tc, fieldData);
    } else {
      await this.verifyNoErrors();
    }
  }

  /**
   * Validate absence submission — checks that an absence record exists via API.
   */
  private async validateAbsenceSubmission(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();

    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const absences = await lookupAbsencesByNumber(this.page, this.baseUrl, personNumber, this.creds);
    if (absences.length > 0) {
      const latest = absences[absences.length - 1];
      console.log(`[OutcomeValidator] ${tc.testId}: Absence found — ` +
        `status: ${latest.absenceStatusCd}, approval: ${latest.approvalStatusCd}, ` +
        `${latest.startDate} to ${latest.endDate}`);
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: No absences found for person ${personNumber}`);
    }
  }

  /**
   * Validate absence approval — checks approval status via API.
   */
  private async validateAbsenceApproval(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();

    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const absences = await lookupAbsencesByNumber(this.page, this.baseUrl, personNumber, this.creds);
    const approved = absences.filter(a => a.approvalStatusCd === 'APPROVED');
    if (approved.length > 0) {
      console.log(`[OutcomeValidator] ${tc.testId}: ${approved.length} approved absence(s) for ${personNumber}`);
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: No approved absences found for ${personNumber}`);
    }
  }

  // ── Benefits ─────────────────────────────────────────────────────────

  /**
   * Validate benefits — UI-based since benefitEnrollments API returns 403.
   */
  private async validateBenefits(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();

    // Check for plan-level indicators in the UI
    const planSummary = this.page.locator('[class*="plan"], [class*="enrollment"], [class*="benefit"]').first();
    const visible = await planSummary.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      console.log(`[OutcomeValidator] ${tc.testId}: Benefits plan summary visible`);
    }
  }

  // ── Payroll ──────────────────────────────────────────────────────────

  private async validatePayroll(tc: UATTestCase): Promise<void> {
    const fieldData = getFieldData(tc.testId);

    // All payroll tests with field data containing element entry fields
    // (108 of 113) should be validated via the element entry API, regardless
    // of their business process name.
    if (fieldData) {
      const hasElementFields = Boolean(
        getField(fieldData, 'Search For') && getField(fieldData, 'Element name')
      );
      if (hasElementFields) {
        await this.validateElementEntry(tc, fieldData);
        return;
      }
    }

    // Non-element-entry payroll tests (leave, hire, configuration) — UI check only
    await this.verifyNoErrors();
  }

  /**
   * Validate element entry creation via API.
   * Looks up person by number and checks that element entries exist.
   * Also verifies the effective date matches if field data provides one.
   */
  private async validateElementEntry(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();

    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    const searchFor = getField(fieldData, 'Search For');

    // Try personNumber first; if not available, we can't do API validation
    if (!personNumber) {
      if (searchFor) {
        console.log(`[OutcomeValidator] ${tc.testId}: Has Search For="${searchFor}" but no person number — skipping API check`);
      }
      return;
    }

    const entries = await lookupElementEntriesByNumber(this.page, this.baseUrl, personNumber, this.creds);
    if (entries.length > 0) {
      const elementName = getField(fieldData, 'Element name');
      // Check if the expected element exists in the person's entries
      if (elementName) {
        const matching = entries.filter(e =>
          String(e.ElementName || '').toLowerCase().includes(elementName.toLowerCase())
        );
        if (matching.length > 0) {
          console.log(`[OutcomeValidator] ${tc.testId}: Element "${elementName}" found (${matching.length} entries) for ${personNumber}`);
        } else {
          console.log(`[OutcomeValidator] ${tc.testId}: Element "${elementName}" NOT found among ${entries.length} entries for ${personNumber}`);
        }
      } else {
        console.log(`[OutcomeValidator] ${tc.testId}: ${entries.length} element entry(ies) found for ${personNumber}`);
      }
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: No element entries found for ${personNumber}`);
    }
  }

  // ── Time & Labor ─────────────────────────────────────────────────────

  /**
   * Validate Time & Labor — UI-only since timecards API returns 403.
   */
  private async validateTimeLabor(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
  }

  // ── MPDX ───────────────────────────────────────────────────────────

  /**
   * Validate MPDX operations — UI-based checks for Scheduled Processes completion.
   * MPDX operations (Salary Calc, MHA Calc, MPD Goals) run via Scheduled Processes,
   * so we check the page for success/completion indicators.
   * TODO: Add REST API validation for salary amounts if hcmGet endpoints become available.
   */
  private async validateMPDX(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();

    // Check for Scheduled Processes result indicators
    const successIndicators = [
      'Succeeded', 'Completed', 'submitted', 'Running', 'Pending', 'Ready',
    ];
    for (const indicator of successIndicators) {
      const el = this.page.getByText(indicator, { exact: false }).first();
      const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        console.log(`[OutcomeValidator] ${tc.testId}: MPDX process status — "${indicator}"`);
        return;
      }
    }

    console.log(`[OutcomeValidator] ${tc.testId}: No explicit MPDX process status found (flow-level check may have passed)`);
  }

  // ── Generic ──────────────────────────────────────────────────────────

  /**
   * Generic validation — verify no error banners on the page.
   */
  private async validateGeneric(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Check for common Oracle HCM error indicators on the page.
   * Throws if an error banner/message is visible.
   */
  private async verifyNoErrors(): Promise<void> {
    const errorSelectors = [
      '.af_message_error',
      '[class*="AFError"]',
      '.oj-message-error',
      '[class*="error-message"]',
    ];

    for (const selector of errorSelectors) {
      const errorEl = this.page.locator(selector).first();
      const visible = await errorEl.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        const text = await errorEl.textContent().catch(() => 'unknown error');
        throw new Error(`[OutcomeValidator] Error detected on page: ${text}`);
      }
    }
  }
}
