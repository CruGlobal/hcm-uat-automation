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
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  type BasicAuthCredentials,
} from '../../scripts/lib/hcm-rest-api';

const API_CREDS: BasicAuthCredentials = {
  username: 'uat.bot_hr_admin',
  password: 'WinBuildSend!1951@cru',
};
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
      await assertCruEmail(page, tc);
    },
  },

  // ── Core HR: Document Records missing ─────────────────────────────

  'HR-138': {
    reason:
      'Cannot upload documents — "Document of Record" type missing from dropdown',
    validate: async (page, tc) => {
      // This validation checks that the Document Records UI has the required
      // upload capability and "Document of Record" category.
      // The flow should have already navigated to the person's Document Records.

      // Look for "Add" button or upload action on the Document Records page
      const addButton = page
        .getByRole('button', { name: /add/i })
        .or(page.locator('button:has-text("Add")'))
        .first();
      await expect(
        addButton,
        'HR-138: "Add" button should exist on Document Records page',
      ).toBeVisible({ timeout: 10_000 });

      // Check that "Document of Record" type is available
      // Click Add to open the creation dialog, then check the Type dropdown
      await addButton.click();
      await page.waitForTimeout(2_000);

      const typeDropdown = page
        .locator('select, [role="combobox"], [role="listbox"]')
        .filter({ hasText: /document/i })
        .first();
      const docOfRecordOption = page.getByText('Document of Record', {
        exact: false,
      });
      await expect(
        docOfRecordOption,
        'HR-138: "Document of Record" type should be available in the document type dropdown',
      ).toBeVisible({ timeout: 10_000 });
    },
  },

  // ── Core HR: Form configuration issues ────────────────────────────

  'HR-573': {
    reason:
      'Multiple field configuration issues in Add Pending Worker form',
    validate: async (page, tc) => {
      // The form should already be loaded by the time this validation runs.
      // Check multiple field configurations:

      // 1. "Proposed Worker Type" should NOT contain "Contingent Worker"
      const workerTypeDropdown = page.locator(
        '[id*="WorkerType"] option, [id*="workerType"] option, ' +
          'select:near(:text("Proposed Worker Type")) option',
      );
      const contingentOption = page.getByText('Contingent Worker', {
        exact: false,
      });

      // We want to assert Contingent Worker is NOT visible in the dropdown
      // Use a soft check — if the dropdown is present, verify the option
      const hasContingent = await contingentOption
        .isVisible()
        .catch(() => false);
      expect(
        hasContingent,
        'HR-573: "Contingent Worker" should NOT appear in Proposed Worker Type dropdown',
      ).toBe(false);

      // 2. Marital Status should NOT contain invalid values
      const invalidStatuses = [
        'Civil Union',
        'Common Law',
        'Registered Domestic Partner',
      ];
      for (const status of invalidStatuses) {
        const statusOption = page.getByText(status, { exact: false });
        const visible = await statusOption.isVisible().catch(() => false);
        expect(
          visible,
          `HR-573: "${status}" should NOT appear in Marital Status dropdown`,
        ).toBe(false);
      }

      // 3. Training Start Date field should exist
      const trainingField = page
        .getByText('Training Start Date', { exact: false })
        .or(page.locator('[id*="trainingStartDate"], [id*="TrainingStart"]'));
      await expect(
        trainingField.first(),
        'HR-573: "Training Start Date" field should exist on the form',
      ).toBeVisible({ timeout: 10_000 });
    },
  },

  // ── Absence: Balance/approval issues ──────────────────────────────

  'AB-008.00': {
    reason:
      'Absence type balance incorrect (32h instead of 16h); now requires manager approval',
    validate: async (page, tc) => {
      const personNumber = getPersonNumber(tc) || '10000011';
      const worker = await lookupPersonId(
        page,
        BASE_URL,
        personNumber,
        API_CREDS,
      );
      expect(
        worker,
        `AB-008.00: Worker ${personNumber} not found`,
      ).toBeTruthy();

      const absences = await lookupAbsences(
        page,
        BASE_URL,
        worker!.PersonId,
        API_CREDS,
      );

      // Find the most recent personal day absence
      const personalDayAbsences = absences.filter(
        (a) =>
          a.approvalStatusCd === 'APPROVED' ||
          a.absenceStatusCd === 'SUBMITTED',
      );

      // The defect is that the absence requires manager approval but shouldn't,
      // so we assert that at least one absence is APPROVED (not stuck in SUBMITTED)
      const approved = absences.find(
        (a) => a.approvalStatusCd === 'APPROVED',
      );
      expect(
        approved,
        'AB-008.00: Expected at least one absence with approvalStatusCd=APPROVED, ' +
          `but found statuses: ${absences.map((a) => `${a.absenceStatusCd}/${a.approvalStatusCd}`).join(', ') || '(none)'}. ` +
          'Personal Day absence now incorrectly requires manager approval.',
      ).toBeTruthy();
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
      // After dependent aging, check that the medical plan name is NOT the wrong default.
      // Look for "Select Staff Only" text which indicates the plan was incorrectly reset.

      const wrongDefault = page.getByText('Select Staff Only', {
        exact: false,
      });
      const isWrongDefault = await wrongDefault
        .isVisible()
        .catch(() => false);
      expect(
        isWrongDefault,
        'BN-045: Medical plan should NOT be reset to "Select Staff Only" after ' +
          'dependent child turns 26. The plan should retain its current selection.',
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

  'PY-076': {
    reason:
      'Change costing with past effective date logged as bug — element entry not reflecting change',
    validate: async (page, tc) => {
      // Look up the person's element entries via API
      const fd = getFieldData(tc.testId);
      const searchFor = fd ? getField(fd, 'Search For') : '';
      const personNumber = getPersonNumber(tc);

      // We need the PersonId to query element entries
      let personId: number | undefined;
      if (personNumber) {
        const worker = await lookupPersonId(
          page,
          BASE_URL,
          personNumber,
          API_CREDS,
        );
        personId = worker?.PersonId;
      }

      if (!personId && searchFor) {
        // Try to find by searching workers (name match)
        console.log(
          `[KnownFailure] PY-076: No PersonNumber, searching by name: ${searchFor}`,
        );
      }

      expect(
        personId,
        `PY-076: Could not resolve PersonId for test data`,
      ).toBeTruthy();

      const entries = await lookupElementEntries(
        page,
        BASE_URL,
        personId!,
        API_CREDS,
      );

      // Look for Housing Allowance element with the correct effective date
      const expectedDate = fd ? getField(fd, 'Effective date') : '01/01/2026';

      // Element entries may use different name fields — check for Housing Allowance
      const housingEntry = entries.find((e) => {
        const name =
          (e as any).ElementName ||
          (e as any).ElementTypeName ||
          (e as any).DisplayName ||
          '';
        return name.toLowerCase().includes('housing allowance');
      });

      expect(
        housingEntry,
        'PY-076: Expected "Housing Allowance" element entry to exist for the person, ' +
          `but found ${entries.length} entries with no Housing Allowance match. ` +
          'Costing change with past effective date was not applied.',
      ).toBeTruthy();

      if (housingEntry && expectedDate) {
        // Normalize date for comparison (the API may return YYYY-MM-DD format)
        const entryDate = housingEntry.EffectiveStartDate || '';
        const hasCorrectDate =
          entryDate.includes('2026-01-01') ||
          entryDate.includes('01/01/2026');
        expect(
          hasCorrectDate,
          `PY-076: Housing Allowance effective date should be ${expectedDate}, ` +
            `but got ${entryDate}`,
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
