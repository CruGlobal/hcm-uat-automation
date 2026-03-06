/**
 * PreFlightChecker — checks and resets test data state before destructive tests.
 *
 * Before each test that performs a destructive operation (terminate, hire, absence submit,
 * element entry), this service checks via REST API whether the data is already consumed.
 * If so, it attempts to reset the state (reverse termination, withdraw absence, etc.)
 * so the test can run again on re-execution.
 *
 * Uses REST API credentials resolved from: ORACLE_API_USERNAME/PASSWORD env vars,
 * then current bot account (PARALLEL_BOT_ACCOUNT), then bot_hr_admin as fallback.
 * No browser/Page required — pure API calls.
 */
import type { UATTestCase, TestCase } from '../data/types';
import { getFieldData } from '../data/uat-plan-provider';
import { getField } from '../data/test-data-provider';
import {
  getWorkerFull,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  lookupBenefitEnrollmentsByNumber,
  lookupTimeCardsByNumber,
  reverseTermination,
  withdrawAbsence,
  deleteElementEntry,
  deleteBenefitEnrollment,
  deleteTimeCard,
  terminateWorker,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';
import { resolveApiCredentials } from './api-credentials';

export interface PreFlightResult {
  ready: boolean;
  action: string;
  reason: string;
}

const OK: PreFlightResult = { ready: true, action: 'ok', reason: 'State verified — ready to run' };

export class PreFlightChecker {
  private baseUrl: string;
  private creds: BasicAuthCredentials;

  constructor() {
    this.baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    this.creds = resolveApiCredentials();
  }

  async prepare(tc: UATTestCase): Promise<PreFlightResult> {
    const module = (tc.module || '').toLowerCase();
    try {
      if (module.includes('core hr')) return await this.prepareCoreHR(tc);
      if (module.includes('absence')) return await this.prepareAbsence(tc);
      if (module.includes('payroll')) return await this.preparePayroll(tc);
      if (module.includes('benefit')) return await this.prepareBenefits(tc);
      if (module.includes('time')) return await this.prepareTimeAndLabor(tc);
      if (module.includes('oneapp')) return await this.prepareOneApp(tc);
      // Journeys, Compensation, MPDX, SAA, Other — generally safe
      return OK;
    } catch (error: any) {
      // API/network errors should not block the test — log and proceed
      console.warn(`[PreFlight] ${tc.testId}: API error during pre-flight check — ${error.message}`);
      return OK;
    }
  }

  // ── Core HR ──────────────────────────────────────────────────────────

  private async prepareCoreHR(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');

    // Assignment changes are safe — skip before "hire" check to avoid false positive
    // (e.g. BP "NSO enrollee-Long Hire" contains "hire" but is actually an assignment change)
    if (bp.includes('assignment change') || bp.includes('status change')) {
      return OK;
    }
    // Hire checks work even without a person number (looks up by name)
    if (bp.includes('hire') || bp.includes('pending') || bp.includes('nonworker') || bp.includes('non worker')) {
      return this.prepareHire(tc, personNumber);
    }
    // Remaining checks require a person number
    if (!personNumber) return OK;
    if (bp.includes('terminat')) {
      return this.prepareTermination(tc, personNumber);
    }
    if (bp.includes('rehire')) {
      return this.prepareRehire(tc, personNumber);
    }
    if (bp.includes('create work rel')) {
      return this.prepareCreateWorkRelationship(tc, personNumber);
    }
    return OK;
  }

  /** Termination: person must have an active (non-terminated) work relationship. */
  private async prepareTermination(tc: UATTestCase, personNumber: string): Promise<PreFlightResult> {
    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    if (!worker) {
      console.warn(`[PreFlight] ${tc.testId}: Person ${personNumber} not found in HCM — letting test attempt anyway`);
      return OK;
    }

    const workRels = worker.workRelationships || [];
    const activeRel = workRels.find(wr => wr.TerminationDate === null);

    if (activeRel) {
      // Person has an active work relationship — good to go
      return OK;
    }

    // ALL work relationships are terminated — try to reverse the most recent one
    const sorted = [...workRels].sort((a, b) =>
      (b.StartDate || '').localeCompare(a.StartDate || ''),
    );
    const mostRecent = sorted[0];
    if (!mostRecent) {
      console.warn(`[PreFlight] ${tc.testId}: Person ${personNumber} has no work relationships — letting test attempt anyway`);
      return OK;
    }

    console.log(`[PreFlight] ${tc.testId}: Person ${personNumber} fully terminated (latest WR: ${mostRecent.TerminationDate}), reversing...`);
    try {
      await reverseTermination(this.baseUrl, worker.PersonId, mostRecent.PeriodOfServiceId, this.creds);
      return {
        ready: true,
        action: 'reversed-termination',
        reason: `Reversed termination for ${personNumber} (was terminated ${mostRecent.TerminationDate})`,
      };
    } catch (error: any) {
      console.warn(`[PreFlight] ${tc.testId}: Could not reverse termination for ${personNumber}: ${error.message} — letting test attempt anyway`);
      return OK;
    }
  }

  /** Rehire: person must exist AND have no active work relationship (all terminated). */
  private async prepareRehire(tc: UATTestCase, personNumber: string): Promise<PreFlightResult> {
    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    if (!worker) {
      console.warn(`[PreFlight] ${tc.testId}: Person ${personNumber} not found in HCM — letting test attempt anyway`);
      return OK;
    }

    const workRels = worker.workRelationships || [];
    const activeRel = workRels.find(wr => wr.TerminationDate === null);

    if (!activeRel) {
      // No active WR — person is terminated, ready for rehire
      return OK;
    }

    // Person has an active WR (already rehired) — need to terminate first
    console.log(`[PreFlight] ${tc.testId}: Person ${personNumber} is active (already rehired), re-terminating...`);
    try {
      const today = new Date().toISOString().split('T')[0];
      await terminateWorker(this.baseUrl, worker.PersonId, activeRel.PeriodOfServiceId, today, this.creds);
      return {
        ready: true,
        action: 're-terminated',
        reason: `Re-terminated ${personNumber} so rehire test can run`,
      };
    } catch (error: any) {
      console.warn(`[PreFlight] ${tc.testId}: Could not re-terminate ${personNumber} for rehire: ${error.message} — letting test attempt anyway`);
      return OK;
    }
  }

  /**
   * Hire/Add Pending/Add Non-Worker: generally re-runnable.
   * Each run creates a new person with an auto-generated PersonNumber,
   * so there's no consumed state to reset.
   *
   * Exception: Pending-to-Hire tests (e.g., HR-017, HR-018) search for an
   * existing pending worker by PersonNumber and convert them to hired.
   * Once hired, the pending state is consumed. The Oracle HCM REST API does
   * not support creating pending workers (POST to workers is disabled) and
   * there is no "reverse hire" action to restore the pending state.
   * We check and log the state but return OK — the PendingToHireFlow handles
   * the "already active" case by verifying the person detail page instead.
   */
  private async prepareHire(tc: UATTestCase, _personNumber: string): Promise<PreFlightResult> {
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    // Detect Pending-to-Hire tests: they have a "Search for Person Number" field
    // that references an existing pending worker to be converted to hired.
    const searchPersonNumber = getField(fieldData, 'Search for Person Number');
    if (!searchPersonNumber) return OK;

    const worker = await getWorkerFull(null, this.baseUrl, searchPersonNumber, this.creds);
    if (!worker) {
      console.log(
        `[PreFlight] ${tc.testId}: Pending worker ${searchPersonNumber} not found via REST API — ` +
        `may still exist as a pending worker (REST API may not return pending workers). Letting test attempt.`,
      );
      return OK;
    }

    const workRels = worker.workRelationships || [];
    const activeRel = workRels.find(wr => wr.TerminationDate === null);

    if (!activeRel) {
      // No active work relationship — worker may still be pending or terminated
      console.log(
        `[PreFlight] ${tc.testId}: Person ${searchPersonNumber} has no active work relationship — ` +
        `may be in pending state. Letting test attempt.`,
      );
      return OK;
    }

    // Person is already active (hired in a previous run). Cannot restore pending state:
    // - Oracle HCM REST API does not support creating pending workers (POST disabled)
    // - There is no "reverse hire" or "convert to pending" REST action
    // - Terminating the worker does NOT restore pending status — it creates a terminated state
    // The PendingToHireFlow handles this by checking for "Active" status in search results
    // and verifying the person detail page instead of re-running the hire wizard.
    console.log(
      `[PreFlight] ${tc.testId}: Person ${searchPersonNumber} is already active (hired). ` +
      `Cannot restore pending state via REST API (no "reverse hire" action). ` +
      `Test will verify person exists with active status instead of re-running hire.`,
    );
    return OK;
  }

  /** Create Work Relationship: always re-runnable (creates a new WR each time). */
  private async prepareCreateWorkRelationship(_tc: UATTestCase, _personNumber: string): Promise<PreFlightResult> {
    return OK;
  }

  // ── Absence ──────────────────────────────────────────────────────────

  private async prepareAbsence(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();

    // Absence approval tests: check if the person has a pending absence to approve.
    if (bp.includes('approv')) {
      return this.prepareAbsenceApproval(tc);
    }

    // Only check for absence entry/submission tests — other tests are generally safe
    if (!bp.includes('entry') && !bp.includes('submit') && !bp.includes('add')) {
      return OK;
    }

    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const startDate = getField(fieldData, 'start date') || getField(fieldData, 'from date');
    if (!startDate) return OK;

    const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);
    // Check for a duplicate absence with matching start date
    const duplicate = absences.find(a => {
      if (!a.startDate) return false;
      // Compare date portions (both may be ISO or various formats)
      return a.startDate.includes(startDate) || startDate.includes(a.startDate);
    });

    if (!duplicate) return OK;

    // Found a duplicate — try to withdraw it
    const status = (duplicate.absenceStatusCd || '').toUpperCase();
    if (status === 'WITHDRAWN' || status === 'CANCELLED') {
      // Already withdrawn — test should be able to create a new one
      return OK;
    }

    console.log(`[PreFlight] ${tc.testId}: Duplicate absence found for ${personNumber} (${duplicate.startDate}, status: ${status}), withdrawing...`);
    try {
      await withdrawAbsence(this.baseUrl, duplicate.absenceCaseId, this.creds);
      return {
        ready: true,
        action: 'withdrew-absence',
        reason: `Withdrew duplicate absence for ${personNumber} (start: ${duplicate.startDate})`,
      };
    } catch (error: any) {
      console.warn(`[PreFlight] ${tc.testId}: Could not withdraw absence for ${personNumber}: ${error.message} — letting test attempt anyway`);
      return OK;
    }
  }

  /**
   * Absence Approval pre-flight: check if the person's most recent absence
   * is in a state that can be approved (SUBMITTED/ORA_SUBMITTED).
   *
   * If already APPROVED/COMPLETED: cannot reset via REST API.
   * The Oracle HCM absences REST endpoint does NOT support POST to create new
   * absences, and PATCH can only withdraw (not re-submit) an absence.
   * Re-submitting an absence requires the full UI workflow (ESS absence entry).
   *
   * We log a diagnostic message but return OK — the AbsenceApprovalFlow
   * handles the "no pending approval" case gracefully (navigation-only pass).
   */
  private async prepareAbsenceApproval(tc: UATTestCase): Promise<PreFlightResult> {
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);
    if (absences.length === 0) {
      console.log(
        `[PreFlight] ${tc.testId}: No absences found for person ${personNumber} — ` +
        `approval test will rely on notification bell (cannot create absences via REST API)`,
      );
      return OK;
    }

    // Sort by startDate descending to find the most recent absence
    const sorted = [...absences].sort((a, b) =>
      (b.startDate || '').localeCompare(a.startDate || ''),
    );
    const latest = sorted[0];
    const status = (latest.absenceStatusCd || '').toUpperCase();
    const approval = (latest.approvalStatusCd || '').toUpperCase();

    if (status === 'SUBMITTED' || status === 'ORA_SUBMITTED' || approval === 'PENDING_APPROVAL') {
      // Absence is pending approval — good to go
      console.log(
        `[PreFlight] ${tc.testId}: Person ${personNumber} has a pending absence ` +
        `(${latest.startDate}, status: ${status}, approval: ${approval}) — ready for approval`,
      );
      return OK;
    }

    // Absence is already approved/completed/withdrawn — cannot re-submit via REST API.
    // Oracle HCM absences REST does not support creating new absence records (POST disabled)
    // and PATCH only supports status changes to WITHDRAWN, not back to SUBMITTED.
    // The test will proceed and handle the "no pending approval" case via its catch block.
    console.log(
      `[PreFlight] ${tc.testId}: Person ${personNumber} latest absence already ${status} ` +
      `(approval: ${approval}, date: ${latest.startDate}) — cannot re-submit via REST API. ` +
      `Test will attempt approval via notification bell; if no notification exists, it passes as navigation-only.`,
    );
    return OK;
  }

  // ── Payroll ──────────────────────────────────────────────────────────

  private async preparePayroll(tc: UATTestCase): Promise<PreFlightResult> {
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    const elementName = getField(fieldData, 'element name');
    if (!personNumber || !elementName) return OK;

    const entries = await lookupElementEntriesByNumber(null, this.baseUrl, personNumber, this.creds);
    // Check for matching element entry
    const duplicate = entries.find(e =>
      String((e as any).ElementName || '').toLowerCase().includes(elementName.toLowerCase()),
    );

    if (!duplicate) return OK;

    console.log(`[PreFlight] ${tc.testId}: Duplicate element entry "${elementName}" found for ${personNumber}, deleting...`);
    try {
      await deleteElementEntry(this.baseUrl, duplicate.ElementEntryId, this.creds);
      return {
        ready: true,
        action: 'deleted-element-entry',
        reason: `Deleted duplicate element entry "${elementName}" for ${personNumber}`,
      };
    } catch (error: any) {
      console.warn(`[PreFlight] ${tc.testId}: Could not delete element entry for ${personNumber}: ${error.message} — letting test attempt anyway`);
      return OK;
    }
  }

  // ── Benefits ────────────────────────────────────────────────────────

  /**
   * Benefits enrollment idempotency: detect existing enrollments for the same
   * person + plan and attempt to delete them so the test can re-enroll.
   *
   * Only checks enrollment/elect/life-event business processes — view, admin,
   * and termination-related benefit tests are safe to re-run without cleanup.
   */
  private async prepareBenefits(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();

    // Skip tests that don't create/modify enrollments — these are safe to re-run
    const isEnrollmentTest =
      bp.includes('enroll') || bp.includes('elect') || bp.includes('life event') ||
      bp.includes('reclass') || bp.includes('rehire') || bp.includes('new hire') ||
      bp.includes('set up') || bp.includes('continuation') || bp.includes('disability');
    if (!isEnrollmentTest) return OK;

    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const planName = getField(fieldData, 'plan');
    if (!planName) return OK;

    const enrollments = await lookupBenefitEnrollmentsByNumber(null, this.baseUrl, personNumber, this.creds);
    if (enrollments.length === 0) return OK;

    // Find enrollment(s) matching the plan name (case-insensitive partial match)
    const planLower = planName.toLowerCase();
    const matching = enrollments.filter(e => {
      const ePlanName = String((e as any).PlanName || '').toLowerCase();
      return ePlanName.includes(planLower) || planLower.includes(ePlanName);
    });

    if (matching.length === 0) return OK;

    // Try to delete each matching enrollment
    const deleted: number[] = [];
    const failed: string[] = [];
    for (const enrollment of matching) {
      const id = enrollment.EnrollmentResultId;
      try {
        await deleteBenefitEnrollment(this.baseUrl, id, this.creds);
        deleted.push(id);
      } catch (error: any) {
        // Oracle HCM may not support DELETE on benefitEnrollments — log and continue
        failed.push(`${id}: ${error.message}`);
      }
    }

    if (deleted.length > 0) {
      return {
        ready: true,
        action: 'deleted-benefit-enrollment',
        reason: `Deleted ${deleted.length} existing "${planName}" enrollment(s) for ${personNumber}`,
      };
    }

    if (failed.length > 0) {
      // DELETE not supported or failed — log the limitation but don't block the test.
      // Oracle HCM benefits enrollments may not support REST DELETE; the UI workflow
      // should still be able to update/replace the enrollment.
      console.warn(
        `[PreFlight] ${tc.testId}: Could not delete existing "${planName}" enrollment(s) for ${personNumber} ` +
        `(${failed.length} failed: ${failed[0]}) — letting test attempt anyway`,
      );
      return OK;
    }

    return OK;
  }

  // ── Time & Labor ────────────────────────────────────────────────────

  /**
   * Timecard entry idempotency: detect existing timecards for the same
   * person + work date and delete them so the test can create a fresh one.
   *
   * Only checks entry/create/submit business processes — approval, validation,
   * calculation, and admin configuration tests are safe to re-run without cleanup.
   */
  private async prepareTimeAndLabor(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();

    // Timecard approval tests: check if the person has a pending timecard to approve.
    if (bp.includes('approv') || bp.includes('approval')) {
      return this.prepareTimecardApproval(tc);
    }

    // Only check for tests that create timecards — skip view/admin/config tests
    const isEntryTest =
      bp.includes('timecard entry') || bp.includes('absence on timecard') ||
      bp.includes('timecard amend') || bp.includes('timecard attestation') ||
      bp.includes('web clock');
    if (!isEntryTest) return OK;

    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const workDate = getField(fieldData, 'work date');
    if (!workDate) return OK;

    // Normalize work date to YYYY-MM-DD for comparison
    const normalizedDate = this.normalizeDate(workDate);
    if (!normalizedDate) return OK;

    const timeCards = await lookupTimeCardsByNumber(this.baseUrl, personNumber, this.creds);
    if (timeCards.length === 0) return OK;

    // Find timecard(s) whose date range covers the work date
    const matching = timeCards.filter(card => {
      const start = this.normalizeDate(card.StartDate);
      const stop = this.normalizeDate(card.StopDate);
      if (!start || !stop) return false;
      return normalizedDate >= start && normalizedDate <= stop;
    });

    if (matching.length === 0) return OK;

    // Delete each matching timecard
    const deleted: number[] = [];
    for (const card of matching) {
      console.log(`[PreFlight] ${tc.testId}: Duplicate timecard found for ${personNumber} (${card.StartDate}–${card.StopDate}, status: ${card.Status}), deleting...`);
      try {
        await deleteTimeCard(this.baseUrl, card.TimeCardId, card.TimeCardVersion, this.creds);
        deleted.push(card.TimeCardId);
      } catch (error: any) {
        console.warn(`[PreFlight] ${tc.testId}: Could not delete timecard ${card.TimeCardId} for ${personNumber}: ${error.message} — letting test attempt anyway`);
      }
    }

    if (deleted.length > 0) {
      return {
        ready: true,
        action: 'deleted-timecard',
        reason: `Deleted ${deleted.length} existing timecard(s) for ${personNumber} covering ${normalizedDate}`,
      };
    }

    return OK;
  }

  /**
   * Normalize a date string to YYYY-MM-DD format.
   * Handles ISO strings ("2026-01-05T05:00:00.000Z") and US format ("03/02/2026").
   */
  private normalizeDate(dateStr: string): string | null {
    if (!dateStr) return null;
    // ISO format: extract YYYY-MM-DD
    const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    // US format: MM/DD/YYYY → YYYY-MM-DD
    const usMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
    return null;
  }

  /**
   * Timecard Approval pre-flight: check if the person has a pending (submitted)
   * timecard that can be approved.
   *
   * If already APPROVED/COMPLETED: cannot reset via REST API.
   * The Oracle HCM timeCards REST endpoint supports deleteAction but not
   * createAction or submitAction — there is no way to create or re-submit
   * a timecard via REST API. Submitting a timecard requires the full UI workflow.
   *
   * We log a diagnostic message but return OK — the TimeApprovalFlow handles
   * the "no pending approval" case gracefully (navigation-only validation).
   */
  private async prepareTimecardApproval(tc: UATTestCase): Promise<PreFlightResult> {
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const timeCards = await lookupTimeCardsByNumber(this.baseUrl, personNumber, this.creds);
    if (timeCards.length === 0) {
      console.log(
        `[PreFlight] ${tc.testId}: No timecards found for person ${personNumber} — ` +
        `approval test will rely on Team Time Cards UI (cannot create timecards via REST API)`,
      );
      return OK;
    }

    // Sort by StartDate descending to find the most recent timecard
    const sorted = [...timeCards].sort((a, b) =>
      (b.StartDate || '').localeCompare(a.StartDate || ''),
    );
    const latest = sorted[0];
    const status = (latest.Status || '').toUpperCase();

    if (status === 'SUBMITTED' || status === 'ORA_SUBMITTED' || status === 'PENDING_APPROVAL') {
      // Timecard is pending approval — good to go
      console.log(
        `[PreFlight] ${tc.testId}: Person ${personNumber} has a pending timecard ` +
        `(${latest.StartDate}–${latest.StopDate}, status: ${status}) — ready for approval`,
      );
      return OK;
    }

    // Timecard is already approved/completed/saved — cannot re-submit via REST API.
    // Oracle HCM timeCards REST supports deleteAction but NOT createAction or submitAction.
    // Re-submitting requires the ESS timecard entry UI workflow.
    // The test will proceed and handle the "no submitted timecard" case via its flow logic.
    console.log(
      `[PreFlight] ${tc.testId}: Person ${personNumber} latest timecard is ${status} ` +
      `(${latest.StartDate}–${latest.StopDate}) — cannot re-submit via REST API. ` +
      `Test will attempt approval via Team Time Cards; if no submitted timecard exists, it validates navigation only.`,
    );
    return OK;
  }

  // ── OneApp ──────────────────────────────────────────────────────────

  /**
   * OneApp hire tests reference existing people by PersonNumber.
   * If the person was already hired in a previous run, terminate the active
   * work relationship so the hire can run again (same pattern as prepareRehire).
   */
  private async prepareOneApp(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();

    // Only handle hire-type business processes
    if (!bp.includes('prepare for hire') && !bp.includes('new hire') && !bp.includes('hire')) {
      return OK;
    }

    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return OK;

    const personNumber = getField(fieldData, 'Person Number') || getField(fieldData, 'personnumber');
    if (!personNumber) return OK;

    const worker = await getWorkerFull(null, this.baseUrl, personNumber, this.creds);
    if (!worker) {
      console.warn(`[PreFlight] ${tc.testId}: Person ${personNumber} not found in HCM — letting test attempt anyway`);
      return OK;
    }

    const workRels = worker.workRelationships || [];
    const activeRel = workRels.find(wr => wr.TerminationDate === null);

    if (!activeRel) {
      // No active work relationship — person is not currently hired, ready to go
      return OK;
    }

    // Person has an active WR (already hired from a previous run) — terminate to reset state
    console.log(`[PreFlight] ${tc.testId}: Person ${personNumber} is already active (hired in previous run), terminating to reset...`);
    try {
      const today = new Date().toISOString().split('T')[0];
      await terminateWorker(this.baseUrl, worker.PersonId, activeRel.PeriodOfServiceId, today, this.creds);
      return {
        ready: true,
        action: 'terminated-for-rehire',
        reason: `Terminated active WR for ${personNumber} so OneApp hire test can run again`,
      };
    } catch (error: any) {
      console.warn(`[PreFlight] ${tc.testId}: Could not terminate ${personNumber} for OneApp hire reset: ${error.message} — letting test attempt anyway`);
      return OK;
    }
  }
}
