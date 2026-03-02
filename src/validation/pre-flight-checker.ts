/**
 * PreFlightChecker — checks and resets test data state before destructive tests.
 *
 * Before each test that performs a destructive operation (terminate, hire, absence submit,
 * element entry), this service checks via REST API whether the data is already consumed.
 * If so, it attempts to reset the state (reverse termination, withdraw absence, etc.)
 * so the test can run again on re-execution.
 *
 * Uses the same REST API credentials as OutcomeValidator (josh.starcher@cru.org).
 * No browser/Page required — pure API calls.
 */
import type { UATTestCase, TestCase } from '../data/types';
import { getFieldData } from '../data/uat-plan-provider';
import { getField } from '../data/test-data-provider';
import {
  getWorkerFull,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  reverseTermination,
  withdrawAbsence,
  deleteElementEntry,
  terminateWorker,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';

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
    this.creds = { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };
  }

  async prepare(tc: UATTestCase): Promise<PreFlightResult> {
    const module = (tc.module || '').toLowerCase();
    try {
      if (module.includes('core hr')) return await this.prepareCoreHR(tc);
      if (module.includes('absence')) return await this.prepareAbsence(tc);
      if (module.includes('payroll')) return await this.preparePayroll(tc);
      if (module.includes('oneapp')) return await this.prepareOneApp(tc);
      // Benefits, Time & Labor, Journeys, Compensation, MPDX, SAA, Other — generally safe
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
   * Hire/Add Pending/Add Non-Worker: always re-runnable.
   * Each run creates a new person with an auto-generated PersonNumber,
   * so there's no consumed state to reset.
   */
  private async prepareHire(_tc: UATTestCase, _personNumber: string): Promise<PreFlightResult> {
    return OK;
  }

  /** Create Work Relationship: always re-runnable (creates a new WR each time). */
  private async prepareCreateWorkRelationship(_tc: UATTestCase, _personNumber: string): Promise<PreFlightResult> {
    return OK;
  }

  // ── Absence ──────────────────────────────────────────────────────────

  private async prepareAbsence(tc: UATTestCase): Promise<PreFlightResult> {
    const bp = (tc.businessProcess || '').toLowerCase();
    // Only check for absence entry/submission tests — approval tests are generally safe
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

  // ── OneApp ──────────────────────────────────────────────────────────

  /** OneApp: always let tests attempt. */
  private async prepareOneApp(_tc: UATTestCase): Promise<PreFlightResult> {
    return OK;
  }
}
