# Absence Management — Validation Needs

## Current State

The `OutcomeValidator.validateAbsence()` method handles two cases via the Oracle HCM REST API:

1. **Entry/Submission/Add** — Calls `lookupAbsencesByNumber(personNumber)` to verify an absence record exists with correct dates/type/status.
2. **Approval** — Calls `lookupAbsencesByNumber(personNumber)` and checks `approvalStatusCd === 'APPROVED'`.

All other absence operations (withdrawal, enrollment, balance, accruals, scheduled processes) fall through to `verifyNoErrors()` — a UI-only check for error banners.

## Available API

The Absence REST API **IS available** (unlike Benefits which returns 403):

```typescript
// scripts/lib/hcm-rest-api.ts
lookupAbsencesByNumber(page, baseUrl, personNumber, creds): Promise<AbsenceRecord[]>
lookupAbsences(page, baseUrl, personId, creds): Promise<AbsenceRecord[]>

// AbsenceRecord fields:
interface AbsenceRecord {
  absenceCaseId: number;
  absenceStatusCd: string;   // e.g., 'SUBMITTED', 'APPROVED', 'WITHDRAWN'
  approvalStatusCd: string;  // e.g., 'APPROVED', 'PENDING_APPROVAL'
  startDate: string;
  endDate: string;
  personId: number;
  absenceTypeId: number;
  [key: string]: unknown;
}
```

## Recommended Validation Extensions

### 1. Withdrawal Validation
**Business processes**: `Withdraw Absence` (5 tests), `Withdraws Accruals` (1 test)
**Current**: Falls through to `verifyNoErrors()`.
**Recommended**: After withdrawal, query `lookupAbsencesByNumber()` and verify:
- `absenceStatusCd === 'WITHDRAWN'` on the most recent absence
- Or verify the absence no longer appears in active absences

```typescript
// In validateAbsence():
if (bp.includes('withdraw')) {
  await this.validateAbsenceWithdrawal(tc, fieldData);
}

private async validateAbsenceWithdrawal(tc, fieldData) {
  await this.verifyNoErrors();
  if (!fieldData) return;
  const personNumber = getField(fieldData, 'person number');
  if (!personNumber) return;
  const absences = await lookupAbsencesByNumber(..., personNumber, ...);
  const withdrawn = absences.filter(a => a.absenceStatusCd === 'WITHDRAWN');
  if (withdrawn.length > 0) {
    console.log(`[OutcomeValidator] ${tc.testId}: ${withdrawn.length} withdrawn absence(s)`);
  }
}
```

### 2. Enrollment Operations Validation
**Business processes**: `Review Current Enrollments`, `Adds Enrollment`, `Update Enrollment`, `Delete Enrollment`, `Accrual Plan Enrollments`
**Current**: Falls through to `verifyNoErrors()`.
**Limitation**: No known REST API endpoint for absence plan enrollments. The `absences` endpoint only returns absence records, not enrollment data.
**Recommended**: UI-only validation — check for success/confirmation banners after submit.

### 3. Balance Operations Validation
**Business processes**: `Balance Adjustment`, `Disburses from Balance`, `Review Accrual Balance`
**Current**: Falls through to `verifyNoErrors()`.
**Limitation**: No known REST API endpoint for absence balance data. Balances are derived from accrual calculations.
**Recommended**: UI-only validation — check for confirmation messages. For balance review, verify the balance popup/section loaded successfully.

### 4. Manager Approval with Specific Types (FMLA, etc.)
**Business processes**: `Manager Approval for Absences (FMLA Hourly)`, `Manager Approval for Absences (FMLA Salaried)`, `Manager Approval for FMLA Vacation Absences`, `Manager Approval for Personal Leave of Absence`
**Current**: Already handled by `validateAbsenceApproval()` — checks `approvalStatusCd === 'APPROVED'`.
**Status**: Adequate. No changes needed.

### 5. Scheduled Process Validation
**Business processes**: `Calculate Accruals and Balances`, `Evaluate Absences`
**Current**: Falls through to `verifyNoErrors()`.
**Limitation**: These are background processes. No way to verify completion via REST API synchronously.
**Recommended**: UI-only — verify the process was submitted (check for "submitted" confirmation text).

## 85 Not Started Tests — Routing Coverage

All 85 "Not Started" absence tests are already fully routed:

| Script Pattern | Count | Flow | Method |
|---|---|---|---|
| HCM.ABS.402.00 | 22 | AbsenceEntryFlow | `hrSpecialistAddsAbsence()` → `essAddAbsence()` |
| HCM.ABS.2801.00 | 20 | AbsenceEntryFlow | `managerSchedulesAbsence()` → `essAddAbsence()` |
| HCM.ABS.1401.00 | 9 | AbsenceApprovalFlow | `managerApprovesAbsence()` |
| HCM.ABS.1201.00 | 6 | AbsenceEntryFlow | `employeeSubmitsAbsence()` → `essAddAbsence()` |
| HCM.ABS.2901.00 | 2 | AbsenceApprovalFlow | `hrSpecialistWithdrawsAbsence()` |
| (empty script) | 5 | Various | Routed by `businessProcess` keywords |
| Admin scripts (102-2401) | 21 | AbsenceAdminFlow | Individual methods per script |

### 5 Tests with No Script ID (routed by businessProcess)

| Category | Business Process | Routed To |
|---|---|---|
| HR Specialist | Withdraw Absence | AbsenceApprovalFlow → `hrSpecialistWithdrawsAbsence()` |
| HR Specialist | Disburses from Balance | AbsenceAdminFlow → `disburseBalance()` |
| Manager Self-Service | Manager Approval for Absences (FMLA Hourly) | AbsenceApprovalFlow → `managerApprovesAbsence()` |
| Manager Self-Service | Absence Entry for FMLA (Hourly) | AbsenceEntryFlow → `managerSchedulesAbsence()` |
| HR Specialist | Absence Entry for FMLA (Hourly) | AbsenceEntryFlow → `hrSpecialistAddsAbsence()` |

## Summary

- **No new flow routing needed** — all 85 tests are covered by existing flows
- **Withdrawal validation** is the highest-value API enhancement (5 tests affected, API available)
- **Enrollment/balance/scheduled process** validation limited to UI-only (no REST API endpoints)
- **Entry/approval** validation already uses the REST API effectively
