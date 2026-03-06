/**
 * Shared REST API helpers for Oracle HCM.
 *
 * Uses Basic Auth via Node.js https (NOT Playwright page.request).
 * Credentials come from ORACLE_API_USERNAME + ORACLE_API_PASSWORD env vars.
 *
 * All major endpoints confirmed accessible (200 OK):
 *   - workers, absences, elementEntries, benefitEnrollments,
 *     salaries, timeRecordGroups, journeys, allocatedChecklists,
 *     businessProcessApprovalUsers, rolesLOV, userAccounts,
 *     locations, departments, jobs, grades, publicWorkers
 */
import * as https from 'https';
import type { Page } from 'playwright';

// ── Types ────────────────────────────────────────────────────────────

export interface WorkerRecord {
  PersonId: number;
  PersonNumber: string;
  DisplayName: string;
  [key: string]: unknown;
}

export interface RoleLOVRecord {
  RoleId: number;
  RoleCode: string;
  RoleName: string;
  [key: string]: unknown;
}

export interface WorkerFullRecord extends WorkerRecord {
  emails: EmailRecord[];
  workRelationships: WorkRelationshipRecord[];
  names: NameRecord[];
  phones: PhoneRecord[];
  addresses: AddressRecord[];
  legislativeInfo: LegislativeInfoRecord[];
  [key: string]: unknown;
}

export interface EmailRecord {
  EmailAddressId: number;
  EmailType: string;
  EmailAddress: string;
  FromDate: string;
  ToDate: string;
  [key: string]: unknown;
}

export interface WorkRelationshipRecord {
  PeriodOfServiceId: number;
  LegislationCode: string;
  LegalEntityId: number;
  LegalEmployerName: string;
  WorkerType: string;
  PrimaryFlag: boolean;
  StartDate: string;
  TerminationDate: string | null;
  [key: string]: unknown;
}

export interface NameRecord {
  PersonNameId: number;
  LastName: string;
  FirstName: string;
  DisplayName: string;
  FullName: string;
  [key: string]: unknown;
}

export interface PhoneRecord { [key: string]: unknown; }
export interface AddressRecord { [key: string]: unknown; }
export interface LegislativeInfoRecord { [key: string]: unknown; }

export interface AbsenceRecord {
  absenceCaseId: number;
  absenceStatusCd: string;
  approvalStatusCd: string;
  startDate: string;
  endDate: string;
  personId: number;
  absenceTypeId: number;
  [key: string]: unknown;
}

export interface ElementEntryRecord {
  ElementEntryId: number;
  EffectiveStartDate: string;
  EffectiveEndDate: string;
  ElementTypeId: number;
  PersonId: number;
  CreatorType: string;
  EntryType: string;
  [key: string]: unknown;
}

export interface BenefitEnrollmentRecord {
  EnrollmentResultId: number;
  PersonId: number;
  ProgramId: number;
  PlanTypeId: number;
  PlanId: number;
  OptionId: number;
  PersonName: string;
  EnrollmentCoverageStartDate: string;
  EnrollmentCoverageEndDate: string;
  [key: string]: unknown;
}

export interface SalaryRecord {
  SalaryId: number;
  AssignmentId: number;
  SalaryBasisId: number;
  SalaryAmount: number;
  CurrencyCode: string;
  DateFrom: string;
  DateTo: string;
  [key: string]: unknown;
}

export interface TimeRecordGroupRecord {
  timeRecordGroupId: number;
  startTime: string;
  stopTime: string;
  groupType: string;
  personNumber: string;
  personId: number;
  [key: string]: unknown;
}

export interface TimeCardRecord {
  TimeCardId: number;
  TimeCardVersion: number;
  Status: string;
  PersonId: number;
  StartDate: string;
  StopDate: string;
  ReportedHours: number;
  [key: string]: unknown;
}

export interface JourneyRecord {
  JourneyId: number;
  Name: string;
  Category: string;
  [key: string]: unknown;
}

export interface AllocatedChecklistRecord {
  AllocatedChecklistId: number;
  ChecklistName: string;
  ChecklistStatus: string;
  AllocationDate: string;
  CompletionDate: string;
  [key: string]: unknown;
}

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

// ── Default Credentials ──────────────────────────────────────────────

/**
 * Default REST API credentials from environment variables.
 * Set ORACLE_API_USERNAME + ORACLE_API_PASSWORD in .env.
 */
let _defaultCreds: BasicAuthCredentials | null = null;
function getDefaultRestCreds(): BasicAuthCredentials {
  if (_defaultCreds) return _defaultCreds;
  const username = process.env.ORACLE_API_USERNAME;
  const password = process.env.ORACLE_API_PASSWORD;
  if (!username || !password) {
    throw new Error('REST API credentials not configured. Set ORACLE_API_USERNAME and ORACLE_API_PASSWORD in .env');
  }
  _defaultCreds = { username, password };
  return _defaultCreds;
}

// ── Core REST Helpers ────────────────────────────────────────────────

/**
 * Generic HTTP request using Basic Auth via Node.js https module.
 * Works standalone — does NOT require a Playwright page or browser session.
 */
function hcmRequest(
  method: string,
  baseUrl: string,
  endpoint: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
  body?: any,
): Promise<{ statusCode: number; data: any; raw: string }> {
  const url = `${baseUrl}${endpoint}`;
  const basicAuth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  const bodyStr = body != null ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    };
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    // Hard deadline: 20s total regardless of data streaming
    const deadline = setTimeout(() => { req.destroy(); reject(new Error(`${method} ${endpoint} → timeout`)); }, 20000);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers,
    }, (res) => {
      let rawBody = '';
      res.on('data', (chunk) => rawBody += chunk);
      res.on('end', () => {
        clearTimeout(deadline);
        const code = res.statusCode || 0;
        let parsed: any;
        try { parsed = JSON.parse(rawBody); } catch { parsed = null; }

        if (code >= 400) {
          const err = new Error(`${method} ${endpoint} → ${code} ${res.statusMessage}: ${rawBody.slice(0, 300)}`);
          (err as any).statusCode = code;
          (err as any).responseBody = rawBody;
          reject(err);
          return;
        }
        resolve({ statusCode: code, data: parsed, raw: rawBody });
      });
    });
    req.on('error', (err) => { clearTimeout(deadline); reject(err); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * GET request using Basic Auth via Node.js https module.
 * The `page` parameter is kept for backward compatibility but ignored.
 */
export async function hcmGet(
  page: Page | null,
  baseUrl: string,
  endpoint: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<any> {
  const result = await hcmRequest('GET', baseUrl, endpoint, creds);
  return result.data;
}

/**
 * POST request using Basic Auth via Node.js https module.
 * Used for action endpoints (e.g., reverseTermination).
 */
export async function hcmPost(
  baseUrl: string,
  endpoint: string,
  body: any,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<{ statusCode: number; data: any }> {
  return hcmRequest('POST', baseUrl, endpoint, creds, body);
}

/**
 * PATCH request using Basic Auth via Node.js https module.
 * Used for updating records (e.g., withdrawing absences).
 */
export async function hcmPatch(
  baseUrl: string,
  endpoint: string,
  body: any,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<{ statusCode: number; data: any }> {
  return hcmRequest('PATCH', baseUrl, endpoint, creds, body);
}

/**
 * DELETE request using Basic Auth via Node.js https module.
 * Used for removing records (e.g., deleting element entries).
 */
export async function hcmDelete(
  baseUrl: string,
  endpoint: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<{ statusCode: number; data: any }> {
  return hcmRequest('DELETE', baseUrl, endpoint, creds);
}

// ── SCIM User Account Operations ─────────────────────────────────────

/**
 * Look up a SCIM user by username (e.g., "uat.bot_hr_admin").
 * Returns the SCIM user id (GUID) or null if not found.
 */
export async function scimLookupUser(
  baseUrl: string,
  username: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<{ id: string; active: boolean; userName: string } | null> {
  const endpoint = `/hcmRestApi/scim/Users?filter=userName eq "${username}"`;
  const result = await hcmRequest('GET', baseUrl, endpoint, creds);
  const resources = result.data?.Resources || result.data?.resources || [];
  if (resources.length === 0) return null;
  const user = resources[0];
  return { id: user.id, active: user.active, userName: user.userName };
}

/**
 * Unlock a user account via SCIM PATCH (set active=true).
 * Much faster than UI-based unlock (~2s vs ~5min).
 * Returns true if successful, false on failure.
 */
export async function scimUnlockUser(
  baseUrl: string,
  scimUserId: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<boolean> {
  const endpoint = `/hcmRestApi/scim/Users/${scimUserId}`;
  try {
    await hcmRequest('PATCH', baseUrl, endpoint, creds, {
      schemas: ['urn:scim:schemas:core:2.0:User'],
      active: true,
    });
    return true;
  } catch (err: any) {
    console.warn(`[SCIM] Failed to unlock user ${scimUserId}: ${err.message?.slice(0, 200)}`);
    return false;
  }
}

/**
 * Reset a SCIM user's password by their SCIM user ID.
 * Returns true if successful, false on failure.
 */
export async function scimResetPassword(
  baseUrl: string,
  scimUserId: string,
  newPassword: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<boolean> {
  const endpoint = `/hcmRestApi/scim/Users/${scimUserId}`;
  try {
    await hcmRequest('PATCH', baseUrl, endpoint, creds, {
      schemas: ['urn:scim:schemas:core:2.0:User'],
      password: newPassword,
    });
    return true;
  } catch (err: any) {
    return false;
  }
}

/**
 * Unlock a bot account by username (e.g., "uat.bot_hr_admin").
 * Combines lookup + unlock in one call. Returns true if successful.
 */
export async function unlockBotAccount(
  baseUrl: string,
  username: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<boolean> {
  const user = await scimLookupUser(baseUrl, username, creds);
  if (!user) {
    console.warn(`[SCIM] User not found: ${username}`);
    return false;
  }
  if (user.active) {
    console.log(`[SCIM] User ${username} is already active — no unlock needed`);
    return true;
  }
  console.log(`[SCIM] Unlocking user ${username} (id: ${user.id})...`);
  return scimUnlockUser(baseUrl, user.id, creds);
}

// ── Domain-Specific Operations ───────────────────────────────────────

/**
 * Look up a worker's PersonId by PersonNumber.
 * Returns the full worker record or null if not found.
 */
export async function lookupPersonId(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<WorkerRecord | null> {
  const endpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&fields=PersonId,PersonNumber,DisplayName&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as WorkerRecord;
}

/**
 * Search for a worker by display name (partial match).
 * Returns the first matching worker record or null if not found.
 */
export async function lookupWorkerByName(
  page: Page | null,
  baseUrl: string,
  displayName: string,
  creds?: BasicAuthCredentials,
): Promise<WorkerRecord | null> {
  const encoded = encodeURIComponent(displayName);
  const endpoint = `/hcmRestApi/resources/latest/workers?q=DisplayName LIKE '*${encoded}*'&fields=PersonId,PersonNumber,DisplayName&onlyData=true&limit=5`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as WorkerRecord;
}

/**
 * Look up a role by RoleCode from the roles LOV.
 * Returns the role record or null if not found.
 */
export async function lookupRole(
  page: Page | null,
  baseUrl: string,
  roleCode: string,
  creds?: BasicAuthCredentials,
): Promise<RoleLOVRecord | null> {
  const endpoint = `/hcmRestApi/resources/latest/rolesLOV?q=RoleCode='${roleCode}'&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as RoleLOVRecord;
}

/**
 * Search for roles matching a partial name or code.
 * Returns an array of matching role records.
 */
export async function searchRoles(
  page: Page | null,
  baseUrl: string,
  searchTerm: string,
  limit = 25,
  creds?: BasicAuthCredentials,
): Promise<RoleLOVRecord[]> {
  // Try RoleName LIKE search first
  const encoded = encodeURIComponent(searchTerm);
  const endpoint = `/hcmRestApi/resources/latest/rolesLOV?q=RoleName LIKE '*${encoded}*'&limit=${limit}&onlyData=true`;
  try {
    const data = await hcmGet(page, baseUrl, endpoint, creds);
    return (data?.items || []) as RoleLOVRecord[];
  } catch {
    // Fallback: try RoleCode LIKE search
    const endpoint2 = `/hcmRestApi/resources/latest/rolesLOV?q=RoleCode LIKE '*${encoded}*'&limit=${limit}&onlyData=true`;
    try {
      const data2 = await hcmGet(page, baseUrl, endpoint2, creds);
      return (data2?.items || []) as RoleLOVRecord[];
    } catch {
      return [];
    }
  }
}

// ── Worker Detail Operations ──────────────────────────────────────────

/**
 * Get full worker record with all nested resources (emails, work relationships, names, etc.).
 * Uses expand=all to fetch everything in a single request.
 */
export async function getWorkerFull(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<WorkerFullRecord | null> {
  const endpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&expand=all&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as WorkerFullRecord;
}

/**
 * Get a worker's email addresses.
 * Convenience wrapper around getWorkerFull.
 */
export async function getWorkerEmails(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<EmailRecord[]> {
  const worker = await getWorkerFull(page, baseUrl, personNumber, creds);
  return worker?.emails || [];
}

/**
 * Get a worker's work relationships (employment history, legal employer, etc.).
 * Convenience wrapper around getWorkerFull.
 */
export async function getWorkerWorkRelationships(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<WorkRelationshipRecord[]> {
  const worker = await getWorkerFull(page, baseUrl, personNumber, creds);
  return worker?.workRelationships || [];
}

// ── Absence Operations ────────────────────────────────────────────────

/**
 * Look up absence records for a person by PersonId.
 */
export async function lookupAbsences(
  page: Page | null,
  baseUrl: string,
  personId: number,
  creds?: BasicAuthCredentials,
): Promise<AbsenceRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/absences?q=personId=${personId}&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  return (data?.items || []) as AbsenceRecord[];
}

/**
 * Look up absence records for a person by PersonNumber.
 * Convenience wrapper: resolves PersonId first, then queries absences.
 */
export async function lookupAbsencesByNumber(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<AbsenceRecord[]> {
  const worker = await lookupPersonId(page, baseUrl, personNumber, creds);
  if (!worker) return [];
  return lookupAbsences(page, baseUrl, worker.PersonId, creds);
}

// ── Element Entry Operations ──────────────────────────────────────────

/**
 * Look up element entries for a person by PersonId.
 */
export async function lookupElementEntries(
  page: Page | null,
  baseUrl: string,
  personId: number,
  creds?: BasicAuthCredentials,
): Promise<ElementEntryRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/elementEntries?q=PersonId=${personId}&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  return (data?.items || []) as ElementEntryRecord[];
}

/**
 * Look up element entries for a person by PersonNumber.
 * Convenience wrapper: resolves PersonId first, then queries element entries.
 */
export async function lookupElementEntriesByNumber(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<ElementEntryRecord[]> {
  const worker = await lookupPersonId(page, baseUrl, personNumber, creds);
  if (!worker) return [];
  return lookupElementEntries(page, baseUrl, worker.PersonId, creds);
}

// ── Benefit Enrollment Operations ────────────────────────────────────

/**
 * Look up benefit enrollments for a person by PersonId.
 */
export async function lookupBenefitEnrollments(
  page: Page | null,
  baseUrl: string,
  personId: number,
  creds?: BasicAuthCredentials,
): Promise<BenefitEnrollmentRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/benefitEnrollments?q=PersonId=${personId}&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  return (data?.items || []) as BenefitEnrollmentRecord[];
}

/**
 * Look up benefit enrollments for a person by PersonNumber.
 */
export async function lookupBenefitEnrollmentsByNumber(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<BenefitEnrollmentRecord[]> {
  const worker = await lookupPersonId(page, baseUrl, personNumber, creds);
  if (!worker) return [];
  return lookupBenefitEnrollments(page, baseUrl, worker.PersonId, creds);
}

// ── Salary / Compensation Operations ─────────────────────────────────

/**
 * Look up salary records for a person by AssignmentId.
 */
export async function lookupSalaries(
  page: Page | null,
  baseUrl: string,
  assignmentId: number,
  creds?: BasicAuthCredentials,
): Promise<SalaryRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/salaries?q=AssignmentId=${assignmentId}&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  return (data?.items || []) as SalaryRecord[];
}

/**
 * Look up salary records for a person by PersonNumber.
 * Resolves PersonId → worker expand=all → first assignment → salaries.
 */
export async function lookupSalariesByNumber(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<SalaryRecord[]> {
  const worker = await getWorkerFull(page, baseUrl, personNumber, creds);
  if (!worker) return [];
  // Get AssignmentId from work relationships → assignments
  const workRels = worker.workRelationships || [];
  for (const wr of workRels) {
    const assignments = (wr as any).assignments || [];
    if (assignments.length > 0) {
      const assignmentId = assignments[0].AssignmentId;
      if (assignmentId) return lookupSalaries(page, baseUrl, assignmentId, creds);
    }
  }
  return [];
}

// ── Time & Labor Operations ──────────────────────────────────────────

/**
 * Look up time record groups for a person by PersonNumber and date range.
 */
export async function lookupTimeRecords(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  startDate?: string,
  stopDate?: string,
  creds?: BasicAuthCredentials,
): Promise<TimeRecordGroupRecord[]> {
  const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString();
  const stop = stopDate || new Date().toISOString();
  const endpoint = `/hcmRestApi/resources/latest/timeRecordGroups?finder=filterByPerNumTimeGrp;personNumber=${personNumber},startTime=${start},stopTime=${stop},groupType=ProcessedTimecard&onlyData=true`;
  try {
    const data = await hcmGet(page, baseUrl, endpoint, creds);
    const items = (data?.items || []) as TimeRecordGroupRecord[];
    if (items.length > 0) return items;
  } catch {
    // Primary query failed — fall through to broader query
  }

  // Broader fallback: any groupType, wider date range (1 year back + 1 year ahead)
  const wideStart = new Date(Date.now() - 365 * 86400000).toISOString();
  const wideStop = new Date(Date.now() + 365 * 86400000).toISOString();
  const fallback = `/hcmRestApi/resources/latest/timeRecordGroups?finder=filterByPerNumTimeGrp;personNumber=${personNumber},startTime=${wideStart},stopTime=${wideStop}&onlyData=true&limit=20`;
  try {
    const data2 = await hcmGet(page, baseUrl, fallback, creds);
    return (data2?.items || []) as TimeRecordGroupRecord[];
  } catch {
    return [];
  }
}

/**
 * Look up time cards for a person by PersonId using the timeCards REST resource.
 * Returns all time cards matching the PersonId (optionally filtered by date range).
 */
export async function lookupTimeCards(
  baseUrl: string,
  personId: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<TimeCardRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/timeCards?q=PersonId=${personId}&onlyData=true&limit=100`;
  try {
    const data = await hcmGet(null, baseUrl, endpoint, creds);
    return (data?.items || []) as TimeCardRecord[];
  } catch {
    return [];
  }
}

/**
 * Look up time cards for a person by PersonNumber.
 * Convenience wrapper: resolves PersonId first, then queries timeCards.
 */
export async function lookupTimeCardsByNumber(
  baseUrl: string,
  personNumber: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<TimeCardRecord[]> {
  const worker = await lookupPersonId(null, baseUrl, personNumber, creds);
  if (!worker) return [];
  return lookupTimeCards(baseUrl, worker.PersonId, creds);
}

/**
 * Delete a time card via the timeCards deleteAction.
 * Uses the Oracle HCM action endpoint: POST /timeCards/action/deleteAction
 * with Content-Type: application/vnd.oracle.adf.action+json.
 * Requires TimeCardId and TimeCardVersion.
 */
export async function deleteTimeCard(
  baseUrl: string,
  timeCardId: number,
  timeCardVersion: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/timeCards/action/deleteAction`;
  await hcmPost(baseUrl, endpoint, {
    timeCards: [{ TimeCardId: timeCardId, TimeCardVersion: timeCardVersion }],
  }, creds);
}

// ── Journey / Checklist Operations ───────────────────────────────────

/**
 * Look up allocated checklists (journey instances) for a person by PersonId.
 */
export async function lookupAllocatedChecklists(
  page: Page | null,
  baseUrl: string,
  personId: number,
  creds?: BasicAuthCredentials,
): Promise<AllocatedChecklistRecord[]> {
  const endpoint = `/hcmRestApi/resources/latest/allocatedChecklists?q=PersonId=${personId}&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  return (data?.items || []) as AllocatedChecklistRecord[];
}

/**
 * Look up allocated checklists for a person by PersonNumber.
 */
export async function lookupAllocatedChecklistsByNumber(
  page: Page | null,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<AllocatedChecklistRecord[]> {
  const worker = await lookupPersonId(page, baseUrl, personNumber, creds);
  if (!worker) return [];
  return lookupAllocatedChecklists(page, baseUrl, worker.PersonId, creds);
}

// ── Write Operations (Pre-Flight State Resets) ──────────────────────

/**
 * Reverse a termination — restores a terminated worker to active status.
 * Uses the Oracle HCM "reverseTermination" action on a work relationship.
 * Throws on failure (403, 404, etc.) — callers should catch and handle.
 */
export async function reverseTermination(
  baseUrl: string,
  personId: number,
  workRelationshipId: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/workers/${personId}/child/workRelationships/${workRelationshipId}/action/reverseTermination`;
  await hcmPost(baseUrl, endpoint, {}, creds);
}

/**
 * Withdraw/cancel an absence record.
 * Uses PATCH to update the absence status to WITHDRAWN.
 */
export async function withdrawAbsence(
  baseUrl: string,
  absenceId: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/absences/${absenceId}`;
  await hcmPatch(baseUrl, endpoint, { absenceStatusCd: 'WITHDRAWN' }, creds);
}

/**
 * Delete an element entry record.
 */
export async function deleteElementEntry(
  baseUrl: string,
  elementEntryId: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/elementEntries/${elementEntryId}`;
  await hcmDelete(baseUrl, endpoint, creds);
}

/**
 * Delete a benefit enrollment record.
 * Uses DELETE on the benefitEnrollments endpoint.
 * NOTE: Oracle HCM may not support DELETE on benefitEnrollments — if so, the
 * caller should catch the error and proceed gracefully.
 */
export async function deleteBenefitEnrollment(
  baseUrl: string,
  enrollmentResultId: number,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/benefitEnrollments/${enrollmentResultId}`;
  await hcmDelete(baseUrl, endpoint, creds);
}

/**
 * Terminate a worker via REST API.
 * Used by pre-flight to re-terminate an already-rehired person so the rehire test can run again.
 * Requires ActionCode, TerminationDate, and optionally NotificationDate.
 */
export async function terminateWorker(
  baseUrl: string,
  personId: number,
  workRelationshipId: number,
  terminationDate: string,
  creds: BasicAuthCredentials = getDefaultRestCreds(),
): Promise<void> {
  const endpoint = `/hcmRestApi/resources/latest/workers/${personId}/child/workRelationships/${workRelationshipId}/action/terminateWorkRelationship`;
  await hcmPost(baseUrl, endpoint, {
    ActionCode: 'TERMINATE_EMPLOYMENT',
    TerminationDate: terminationDate,
    NotificationDate: terminationDate,
  }, creds);
}
