/**
 * RestApiValidator — standalone REST API validation for Oracle HCM test outcomes.
 *
 * Pure REST API calls via Node.js https (no Playwright Page dependency).
 * Each method returns a structured ValidationResult instead of throwing,
 * letting the caller decide how to handle failures.
 *
 * Caches worker lookups (PersonNumber -> worker record) to avoid repeated API calls
 * within a single test run.
 *
 * Uses josh.starcher@cru.org credentials (OWSM requires email-format username;
 * bot users uat.bot_* do NOT work for REST API Basic Auth).
 */
import {
  hcmGet,
  lookupPersonId,
  getWorkerFull,
  lookupWorkerByName,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  lookupBenefitEnrollmentsByNumber,
  lookupSalariesByNumber,
  lookupTimeRecords,
  lookupAllocatedChecklistsByNumber,
  type BasicAuthCredentials,
  type WorkerFullRecord,
  type WorkRelationshipRecord,
  type AbsenceRecord,
  type ElementEntryRecord,
  type BenefitEnrollmentRecord,
  type SalaryRecord,
  type TimeRecordGroupRecord,
  type AllocatedChecklistRecord,
} from '../../scripts/lib/hcm-rest-api';

// ── Types ────────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  check: string;
  message: string;
  details?: Record<string, unknown>;
}

function pass(check: string, message: string, details?: Record<string, unknown>): ValidationResult {
  return { passed: true, check, message, details };
}

function fail(check: string, message: string, details?: Record<string, unknown>): ValidationResult {
  return { passed: false, check, message, details };
}

function error(check: string, err: unknown): ValidationResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { passed: false, check, message: `API error: ${msg}`, details: { error: msg } };
}

// ── Person Extra Info context name ───────────────────────────────────

const STAFF_DESIGNATION_CONTEXT =
  'PersonExtraInformationContextStaff__Account__and__DesignationprivateVO';

// ── RestApiValidator ─────────────────────────────────────────────────

export class RestApiValidator {
  private baseUrl: string;
  private creds: BasicAuthCredentials;
  /** Cache: PersonNumber -> full worker record (or null if not found). */
  private workerCache = new Map<string, WorkerFullRecord | null>();

  constructor(
    baseUrl?: string,
    creds?: BasicAuthCredentials,
  ) {
    this.baseUrl = baseUrl || process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    this.creds = creds || { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };
  }

  /** Clear the worker cache (useful between test runs). */
  clearCache(): void {
    this.workerCache.clear();
  }

  // ── Internal helpers ───────────────────────────────────────────────

  /**
   * Resolve a PersonNumber to a full worker record. Uses cache.
   * Returns null if the worker does not exist.
   *
   * Uses `expand=workRelationships.assignments,names,workersEFF` instead of
   * `expand=all` because `expand=all` omits assignments and DisplayName.
   * DisplayName is fetched from a basic fields query and merged in.
   */
  private async resolveWorker(personNumber: string): Promise<WorkerFullRecord | null> {
    if (this.workerCache.has(personNumber)) {
      return this.workerCache.get(personNumber)!;
    }

    // Basic query for DisplayName (not included in expand responses)
    const basicEndpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&fields=PersonId,PersonNumber,DisplayName&onlyData=true`;
    const basicData = await hcmGet(null, this.baseUrl, basicEndpoint, this.creds);
    const basicItem = basicData?.items?.[0];
    if (!basicItem) {
      this.workerCache.set(personNumber, null);
      return null;
    }

    // Expanded query for nested resources (assignments, names, EFF)
    const expandEndpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&expand=workRelationships.assignments,names,emails,workersEFF&onlyData=true`;
    const expandData = await hcmGet(null, this.baseUrl, expandEndpoint, this.creds);
    const expandItem = expandData?.items?.[0];

    // Merge DisplayName from basic query into the expanded record
    const worker = (expandItem || basicItem) as WorkerFullRecord;
    worker.DisplayName = basicItem.DisplayName;

    this.workerCache.set(personNumber, worker);
    return worker;
  }

  /**
   * Resolve a worker's unique ID (from the self link) for nested REST calls.
   * Oracle HCM REST uses an opaque UID in nested resource URLs, not PersonId.
   */
  private async resolveWorkerUid(personNumber: string): Promise<string | null> {
    // Use the non-expand lookup which includes links
    const endpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&onlyData=false`;
    const data = await hcmGet(null, this.baseUrl, endpoint, this.creds);
    const item = data?.items?.[0];
    if (!item) return null;
    const selfLink = item.links?.find((l: any) => l.rel === 'self');
    if (!selfLink) return null;
    const match = selfLink.href.match(/\/workers\/([^/]+)/);
    return match ? match[1] : null;
  }

  /** Log a validation result to the console. */
  private log(testId: string | undefined, result: ValidationResult): void {
    const prefix = testId ? `[RestApiValidator] ${testId}` : '[RestApiValidator]';
    const icon = result.passed ? 'PASS' : 'FAIL';
    console.log(`${prefix}: ${icon} — ${result.check}: ${result.message}`);
  }

  // ── Core HR: Worker / Hire / Add Pending / Add Non-Worker ──────────

  /**
   * Verify that a worker exists in Oracle HCM by PersonNumber.
   */
  async verifyWorkerExists(personNumber: string, testId?: string): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('workerExists', `Worker ${personNumber} not found in Oracle HCM`);
        this.log(testId, result);
        return result;
      }
      const result = pass('workerExists', `Worker ${personNumber} exists (${worker.DisplayName})`, {
        PersonId: worker.PersonId,
        PersonNumber: worker.PersonNumber,
        DisplayName: worker.DisplayName,
      });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('workerExists', err);
      this.log(testId, result);
      return result;
    }
  }

  /**
   * Verify a worker's name matches expected first/last name.
   */
  async verifyWorkerName(
    personNumber: string,
    expectedFirstName: string,
    expectedLastName: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('workerName', `Worker ${personNumber} not found`);
        this.log(testId, result);
        return result;
      }

      const names = worker.names || [];
      if (names.length === 0) {
        const result = fail('workerName', `Worker ${personNumber} has no name records`);
        this.log(testId, result);
        return result;
      }

      const nameRec = names[0];
      const firstMatch = nameRec.FirstName?.toLowerCase() === expectedFirstName.toLowerCase();
      const lastMatch = nameRec.LastName?.toLowerCase() === expectedLastName.toLowerCase();

      if (firstMatch && lastMatch) {
        const result = pass('workerName', `Name matches: ${nameRec.FirstName} ${nameRec.LastName}`, {
          FirstName: nameRec.FirstName,
          LastName: nameRec.LastName,
          DisplayName: nameRec.DisplayName,
        });
        this.log(testId, result);
        return result;
      }

      const result = fail(
        'workerName',
        `Name mismatch for ${personNumber}: expected "${expectedFirstName} ${expectedLastName}", ` +
          `got "${nameRec.FirstName} ${nameRec.LastName}"`,
        { expected: { firstName: expectedFirstName, lastName: expectedLastName }, actual: { FirstName: nameRec.FirstName, LastName: nameRec.LastName } },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('workerName', err);
      this.log(testId, result);
      return result;
    }
  }

  /**
   * Verify assignment data for a worker.
   * expectedFields is a partial match — each key/value is checked against the first assignment.
   * Keys are case-insensitive and matched against assignment record fields.
   */
  async verifyAssignment(
    personNumber: string,
    expectedFields: Record<string, string | number | boolean>,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('assignment', `Worker ${personNumber} not found`);
        this.log(testId, result);
        return result;
      }

      const workRels = worker.workRelationships || [];
      if (workRels.length === 0) {
        const result = fail('assignment', `Worker ${personNumber} has no work relationships`);
        this.log(testId, result);
        return result;
      }

      // Find the first assignment across all work relationships
      let assignment: Record<string, unknown> | null = null;
      for (const wr of workRels) {
        const assignments = (wr as any).assignments || [];
        if (assignments.length > 0) {
          assignment = assignments[0];
          break;
        }
      }

      if (!assignment) {
        const result = fail('assignment', `Worker ${personNumber} has no assignments`);
        this.log(testId, result);
        return result;
      }

      // Check each expected field
      const mismatches: string[] = [];
      const matched: Record<string, unknown> = {};

      for (const [expectedKey, expectedVal] of Object.entries(expectedFields)) {
        // Case-insensitive key lookup
        const actualKey = Object.keys(assignment).find(
          k => k.toLowerCase() === expectedKey.toLowerCase(),
        );
        if (!actualKey) {
          mismatches.push(`${expectedKey}: field not found`);
          continue;
        }
        const actualVal = assignment[actualKey];
        if (String(actualVal).toLowerCase() !== String(expectedVal).toLowerCase()) {
          mismatches.push(`${expectedKey}: expected "${expectedVal}", got "${actualVal}"`);
        } else {
          matched[actualKey] = actualVal;
        }
      }

      if (mismatches.length > 0) {
        const result = fail('assignment', `Assignment field mismatches for ${personNumber}: ${mismatches.join('; ')}`, {
          mismatches,
          matched,
        });
        this.log(testId, result);
        return result;
      }

      const result = pass('assignment', `Assignment fields verified for ${personNumber}`, matched);
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('assignment', err);
      this.log(testId, result);
      return result;
    }
  }

  /**
   * Verify Person Extra Information (EIT) records.
   * Uses the workers -> workersEFF -> Context pattern.
   * contextName defaults to the Staff Account and Designation context.
   */
  async verifyPersonExtraInfo(
    personNumber: string,
    expectedFields: Record<string, string>,
    contextName: string = STAFF_DESIGNATION_CONTEXT,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const uid = await this.resolveWorkerUid(personNumber);
      if (!uid) {
        const result = fail('personExtraInfo', `Worker ${personNumber} not found (no UID)`);
        this.log(testId, result);
        return result;
      }

      // Get workersEFF
      const effEndpoint = `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF?onlyData=false`;
      const effData = await hcmGet(null, this.baseUrl, effEndpoint, this.creds);
      const eff = effData?.items?.[0];
      if (!eff) {
        const result = fail('personExtraInfo', `Worker ${personNumber} has no EFF record`);
        this.log(testId, result);
        return result;
      }

      const effSelfLink = eff.links?.find((l: any) => l.rel === 'self');
      const effId = effSelfLink?.href?.match(/\/workersEFF\/([^/]+)/)?.[1];
      if (!effId) {
        const result = fail('personExtraInfo', `Could not resolve EFF ID for ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      // Get context records
      const ctxEndpoint = `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF/${effId}/child/${contextName}?onlyData=true`;
      const ctxData = await hcmGet(null, this.baseUrl, ctxEndpoint, this.creds);
      const items = ctxData?.items || [];

      if (items.length === 0) {
        const result = fail('personExtraInfo', `Worker ${personNumber} has no ${contextName} records`);
        this.log(testId, result);
        return result;
      }

      // Check expected fields against the first context record
      const record = items[0] as Record<string, unknown>;
      const mismatches: string[] = [];
      const matched: Record<string, unknown> = {};

      for (const [expectedKey, expectedVal] of Object.entries(expectedFields)) {
        const actualKey = Object.keys(record).find(
          k => k.toLowerCase() === expectedKey.toLowerCase(),
        );
        if (!actualKey) {
          mismatches.push(`${expectedKey}: field not found`);
          continue;
        }
        const actualVal = record[actualKey];
        if (String(actualVal).toLowerCase() !== expectedVal.toLowerCase()) {
          mismatches.push(`${expectedKey}: expected "${expectedVal}", got "${actualVal}"`);
        } else {
          matched[actualKey] = actualVal;
        }
      }

      if (mismatches.length > 0) {
        const result = fail('personExtraInfo', `EIT field mismatches for ${personNumber}: ${mismatches.join('; ')}`, {
          mismatches,
          matched,
          contextName,
        });
        this.log(testId, result);
        return result;
      }

      const result = pass('personExtraInfo', `EIT fields verified for ${personNumber}`, { ...matched, contextName });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('personExtraInfo', err);
      this.log(testId, result);
      return result;
    }
  }

  /**
   * Verify Staff Designation (Person Extra Info) — convenience wrapper.
   */
  async verifyStaffDesignation(
    personNumber: string,
    designation: string,
    staffAccount: string,
    primary: string = 'Y',
    testId?: string,
  ): Promise<ValidationResult> {
    return this.verifyPersonExtraInfo(
      personNumber,
      {
        designationNumber: designation,
        staffAccountNumber: staffAccount,
        primaryPerson: primary,
      },
      STAFF_DESIGNATION_CONTEXT,
      testId,
    );
  }

  // ── Work Relationships ─────────────────────────────────────────────

  /**
   * Verify that a worker has at least one active (non-terminated) work relationship.
   */
  async verifyActiveWorkRelationship(personNumber: string, testId?: string): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('activeWorkRelationship', `Worker ${personNumber} not found`);
        this.log(testId, result);
        return result;
      }

      const workRels = worker.workRelationships || [];
      const activeRel = workRels.find(wr => wr.TerminationDate === null);

      if (!activeRel) {
        const result = fail(
          'activeWorkRelationship',
          `Worker ${personNumber} has no active work relationship (all ${workRels.length} terminated)`,
          { workRelationships: workRels.map(wr => ({ StartDate: wr.StartDate, TerminationDate: wr.TerminationDate })) },
        );
        this.log(testId, result);
        return result;
      }

      const result = pass('activeWorkRelationship', `Worker ${personNumber} has active work relationship`, {
        LegalEmployerName: activeRel.LegalEmployerName,
        StartDate: activeRel.StartDate,
        WorkerType: activeRel.WorkerType,
      });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('activeWorkRelationship', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Termination ────────────────────────────────────────────────────

  /**
   * Verify that a worker has been terminated (at least one work relationship
   * with a non-null TerminationDate).
   */
  async verifyTermination(personNumber: string, testId?: string): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('termination', `Worker ${personNumber} not found`);
        this.log(testId, result);
        return result;
      }

      const workRels = worker.workRelationships || [];
      const terminated = workRels.find(wr => wr.TerminationDate !== null);

      if (!terminated) {
        const result = fail(
          'termination',
          `Worker ${personNumber} has no terminated work relationships (${workRels.length} active)`,
          { workRelationships: workRels.map(wr => ({ StartDate: wr.StartDate, TerminationDate: wr.TerminationDate })) },
        );
        this.log(testId, result);
        return result;
      }

      const result = pass('termination', `Worker ${personNumber} terminated on ${terminated.TerminationDate}`, {
        TerminationDate: terminated.TerminationDate,
        LegalEmployerName: terminated.LegalEmployerName,
        PeriodOfServiceId: terminated.PeriodOfServiceId,
      });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('termination', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Rehire ─────────────────────────────────────────────────────────

  /**
   * Verify that a worker has been rehired: must have at least 2 work relationships,
   * with at least one terminated (the old one) and at least one active (the new one).
   */
  async verifyRehire(personNumber: string, testId?: string): Promise<ValidationResult> {
    try {
      const worker = await this.resolveWorker(personNumber);
      if (!worker) {
        const result = fail('rehire', `Worker ${personNumber} not found`);
        this.log(testId, result);
        return result;
      }

      const workRels = worker.workRelationships || [];
      if (workRels.length < 2) {
        const result = fail(
          'rehire',
          `Worker ${personNumber} has only ${workRels.length} work relationship(s) — expected at least 2 for rehire`,
          { workRelationships: workRels.map(wr => ({ StartDate: wr.StartDate, TerminationDate: wr.TerminationDate })) },
        );
        this.log(testId, result);
        return result;
      }

      const terminated = workRels.filter(wr => wr.TerminationDate !== null);
      const active = workRels.filter(wr => wr.TerminationDate === null);

      if (terminated.length === 0 || active.length === 0) {
        const result = fail(
          'rehire',
          `Worker ${personNumber} has ${terminated.length} terminated and ${active.length} active work relationships — ` +
            `rehire requires at least 1 of each`,
          { terminated: terminated.length, active: active.length },
        );
        this.log(testId, result);
        return result;
      }

      const latestActive = active.sort((a, b) => (b.StartDate || '').localeCompare(a.StartDate || ''))[0];
      const result = pass('rehire', `Worker ${personNumber} rehired: ${workRels.length} work relationships (${active.length} active)`, {
        totalWorkRelationships: workRels.length,
        latestActiveStartDate: latestActive.StartDate,
        LegalEmployerName: latestActive.LegalEmployerName,
      });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('rehire', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Payroll: Element Entries ────────────────────────────────────────

  /**
   * Verify that a person has at least one element entry, optionally matching
   * a specific element name (partial, case-insensitive).
   */
  async verifyElementEntry(
    personNumber: string,
    elementName?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const entries = await lookupElementEntriesByNumber(null, this.baseUrl, personNumber, this.creds);

      if (entries.length === 0) {
        const result = fail(
          'elementEntry',
          `No element entries found for person ${personNumber}`,
        );
        this.log(testId, result);
        return result;
      }

      if (elementName) {
        const matching = entries.filter(e =>
          String((e as any).ElementName || '').toLowerCase().includes(elementName.toLowerCase()),
        );
        if (matching.length === 0) {
          const result = fail(
            'elementEntry',
            `Element "${elementName}" not found for person ${personNumber} (${entries.length} entries exist)`,
            { totalEntries: entries.length },
          );
          this.log(testId, result);
          return result;
        }
        const result = pass(
          'elementEntry',
          `Element "${elementName}" found for person ${personNumber} (${matching.length} matching entries)`,
          { matchingEntries: matching.length, totalEntries: entries.length },
        );
        this.log(testId, result);
        return result;
      }

      const result = pass(
        'elementEntry',
        `${entries.length} element entry(ies) found for person ${personNumber}`,
        { totalEntries: entries.length },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('elementEntry', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Absence ────────────────────────────────────────────────────────

  /**
   * Verify that a person has an absence record, optionally matching a start date
   * and/or absence type.
   */
  async verifyAbsence(
    personNumber: string,
    startDate?: string,
    absenceType?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const absences = await lookupAbsencesByNumber(null, this.baseUrl, personNumber, this.creds);

      if (absences.length === 0) {
        const result = fail('absence', `No absence records found for person ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      let filtered = absences;

      if (startDate) {
        filtered = filtered.filter(a =>
          a.startDate?.includes(startDate) || startDate.includes(a.startDate || ''),
        );
        if (filtered.length === 0) {
          const result = fail(
            'absence',
            `No absence with start date "${startDate}" for person ${personNumber} (${absences.length} absences exist)`,
            { totalAbsences: absences.length, dates: absences.map(a => a.startDate) },
          );
          this.log(testId, result);
          return result;
        }
      }

      // Note: absenceType matching would require looking up the absence type name
      // from absenceTypeId. For now we just report what we found.

      const latest = filtered[filtered.length - 1];
      const result = pass(
        'absence',
        `Absence found for person ${personNumber}: ${latest.startDate} to ${latest.endDate}, status: ${latest.absenceStatusCd}`,
        {
          totalAbsences: absences.length,
          matchingAbsences: filtered.length,
          latestStatus: latest.absenceStatusCd,
          latestApproval: latest.approvalStatusCd,
          latestStartDate: latest.startDate,
          latestEndDate: latest.endDate,
        },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('absence', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Benefits ───────────────────────────────────────────────────────

  /**
   * Verify that a person has at least one benefit enrollment, optionally
   * matching a plan name (partial, case-insensitive via PersonName or other fields).
   */
  async verifyBenefitEnrollment(
    personNumber: string,
    planName?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const enrollments = await lookupBenefitEnrollmentsByNumber(null, this.baseUrl, personNumber, this.creds);

      if (enrollments.length === 0) {
        const result = fail('benefitEnrollment', `No benefit enrollments found for person ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      if (planName) {
        // The benefitEnrollments endpoint may include PlanName or similar fields
        const matching = enrollments.filter(e => {
          const allValues = Object.values(e).map(v => String(v).toLowerCase());
          return allValues.some(v => v.includes(planName.toLowerCase()));
        });
        if (matching.length === 0) {
          const result = fail(
            'benefitEnrollment',
            `Plan "${planName}" not found in ${enrollments.length} enrollment(s) for person ${personNumber}`,
            { totalEnrollments: enrollments.length },
          );
          this.log(testId, result);
          return result;
        }
        const result = pass(
          'benefitEnrollment',
          `Plan "${planName}" found for person ${personNumber} (${matching.length} matching enrollment(s))`,
          { matchingEnrollments: matching.length, totalEnrollments: enrollments.length },
        );
        this.log(testId, result);
        return result;
      }

      const first = enrollments[0];
      const result = pass(
        'benefitEnrollment',
        `${enrollments.length} benefit enrollment(s) found for person ${personNumber}`,
        {
          totalEnrollments: enrollments.length,
          firstCoverageStart: first.EnrollmentCoverageStartDate,
          firstCoverageEnd: first.EnrollmentCoverageEndDate,
        },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('benefitEnrollment', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Time & Labor ───────────────────────────────────────────────────

  /**
   * Verify that a person has time records, optionally within a date range.
   */
  async verifyTimeRecord(
    personNumber: string,
    startDate?: string,
    stopDate?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const records = await lookupTimeRecords(null, this.baseUrl, personNumber, startDate, stopDate, this.creds);

      if (records.length === 0) {
        const result = fail('timeRecord', `No time records found for person ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      const latest = records[records.length - 1];
      const result = pass(
        'timeRecord',
        `${records.length} time record group(s) found for person ${personNumber}`,
        {
          totalRecords: records.length,
          latestStart: latest.startTime,
          latestStop: latest.stopTime,
          latestGroupType: latest.groupType,
        },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('timeRecord', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Journeys / Checklists ──────────────────────────────────────────

  /**
   * Verify that a person has at least one allocated checklist (journey instance).
   */
  async verifyJourneyChecklist(
    personNumber: string,
    checklistName?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const checklists = await lookupAllocatedChecklistsByNumber(null, this.baseUrl, personNumber, this.creds);

      if (checklists.length === 0) {
        const result = fail('journeyChecklist', `No journey checklists found for person ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      if (checklistName) {
        const matching = checklists.filter(c =>
          (c.ChecklistName || '').toLowerCase().includes(checklistName.toLowerCase()),
        );
        if (matching.length === 0) {
          const names = checklists.map(c => c.ChecklistName).join(', ');
          const result = fail(
            'journeyChecklist',
            `Checklist "${checklistName}" not found for person ${personNumber} (found: ${names})`,
            { totalChecklists: checklists.length },
          );
          this.log(testId, result);
          return result;
        }
        const latest = matching[matching.length - 1];
        const result = pass(
          'journeyChecklist',
          `Checklist "${checklistName}" found for person ${personNumber} — status: ${latest.ChecklistStatus}`,
          { matchingChecklists: matching.length, latestStatus: latest.ChecklistStatus },
        );
        this.log(testId, result);
        return result;
      }

      const latest = checklists[checklists.length - 1];
      const result = pass(
        'journeyChecklist',
        `${checklists.length} journey checklist(s) for person ${personNumber} — latest: "${latest.ChecklistName}"`,
        { totalChecklists: checklists.length, latestName: latest.ChecklistName, latestStatus: latest.ChecklistStatus },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('journeyChecklist', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Salary / Compensation ──────────────────────────────────────────

  /**
   * Verify that a person has salary records.
   */
  async verifySalary(
    personNumber: string,
    expectedAmount?: number,
    expectedCurrency?: string,
    testId?: string,
  ): Promise<ValidationResult> {
    try {
      const salaries = await lookupSalariesByNumber(null, this.baseUrl, personNumber, this.creds);

      if (salaries.length === 0) {
        const result = fail('salary', `No salary records found for person ${personNumber}`);
        this.log(testId, result);
        return result;
      }

      const latest = salaries[salaries.length - 1];

      if (expectedAmount !== undefined && latest.SalaryAmount !== expectedAmount) {
        const result = fail(
          'salary',
          `Salary amount mismatch for ${personNumber}: expected ${expectedAmount}, got ${latest.SalaryAmount}`,
          { expected: expectedAmount, actual: latest.SalaryAmount, currency: latest.CurrencyCode },
        );
        this.log(testId, result);
        return result;
      }

      if (expectedCurrency && latest.CurrencyCode !== expectedCurrency) {
        const result = fail(
          'salary',
          `Salary currency mismatch for ${personNumber}: expected ${expectedCurrency}, got ${latest.CurrencyCode}`,
          { expected: expectedCurrency, actual: latest.CurrencyCode },
        );
        this.log(testId, result);
        return result;
      }

      const result = pass(
        'salary',
        `Salary found for person ${personNumber}: ${latest.CurrencyCode} ${latest.SalaryAmount}, from ${latest.DateFrom}`,
        {
          totalSalaries: salaries.length,
          latestAmount: latest.SalaryAmount,
          latestCurrency: latest.CurrencyCode,
          latestDateFrom: latest.DateFrom,
          latestDateTo: latest.DateTo,
        },
      );
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('salary', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Worker Lookup by Name ──────────────────────────────────────────

  /**
   * Find a worker by display name (partial match). Useful for hire tests
   * where the PersonNumber is not yet known.
   * Returns the PersonNumber if found, or null.
   */
  async findWorkerByName(displayName: string, testId?: string): Promise<ValidationResult> {
    try {
      const worker = await lookupWorkerByName(null, this.baseUrl, displayName, this.creds);
      if (!worker) {
        const result = fail('findWorkerByName', `No worker found matching "${displayName}"`);
        this.log(testId, result);
        return result;
      }

      // Cache the worker for subsequent lookups
      const fullWorker = await this.resolveWorker(worker.PersonNumber);

      const result = pass('findWorkerByName', `Worker found: ${worker.DisplayName} (${worker.PersonNumber})`, {
        PersonId: worker.PersonId,
        PersonNumber: worker.PersonNumber,
        DisplayName: worker.DisplayName,
      });
      this.log(testId, result);
      return result;
    } catch (err) {
      const result = error('findWorkerByName', err);
      this.log(testId, result);
      return result;
    }
  }

  // ── Batch Validation ───────────────────────────────────────────────

  /**
   * Run multiple validation checks and return all results.
   * Useful for comprehensive post-test validation.
   */
  async runAll(
    checks: Array<() => Promise<ValidationResult>>,
  ): Promise<{ results: ValidationResult[]; allPassed: boolean; summary: string }> {
    const results: ValidationResult[] = [];
    for (const check of checks) {
      results.push(await check());
    }
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const allPassed = failed === 0;
    const summary = `${passed}/${results.length} checks passed${failed > 0 ? ` (${failed} failed)` : ''}`;
    return { results, allPassed, summary };
  }
}

// ── Singleton / Factory ──────────────────────────────────────────────

let _instance: RestApiValidator | null = null;

/**
 * Get a shared RestApiValidator instance.
 * Uses default credentials and base URL from environment.
 */
export function getValidator(): RestApiValidator {
  if (!_instance) {
    _instance = new RestApiValidator();
  }
  return _instance;
}

/**
 * Create a new RestApiValidator with custom credentials.
 */
export function createValidator(
  baseUrl?: string,
  creds?: BasicAuthCredentials,
): RestApiValidator {
  return new RestApiValidator(baseUrl, creds);
}
