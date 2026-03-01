/**
 * OutcomeValidator — module-specific post-execution validation.
 *
 * Uses Oracle HCM REST API calls (via Node.js https, not Playwright page.request)
 * for data verification. All major endpoints are accessible with josh.starcher@cru.org
 * credentials via Basic Auth through OWSM.
 *
 * Assertion errors (from expect()) propagate and fail the test.
 * API/network errors are logged as warnings and do not fail the test.
 */
import { type Page, expect } from '@playwright/test';
import type { UATTestCase, TestCase } from '../data/types';
import { getFieldData } from '../data/uat-plan-provider';
import { getField } from '../data/test-data-provider';
import {
  lookupPersonId,
  getWorkerFull,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  lookupBenefitEnrollmentsByNumber,
  lookupSalariesByNumber,
  lookupTimeRecords,
  lookupAllocatedChecklistsByNumber,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';

export class OutcomeValidator {
  private baseUrl: string;
  private creds: BasicAuthCredentials;

  constructor(private page: Page) {
    this.baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    // OWSM requires email-format username for REST API Basic Auth
    this.creds = { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };
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
      else if (module.includes('compensation')) await this.validateCompensation(tc);
      else if (module.includes('time')) await this.validateTimeLabor(tc);
      else if (module.includes('journey')) await this.validateJourneys(tc);
      else if (module.includes('mpdx')) await this.validateMPDX(tc);
      else if (module.includes('saa')) await this.validateSAA(tc);
      else await this.validateGeneric(tc);
    } catch (error) {
      // All errors should fail the test — no silent swallowing
      throw error;
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
      // For assignment changes, personal info updates, etc. — verify worker exists
      await this.validateWorkerExists(tc, fieldData);
    }
  }

  private async validateHireOutcome(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    expect(worker, `${tc.testId}: Worker ${personNumber} should exist in HCM after hire`).toBeTruthy();

    expect(worker!.PersonNumber, `Worker ${personNumber} should exist`).toBe(personNumber);

    const workRels = worker!.workRelationships || [];
    expect(workRels.length, `${tc.testId}: Worker ${personNumber} should have at least one work relationship`).toBeGreaterThan(0);

    const primaryRel = workRels.find(wr => wr.PrimaryFlag) || workRels[0];
    console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} — ` +
      `LegalEmployer: ${primaryRel.LegalEmployerName}, StartDate: ${primaryRel.StartDate}`);

    const emails = worker!.emails || [];
    const cruEmail = emails.find(e => e.EmailAddress?.includes('@cru.org'));
    if (cruEmail) {
      console.log(`[OutcomeValidator] ${tc.testId}: Email provisioned: ${cruEmail.EmailAddress}`);
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: WARNING — no @cru.org email found. Emails: ${emails.map(e => e.EmailAddress).join(', ') || '(none)'}`);
    }
  }

  private async validateTermination(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    expect(worker, `${tc.testId}: Worker ${personNumber} should exist in HCM`).toBeTruthy();

    const workRels = worker!.workRelationships || [];
    const terminated = workRels.find(wr => wr.TerminationDate !== null);
    expect(
      terminated,
      `${tc.testId}: Worker ${personNumber} should have a terminated work relationship, ` +
        `but found ${workRels.length} work relationship(s) with no TerminationDate set`,
    ).toBeTruthy();

    console.log(`[OutcomeValidator] ${tc.testId}: Termination confirmed — ` +
      `TerminationDate: ${terminated!.TerminationDate}`);
  }

  private async validateDocumentAccess(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const docSection = this.page.locator('text=Document Records, text=Documents, text=Attachments').first();
    const visible = await docSection.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      console.log(`[OutcomeValidator] ${tc.testId}: Document section visible`);
    }
  }

  /** Verify worker record exists via API (for assignment changes, personal info, etc.) */
  private async validateWorkerExists(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    if (worker) {
      console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} verified (${worker.DisplayName || 'no name'})`);
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
      await this.validateAbsenceGeneric(tc, fieldData);
    }
  }

  private async validateAbsenceSubmission(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      absences.length,
      `${tc.testId}: Expected at least one absence record for person ${personNumber} after submission`,
    ).toBeGreaterThan(0);

    const latest = absences[absences.length - 1];
    console.log(`[OutcomeValidator] ${tc.testId}: Absence found — ` +
      `status: ${latest.absenceStatusCd}, approval: ${latest.approvalStatusCd}, ` +
      `${latest.startDate} to ${latest.endDate}`);
  }

  private async validateAbsenceApproval(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);
    const approved = absences.filter(a => a.approvalStatusCd === 'APPROVED');
    expect(
      approved.length,
      `${tc.testId}: Expected at least one APPROVED absence for person ${personNumber}, ` +
        `but found statuses: ${absences.map(a => `${a.absenceStatusCd}/${a.approvalStatusCd}`).join(', ') || '(none)'}`,
    ).toBeGreaterThan(0);

    console.log(`[OutcomeValidator] ${tc.testId}: ${approved.length} approved absence(s) for ${personNumber}`);
  }

  private async validateAbsenceGeneric(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      absences.length,
      `${tc.testId}: Expected at least one absence record for person ${personNumber}`,
    ).toBeGreaterThan(0);

    console.log(`[OutcomeValidator] ${tc.testId}: ${absences.length} absence record(s) for ${personNumber}`);
  }

  // ── Benefits ─────────────────────────────────────────────────────────

  /**
   * Validate benefits — now uses benefitEnrollments API (previously returned 403).
   */
  private async validateBenefits(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const enrollments = await lookupBenefitEnrollmentsByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      enrollments.length,
      `${tc.testId}: Expected at least one benefit enrollment for person ${personNumber}`,
    ).toBeGreaterThan(0);

    console.log(`[OutcomeValidator] ${tc.testId}: ${enrollments.length} benefit enrollment(s) for ${personNumber}`);
    const first = enrollments[0];
    console.log(`[OutcomeValidator] ${tc.testId}: First enrollment — ` +
      `coverage: ${first.EnrollmentCoverageStartDate} to ${first.EnrollmentCoverageEndDate}`);
  }

  // ── Payroll ──────────────────────────────────────────────────────────

  private async validatePayroll(tc: UATTestCase): Promise<void> {
    const fieldData = getFieldData(tc.testId);

    if (fieldData) {
      const hasElementFields = Boolean(
        getField(fieldData, 'Search For') && getField(fieldData, 'Element name')
      );
      if (hasElementFields) {
        await this.validateElementEntry(tc, fieldData);
        return;
      }
    }

    await this.verifyNoErrors();
  }

  private async validateElementEntry(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.verifyNoErrors();
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const entries = await lookupElementEntriesByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      entries.length,
      `${tc.testId}: Expected at least one element entry for person ${personNumber}`,
    ).toBeGreaterThan(0);

    const elementName = getField(fieldData, 'Element name');
    if (elementName) {
      const matching = entries.filter(e =>
        String(e.ElementName || '').toLowerCase().includes(elementName.toLowerCase())
      );
      expect(
        matching.length,
        `${tc.testId}: Expected element "${elementName}" for person ${personNumber}, ` +
          `but found ${entries.length} entries with no match`,
      ).toBeGreaterThan(0);

      console.log(`[OutcomeValidator] ${tc.testId}: Element "${elementName}" found (${matching.length} entries) for ${personNumber}`);
    } else {
      console.log(`[OutcomeValidator] ${tc.testId}: ${entries.length} element entry(ies) found for ${personNumber}`);
    }
  }

  // ── Compensation ───────────────────────────────────────────────────

  /**
   * Validate compensation — now uses salaries API (previously returned 403).
   */
  private async validateCompensation(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const salaries = await lookupSalariesByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      salaries.length,
      `${tc.testId}: Expected at least one salary record for person ${personNumber}`,
    ).toBeGreaterThan(0);

    const latest = salaries[salaries.length - 1];
    console.log(`[OutcomeValidator] ${tc.testId}: Salary found — ` +
      `${latest.CurrencyCode} ${latest.SalaryAmount}, from: ${latest.DateFrom}`);
  }

  // ── Time & Labor ─────────────────────────────────────────────────────

  /**
   * Validate Time & Labor — now uses timeRecordGroups API (previously returned 403).
   */
  private async validateTimeLabor(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const records = await lookupTimeRecords(null, this.baseUrl, personNumber, undefined, undefined, this.creds);
    expect(
      records.length,
      `${tc.testId}: Expected at least one time record for person ${personNumber}`,
    ).toBeGreaterThan(0);

    const latest = records[records.length - 1];
    console.log(`[OutcomeValidator] ${tc.testId}: ${records.length} time record group(s) for ${personNumber} — ` +
      `latest: ${latest.startTime} to ${latest.stopTime}, type: ${latest.groupType}`);
  }

  // ── Journeys ─────────────────────────────────────────────────────────

  /**
   * Validate Journeys — now uses allocatedChecklists API (previously returned 403).
   */
  private async validateJourneys(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    const checklists = await lookupAllocatedChecklistsByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      checklists.length,
      `${tc.testId}: Expected at least one journey checklist for person ${personNumber}`,
    ).toBeGreaterThan(0);

    const latest = checklists[checklists.length - 1];
    console.log(`[OutcomeValidator] ${tc.testId}: ${checklists.length} journey checklist(s) — ` +
      `"${latest.ChecklistName}" — status: ${latest.ChecklistStatus}`);
  }

  // ── MPDX ───────────────────────────────────────────────────────────

  /**
   * Validate MPDX — salary API for salary calc results + UI for process status.
   */
  private async validateMPDX(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);

    // Try salary API validation if person number available
    if (fieldData) {
      const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
      if (personNumber) {
        const salaries = await lookupSalariesByNumber(null, this.baseUrl, personNumber, this.creds);
        if (salaries.length > 0) {
          const latest = salaries[salaries.length - 1];
          console.log(`[OutcomeValidator] ${tc.testId}: MPDX salary — ${latest.CurrencyCode} ${latest.SalaryAmount}`);
          return;
        }
      }
    }

    // Fallback: UI check for Scheduled Processes completion
    const successIndicators = ['Succeeded', 'Completed', 'submitted', 'Running', 'Pending', 'Ready'];
    for (const indicator of successIndicators) {
      const el = this.page.getByText(indicator, { exact: false }).first();
      const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        console.log(`[OutcomeValidator] ${tc.testId}: MPDX process status — "${indicator}"`);
        return;
      }
    }
    console.log(`[OutcomeValidator] ${tc.testId}: No MPDX validation data found`);
  }

  // ── SAA ────────────────────────────────────────────────────────────

  /**
   * Validate SAA — salary + approval data via API.
   */
  private async validateSAA(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return;

    // Check salary records (SAA is salary approval)
    const salaries = await lookupSalariesByNumber(null, this.baseUrl, personNumber, this.creds);
    expect(
      salaries.length,
      `${tc.testId}: Expected at least one salary record for person ${personNumber} (SAA)`,
    ).toBeGreaterThan(0);

    const latest = salaries[salaries.length - 1];
    console.log(`[OutcomeValidator] ${tc.testId}: SAA salary — ${latest.CurrencyCode} ${latest.SalaryAmount}, from: ${latest.DateFrom}`);
  }

  // ── Generic ──────────────────────────────────────────────────────────

  private async validateGeneric(tc: UATTestCase): Promise<void> {
    await this.verifyNoErrors();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

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
