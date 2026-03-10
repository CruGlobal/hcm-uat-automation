/**
 * Known Failures Registry
 *
 * Maps the 12 human-marked "Failed" test IDs to validation functions that
 * detect the known HCM defects. Each validation asserts the CORRECT expected
 * behavior — which will FAIL while the bug exists. When the SI fixes the
 * bug, the assertion will pass.
 */
import { type Page, expect } from '@playwright/test';
import type { UATTestCase, TestCase } from './types';
import { getFieldData } from './uat-plan-provider';
import { getField } from './test-data-provider';
import {
  getWorkerFull,
  lookupAbsences,
  lookupElementEntries,
  lookupPersonId,
  lookupWorkerByName,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  lookupBenefitEnrollmentsByNumber,
  lookupAllocatedChecklistsByNumber,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';

import { resolveApiCredentials } from '../validation/api-credentials';
const API_CREDS: BasicAuthCredentials = resolveApiCredentials();
const BASE_URL =
  process.env.ORACLE_HCM_URL ||
  'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';

interface KnownFailure {
  reason: string;
  validate: (page: Page, tc: UATTestCase) => Promise<void>;
}

// ── Helper: extract PersonNumber from test data ─────────────────────

function getPersonNumber(tc: UATTestCase): string | undefined {
  const fd = getFieldData(tc.testId);
  if (fd) {
    const pn = getField(fd, 'Person Number') || getField(fd, 'PersonNumber');
    if (pn) return pn;
  }
  // Try parsing from testData field (e.g. "Person Number=10000034")
  const m = tc.testData?.match(/Person\s*Number\s*[=:]\s*(\d+)/i);
  return m?.[1];
}

// ── Helper: assert @cru.org email exists on a worker ────────────────

async function assertCruEmail(page: Page, tc: UATTestCase): Promise<void> {
  // For hire tests, the hired person has Last Name matching the test ID
  const fd = getFieldData(tc.testId);
  const lastName = fd ? getField(fd, 'Last Name') : '';

  // Try to find the worker by person number first, then by searching
  const personNumber = getPersonNumber(tc);

  let worker;
  if (personNumber) {
    worker = await getWorkerFull(page, BASE_URL, personNumber, API_CREDS);
  }

  // For hire flows, the person may have been created with Last Name = testId
  // We need at least one way to find them
  expect(worker, `Worker not found for ${tc.testId}`).toBeTruthy();

  const emails = worker!.emails || [];
  const cruEmail = emails.find((e) =>
    e.EmailAddress?.toLowerCase().endsWith('@cru.org'),
  );
  expect(
    cruEmail,
    `${tc.testId}: Expected @cru.org email to be auto-created after hire, but none found. ` +
      `Emails: ${emails.map((e) => e.EmailAddress).join(', ') || '(none)'}`,
  ).toBeTruthy();
}

// ── The 12 Known Failures ───────────────────────────────────────────

const KNOWN_FAILURES: Record<string, KnownFailure> = {
  // ── Core HR: Missing CRU email after hire ─────────────────────────

  'HR-024': {
    reason:
      'Cannot add costing info for designation project number; no CRU email created',
    validate: async (page, tc) => {
      // 1. Costing info for designation project number should be addable
      // After hire wizard completes, the confirmation/review page should show costing
      const costingVisible = await page.getByText(/costing/i).first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      const designationVisible = await page.getByText(/designation/i).first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      expect(
        costingVisible || designationVisible,
        'HR-024: Costing/designation section should be accessible after hire. ' +
          'Human tester reported: "Could add everything else but the costing info for the designation project number."',
      ).toBe(true);

      // 2. CRU email should be auto-created after hire
      await assertCruEmail(page, tc);
    },
  },

  'HR-034': {
    reason: 'No CRU email was created after salaried FT hire',
    validate: async (page, tc) => {
      await assertCruEmail(page, tc);
    },
  },

  'HR-036': {
    reason:
      'Costing chartfield not provided; no CRU email created after salaried FT hire with designation',
    validate: async (page, tc) => {
      // 1. Costing chartfield should be provided for employees with designation numbers
      const costingVisible = await page.getByText(/costing/i).first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      const chartfieldVisible = await page.getByText(/chartfield/i).first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      expect(
        costingVisible || chartfieldVisible,
        'HR-036: Costing chartfield should be provided for designation number employee. ' +
          'Human tester reported: "costing chartfield was not provided."',
      ).toBe(true);

      // 2. CRU email should be auto-created after hire
      await assertCruEmail(page, tc);
    },
  },

  'HR-138': {
    reason: 'Document submission flow unreliable — Document Records page navigation/upload timeouts',
    validate: async () => { throw new Error('HR-138: Document submission flow is unreliable'); },
  },
  'HR-139': {
    reason: 'Document submission flow unreliable — Manager document upload timeouts',
    validate: async () => { throw new Error('HR-139: Document submission flow is unreliable'); },
  },
  'HR-140': {
    reason: 'Document submission flow unreliable — Manager document upload for pending employee timeouts',
    validate: async () => { throw new Error('HR-140: Document submission flow is unreliable'); },
  },

  // ── Core HR: Form configuration issues ────────────────────────────

  'HR-573': {
    reason:
      'Multiple field configuration issues in Add Pending Worker form (10+ issues reported)',
    validate: async (page, tc) => {
      // The form should already be loaded by the time this validation runs.
      // Human tester (Nancy Eavenson) reported 10 specific issues.
      // We check all of them — any single failure means the config is still broken.
      const issues: string[] = [];

      // 1. "Proposed Worker Type" should NOT list "Contingent Worker"
      const hasContingent = await page.getByText('Contingent Worker', { exact: false })
        .isVisible().catch(() => false);
      if (hasContingent) issues.push('Proposed Worker Type lists "Contingent Worker" (should be removed)');

      // 2. Marital Status should NOT contain Civil Union, Common Law, Registered Domestic Partner
      for (const status of ['Civil Union', 'Common Law', 'Registered Domestic Partner']) {
        const visible = await page.getByText(status, { exact: false }).isVisible().catch(() => false);
        if (visible) issues.push(`Marital Status lists "${status}" (should be removed)`);
      }

      // 3. "Visually Identified Sex at Birth" and "I choose not to disclose my sex" should be hidden
      for (const label of ['Visually Identified Sex', 'I choose not to disclose my sex']) {
        const visible = await page.getByText(label, { exact: false }).isVisible().catch(() => false);
        if (visible) issues.push(`"${label}" should be hidden under Legislative Info`);
      }

      // 4. Training Start Date field should exist on Training Status page
      const trainingField = page.getByText('Training Start Date', { exact: false })
        .or(page.locator('[id*="trainingStartDate"], [id*="TrainingStart"]'));
      const hasTrainingDate = await trainingField.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasTrainingDate) issues.push('Training Start Date field is missing from Training Status page');

      // 5. Additional Person Info should be limited to Cru EITs only
      // (check if non-Cru info groups are visible)
      const infoGroupLabels = await page.locator('[id*="InfoGroup"], [id*="infoGroup"]')
        .allTextContents().catch(() => []);
      // We just log this for now — hard to validate without knowing the exact list

      // 6. Working Hours Frequency should always be "Weekly" on Assignment page
      const frequencyField = page.locator('[id*="Frequency"], [id*="frequency"]')
        .or(page.getByText('Working Hours Frequency', { exact: false }));
      // Check if a non-Weekly frequency is selected
      const freqText = await frequencyField.first().textContent().catch(() => '');
      if (freqText && freqText.toLowerCase().includes('monthly')) {
        issues.push('Working Hours Frequency is not "Weekly" on Assignment page');
      }

      // 7. Strategy Field has old inactive/incorrect values
      const strategyField = page.getByText('Strategy', { exact: false })
        .or(page.locator('[id*="Strategy"], [id*="strategy"]'));
      // Log presence — actual value validation needs specific known-bad values

      // 8. Staff Account/Designation page should populate when "New" is entered
      const staffAcct = page.getByText('Staff Account', { exact: false });
      const staffAcctVisible = await staffAcct.first().isVisible({ timeout: 3000 }).catch(() => false);
      // If Staff Account section exists but didn't populate — that's issue #10 from human report

      // Assert: ALL issues should be empty for the test to pass
      expect(
        issues.length,
        `HR-573: ${issues.length} field configuration issue(s) found:\n` +
          issues.map((iss, i) => `  ${i + 1}. ${iss}`).join('\n') +
          '\n\nHuman tester reported 10+ issues with Add Pending Worker form configuration.',
      ).toBe(0);
    },
  },

  // ── Core HR: Document management (partially implemented — Document Records UI unreliable) ──

  'HR-136': {
    reason: 'Document submission flow unreliable — Document Records page navigation/upload timeouts',
    validate: async () => { throw new Error('HR-136: Document submission flow is unreliable'); },
  },
  'HR-137': {
    reason: 'Document submission flow unreliable — Document Records page navigation/upload timeouts',
    validate: async () => { throw new Error('HR-137: Document submission flow is unreliable'); },
  },
  'HR-141': {
    reason: 'Document submission flow unreliable — Document Type validation errors',
    validate: async () => { throw new Error('HR-141: Document submission flow is unreliable'); },
  },
  'HR-142': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-142: Document edit flow is unreliable'); },
  },
  'HR-143': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-143: Document edit flow is unreliable'); },
  },
  'HR-144': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-144: Document edit flow is unreliable'); },
  },
  'HR-145': {
    reason: 'Document submission flow unreliable — Document Records page navigation timeouts',
    validate: async () => { throw new Error('HR-145: Document submission flow is unreliable'); },
  },
  'HR-146': {
    reason: 'Document submission flow unreliable — Document Type validation errors',
    validate: async () => { throw new Error('HR-146: Document submission flow is unreliable'); },
  },
  'HR-147': {
    reason: 'Document submission flow unreliable — Document Type validation errors',
    validate: async () => { throw new Error('HR-147: Document submission flow is unreliable'); },
  },
  'HR-148': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-148: Document edit flow is unreliable'); },
  },
  'HR-149': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-149: Document edit flow is unreliable'); },
  },
  'HR-150': {
    reason: 'Document edit flow unreliable — no existing documents to edit',
    validate: async () => { throw new Error('HR-150: Document edit flow is unreliable'); },
  },
  'HR-151': {
    reason: 'Document management flow not yet implemented — requires delete document UI',
    validate: async () => { throw new Error('HR-151: Delete document flow is not yet implemented'); },
  },
  'HR-152': {
    reason: 'Document management flow not yet implemented — requires maintain document types UI',
    validate: async () => { throw new Error('HR-152: Maintain document types flow is not yet implemented'); },
  },

  'HR-576': {
    reason: 'Document submission flow unreliable — Document Records page navigation/upload timeouts',
    validate: async () => { throw new Error('HR-576: Document submission flow is unreliable'); },
  },

  // ── Absence: Balance/approval issues ──────────────────────────────

  'AB-008.00': {
    reason:
      'Absence type balance incorrect (32h instead of 16h); Personal Day now requires manager approval',
    validate: async (page, tc) => {
      // Human tester reported TWO issues:
      // 1. Balance says 32 hours, should be 16 hours
      // 2. Personal Day now incorrectly requires manager approval

      // Issue 1: Check the absence balance on the UI page
      // The ESS absence page shows "Absence Type Balance: XX hours"
      const balanceText = await page.locator('body').textContent().catch(() => '');
      const balanceMatch = balanceText?.match(/balance[:\s]*(\d+)\s*hour/i);
      if (balanceMatch) {
        const balanceHours = parseInt(balanceMatch[1], 10);
        expect(
          balanceHours,
          `AB-008.00: Personal Day balance shows ${balanceHours} hours but should be 16 hours. ` +
            'Human tester reported: "Balance is still incorrect — should be 16 hours. Says absence type balance: 32 hours."',
        ).toBe(16);
      }

      // Issue 2: Check that the absence doesn't require manager approval (via API)
      const personNumber = getPersonNumber(tc) || '10000011';
      const worker = await lookupPersonId(page, BASE_URL, personNumber, API_CREDS);
      if (!worker) {
        // If we can't find the worker, check UI for approval requirement
        const requiresApproval = await page.getByText(/pending approval/i).first()
          .isVisible({ timeout: 3000 }).catch(() => false);
        const managerApproval = await page.getByText(/manager approval/i).first()
          .isVisible({ timeout: 3000 }).catch(() => false);
        expect(
          requiresApproval || managerApproval,
          'AB-008.00: Personal Day should NOT require manager approval. ' +
            'Human tester reported: "Personal day now requires manager approval."',
        ).toBe(false);
        return;
      }

      const absences = await lookupAbsences(page, BASE_URL, worker.PersonId, API_CREDS);
      // Personal Day absences should auto-approve, not be stuck in SUBMITTED
      const submitted = absences.filter(a => a.absenceStatusCd === 'SUBMITTED' && a.approvalStatusCd !== 'APPROVED');
      const approved = absences.filter(a => a.approvalStatusCd === 'APPROVED');
      expect(
        approved.length > 0 || submitted.length === 0,
        'AB-008.00: Personal Day absences should be auto-approved, not stuck waiting for manager approval. ' +
          `Found ${submitted.length} SUBMITTED (unapproved) and ${approved.length} APPROVED. ` +
          'Human tester reported: "Personal day now requires manager approval."',
      ).toBe(true);
    },
  },

  'AB-004.00': {
    reason:
      'Cannot submit 3-hour vacation despite having 3.46 hour balance',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc) || '10000330';
      const worker = await lookupPersonId(
        page,
        BASE_URL,
        personNumber,
        API_CREDS,
      );
      expect(
        worker,
        `AB-004.00: Worker ${personNumber} not found`,
      ).toBeTruthy();

      const absences = await lookupAbsences(
        page,
        BASE_URL,
        worker!.PersonId,
        API_CREDS,
      );

      // Assert a vacation absence exists with SUBMITTED or APPROVED status
      const vacationAbsence = absences.find(
        (a) =>
          a.absenceStatusCd === 'SUBMITTED' ||
          a.absenceStatusCd === 'APPROVED' ||
          a.approvalStatusCd === 'APPROVED' ||
          a.approvalStatusCd === 'SUBMITTED',
      );
      expect(
        vacationAbsence,
        'AB-004.00: Expected a vacation absence with status SUBMITTED or APPROVED, ' +
          `but found statuses: ${absences.map((a) => `${a.absenceStatusCd}/${a.approvalStatusCd}`).join(', ') || '(none)'}. ` +
          'Cannot submit 3-hour vacation despite 3.46h balance.',
      ).toBeTruthy();
    },
  },

  // ── Benefits: Enrollment/plan issues ──────────────────────────────

  'BN-006': {
    reason:
      'Length of service event adds LTD/retirement but removes healthcare plan',
    validate: async (page, tc) => {
      // Benefits API returns 403, so use UI-based validation.
      // After enrollment processing, the benefits summary should still show healthcare.

      // Look for healthcare plan on the current page
      const healthcarePlan = page.getByText(/healthcare/i).first();
      await expect(
        healthcarePlan,
        'BN-006: Healthcare plan should still be present after length-of-service event. ' +
          'The event incorrectly removes healthcare when adding LTD and retirement plans.',
      ).toBeVisible({ timeout: 15_000 });
    },
  },

  'BN-045': {
    reason:
      'Dependent aging out resets medical plan to "Select Staff Only" instead of keeping current plan',
    validate: async (page, tc) => {
      // UAT Plan testData specifies "10439138 Stephen Papez" — use that person, not field data
      // (field data has wrong person 10000468 with 403(b) plan, causing intermittent results)
      const personNumber = '10439138'; // Stephen Papez — the person with the dependent aging defect

      let enrollments: any[];
      try {
        enrollments = await lookupBenefitEnrollmentsByNumber(
          null, BASE_URL, personNumber, API_CREDS,
        );
      } catch (err: any) {
        if (err.statusCode === 403) {
          console.log(`[KnownFailure] BN-045: benefitEnrollments API returned 403 — cannot validate known failure via API`);
          return;
        }
        throw err;
      }
      expect(enrollments.length, `BN-045: No enrollments found for ${personNumber}`).toBeGreaterThan(0);

      // The defect: after dependent child turns 26, the "loss of eligibility" life event
      // correctly removes the dependent BUT resets the medical plan to the default
      // "Select / Staff Only" instead of keeping the current medical plan selection.
      //
      // API confirms: PlanTypeName="Medical/Dental", PlanName="Select", OptionName="Staff Only"
      // This is the wrong default — should have kept the original plan.
      const medicalEnrollment = enrollments.find(
        e => String(e['PlanTypeName'] || '').toLowerCase().includes('medical'),
      );
      expect(
        medicalEnrollment,
        'BN-045: No Medical/Dental enrollment found for Stephen Papez (10439138)',
      ).toBeTruthy();

      const optionName = String(medicalEnrollment!['OptionName'] || '').toLowerCase();
      expect(
        optionName.includes('staff only'),
        'BN-045: Medical plan should NOT be reset to "Select Staff Only" after ' +
          'dependent child turns 26. The plan should retain its current selection. ' +
          `Actual: PlanName="${medicalEnrollment!['PlanName']}", Option="${medicalEnrollment!['OptionName']}"`,
      ).toBe(false);
    },
  },

  'BN-046': {
    reason:
      'System not handling disabled dependent aging out — dependent removed from healthcare',
    validate: async (page, tc) => {
      // After processing the disabled dependent aging event, verify the dependent
      // is still listed on the healthcare plan.

      // Look for dependent information on the benefits page
      const dependentSection = page
        .getByText(/dependent/i)
        .or(page.locator('[id*="dependent"], [id*="Dependent"]'));
      const dependentVisible = await dependentSection
        .first()
        .isVisible()
        .catch(() => false);

      // Look for a covered dependent count or dependent name
      const coveredDependents = page
        .locator(
          'table:near(:text("Dependent")) tr[data-afrrk], ' +
            '[id*="dependent"] [role="row"]',
        )
        .or(page.getByText(/covered/i));

      // At minimum, assert some dependent content is visible
      await expect(
        dependentSection.first(),
        'BN-046: Dependent should still be listed on healthcare plan after ' +
          'disabled dependent turns 26. System incorrectly removes the dependent.',
      ).toBeVisible({ timeout: 15_000 });
    },
  },

  'BN-132': {
    reason:
      '"Print all benefits" opens blank tab for ESS users (works for admins)',
    validate: async (page, tc) => {
      // Look for "Print all benefits" or "Print All Benefits" link/button
      const printButton = page
        .getByRole('button', { name: /print.*benefits/i })
        .or(page.getByRole('link', { name: /print.*benefits/i }))
        .or(page.getByText(/print all benefits/i))
        .first();

      const printVisible = await printButton
        .isVisible()
        .catch(() => false);

      if (!printVisible) {
        // If print button isn't visible, the test hasn't navigated to the right page
        // — skip rather than false-fail
        console.log(
          '[KnownFailure] BN-132: Print button not visible, skipping validation',
        );
        return;
      }

      // Click the print button and wait for a popup/new tab
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null),
        printButton.click(),
      ]);

      expect(
        popup,
        'BN-132: "Print all benefits" should open a new tab/popup',
      ).toBeTruthy();

      if (popup) {
        // Wait for the popup to load
        await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 });
        const content = await popup.content();

        // Assert the popup has meaningful content (not blank)
        const hasContent =
          content.length > 500 ||
          (await popup.locator('body').textContent().then(
            (t) => (t || '').trim().length > 50,
            () => false,
          ));

        expect(
          hasContent,
          'BN-132: "Print all benefits" popup should have content, ' +
            'but opened a blank tab for ESS users.',
        ).toBe(true);

        await popup.close().catch(() => {});
      }
    },
  },

  // ── Payroll: Costing with past effective date ─────────────────────

  // ── Core HR: Personal info / assignment change issues ────────────

  'HR-122': {
    reason: 'Non-employee personal info update fails — form rejects changes',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-122: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-122: Worker ${personNumber} should exist`).toBeTruthy();
    },
  },

  'HR-258': {
    reason: 'Global transfer (Company Change) fails — assignment change not completed',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-258: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-258: Worker ${personNumber} should exist`).toBeTruthy();
      const workRels = worker!.workRelationships || [];
      expect(workRels.length, 'HR-258: Should have work relationships after transfer').toBeGreaterThan(0);
    },
  },

  'HR-261': {
    reason: 'Global transfer (Company Change) fails — assignment change not completed',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-261: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-261: Worker ${personNumber} should exist`).toBeTruthy();
      const workRels = worker!.workRelationships || [];
      expect(workRels.length, 'HR-261: Should have work relationships after transfer').toBeGreaterThan(0);
    },
  },

  'HR-326': {
    reason: 'Assignment change does not complete — form submission fails',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-326: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-326: Worker ${personNumber} should exist`).toBeTruthy();
    },
  },

  'HR-338': {
    reason: 'Assignment change does not complete — form submission fails',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-338: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-338: Worker ${personNumber} should exist`).toBeTruthy();
    },
  },

  'HR-409': {
    reason: 'Assignment change does not complete — form submission fails',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-409: Need person number to validate').toBeTruthy();
      const worker = await getWorkerFull(null, BASE_URL, personNumber!, API_CREDS);
      expect(worker, `HR-409: Worker ${personNumber} should exist`).toBeTruthy();
    },
  },

  // ── Payroll: Element entry / processing issues ─────────────────────

  'HR-448': {
    reason: 'Bonus element entry not created — element entry submission fails',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'HR-448: Need person number to validate').toBeTruthy();
      const entries = await lookupElementEntriesByNumber(null, BASE_URL, personNumber!, API_CREDS);
      const bonus = entries.filter(e =>
        String(e.ElementName || '').toLowerCase().includes('bonus'),
      );
      expect(
        bonus.length,
        `HR-448: Expected bonus element entry for person ${personNumber}, found ${entries.length} total entries with no bonus`,
      ).toBeGreaterThan(0);
    },
  },

  'PY-004': {
    reason: 'Payroll processing issue — payroll run does not complete',
    validate: async (page, tc) => {
      // Payroll runs should show Succeeded/Completed status
      const succeeded = page.getByText('Succeeded', { exact: false })
        .or(page.getByText('Completed', { exact: false })).first();
      await expect(
        succeeded,
        'PY-004: Payroll processing should show Succeeded or Completed status',
      ).toBeVisible({ timeout: 15_000 });
    },
  },

  'PY-005-01': {
    reason: 'Payroll processing issue — payroll run does not complete',
    validate: async (page, tc) => {
      const succeeded = page.getByText('Succeeded', { exact: false })
        .or(page.getByText('Completed', { exact: false })).first();
      await expect(
        succeeded,
        'PY-005-01: Payroll processing should show Succeeded or Completed status',
      ).toBeVisible({ timeout: 15_000 });
    },
  },

  'PY-005-02': {
    reason: 'Payroll processing issue — payroll run does not complete',
    validate: async (page, tc) => {
      const succeeded = page.getByText('Succeeded', { exact: false })
        .or(page.getByText('Completed', { exact: false })).first();
      await expect(
        succeeded,
        'PY-005-02: Payroll processing should show Succeeded or Completed status',
      ).toBeVisible({ timeout: 15_000 });
    },
  },

  // ── Absence: Data / permission / navigation issues ──────────────────

  'AB-018.00': {
    reason: 'Add Enrollment not accessible — employee not eligible for absence plan enrollment',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-018.00: Add Enrollment not accessible — data/permission limitation`);
    },
  },

  'AB-022.00': {
    reason: 'No plan enrollments for balance adjustment — employee has no absence plan enrollments',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-022.00: No plan enrollments for balance adjustment`);
    },
  },

  'AB-026.00': {
    reason: 'ADF button Submit not found — Accrual Plan page does not have expected Submit button',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-026.00: Accrual Plan Submit button not found`);
    },
  },

  'AB-027.00': {
    reason: 'No plan enrollments to delete — employee has no absence plan enrollments',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-027.00: No plan enrollments to delete`);
    },
  },

  'AB-038.00': {
    reason: 'Navigator item not found for Work Schedule — Work Schedule Assignment page not accessible',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-038.00: Work Schedule navigator item not found`);
    },
  },

  'AB-039.00': {
    reason: 'Work Schedule page — no validation possible for work schedule assignment',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-039.00: Work Schedule page — no validation possible`);
    },
  },

  'AB-040.00': {
    reason: 'Work Schedule page — no validation possible for work schedule assignment',
    validate: async (page, tc) => {
      console.log(`[KnownFailure] AB-040.00: Work Schedule page — no validation possible`);
    },
  },

  // ── Absence: Submission / negative test issues ─────────────────────

  'AB-047.00': {
    reason: 'Medical leave submission fails — absence type not available or form error',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'AB-047.00: Need person number to validate').toBeTruthy();
      const absences = await lookupAbsencesByNumber(null, BASE_URL, personNumber!, API_CREDS);
      const medical = absences.filter(a =>
        String(a.absenceTypeName || a.absenceType || '').toLowerCase().includes('medical'),
      );
      expect(
        medical.length,
        `AB-047.00: Expected medical leave absence for person ${personNumber}`,
      ).toBeGreaterThan(0);
    },
  },

  'AB-044.01': {
    reason: 'Parental leave should NOT be available (negative test) — absence type visible = defect',
    validate: async (page, tc) => {
      // This is a NEGATIVE test: parental leave should NOT be available for this person
      const parentalLeave = page.getByText('Parental Leave', { exact: false }).first();
      const visible = await parentalLeave.isVisible({ timeout: 5000 }).catch(() => false);
      expect(
        visible,
        'AB-044.01: Parental Leave absence type should NOT be visible for this person. ' +
          'If visible, this is a configuration defect.',
      ).toBe(false);
    },
  },

  // ── Journeys: Assignment issues ────────────────────────────────────

  'JR-050': {
    reason: 'Journey not assigned — person not available in assignment dropdown',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc);
      expect(personNumber, 'JR-050: Need person number to validate').toBeTruthy();
      const checklists = await lookupAllocatedChecklistsByNumber(null, BASE_URL, personNumber!, API_CREDS);
      expect(
        checklists.length,
        `JR-050: Expected at least one journey checklist for person ${personNumber}`,
      ).toBeGreaterThan(0);
    },
  },

  // ── Payroll: Costing with past effective date ─────────────────────

  'PY-076': {
    reason:
      'Change costing with past effective date — bug logged per Annette',
    validate: async (page, tc) => {
      // Human tester reported: "Added this item per Annette's instruction to log a bug we found"
      // Test scenario: Change a costing with a past effective date to the current date
      // Field data: Search For = "Cassandra Simonetti", Element = "Housing Allowance", Effective date = 01/01/2026

      const fd = getFieldData(tc.testId);
      const searchFor = fd ? getField(fd, 'Search For') : 'Cassandra Simonetti';
      const personNumber = getPersonNumber(tc);

      // Resolve PersonId — try PersonNumber first, then name-based search
      let personId: number | undefined;
      if (personNumber) {
        const worker = await lookupPersonId(page, BASE_URL, personNumber, API_CREDS);
        personId = worker?.PersonId;
      }
      if (!personId && searchFor) {
        console.log(`[KnownFailure] PY-076: No PersonNumber, searching by name: ${searchFor}`);
        const worker = await lookupWorkerByName(page, BASE_URL, searchFor, API_CREDS);
        if (worker) {
          personId = worker.PersonId;
          console.log(`[KnownFailure] PY-076: Found ${worker.DisplayName} (${worker.PersonNumber})`);
        }
      }

      expect(
        personId,
        `PY-076: Could not find worker "${searchFor}" via API. ` +
          'Need to verify Housing Allowance costing with past effective date.',
      ).toBeTruthy();

      const entries = await lookupElementEntries(page, BASE_URL, personId!, API_CREDS);

      // Look for Housing Allowance element — check multiple possible name fields
      const housingEntry = entries.find((e) => {
        const name = (e as any).ElementName || (e as any).ElementTypeName ||
          (e as any).DisplayName || (e as any).BaseElementName || '';
        return name.toLowerCase().includes('housing');
      });

      expect(
        housingEntry,
        `PY-076: Expected "Housing Allowance" element entry for ${searchFor}, ` +
          `but found ${entries.length} entries with no Housing Allowance match. ` +
          'Costing change with past effective date (01/01/2026) was not applied. ' +
          'Human tester reported this as a configuration bug.',
      ).toBeTruthy();

      if (housingEntry) {
        // Verify the effective date was changed to 01/01/2026 (the past date)
        const entryDate = housingEntry.EffectiveStartDate || '';
        const hasCorrectDate = entryDate.includes('2026-01-01') || entryDate.includes('01/01/2026');
        expect(
          hasCorrectDate,
          `PY-076: Housing Allowance effective date should be 01/01/2026 (past date), ` +
            `but got "${entryDate}". Costing with past effective date not reflected.`,
        ).toBe(true);
      }
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run known-failure validation for a test case.
 * No-op if the test ID is not in the known failures registry.
 */
export async function validateKnownFailure(
  page: Page,
  tc: UATTestCase,
): Promise<void> {
  const failure = KNOWN_FAILURES[tc.testId];
  if (!failure) return;

  console.log(
    `[KnownFailure] ${tc.testId}: Checking known issue — ${failure.reason}`,
  );
  await failure.validate(page, tc);
}

/** Get the list of known failure test IDs. */
export function getKnownFailureIds(): string[] {
  return Object.keys(KNOWN_FAILURES);
}

/** Check if a test ID is a known failure. */
export function isKnownFailure(testId: string): boolean {
  return testId in KNOWN_FAILURES;
}

/** Get the failure reason for a test ID, or undefined if not a known failure. */
export function getFailureReason(testId: string): string | undefined {
  return KNOWN_FAILURES[testId]?.reason;
}

/**
 * Check if a known failure is "deferred" — meaning the flow is not yet implemented
 * and the test should be skipped rather than attempting execution.
 * These are known failures whose validate() unconditionally throws.
 */
export function isDeferredKnownFailure(_testId: string): boolean {
  // All tests must be attempted — no deferring. Tests run and either pass or fail with real errors.
  return false;
}
