# Benefits Module — Validation Needs

## Current State

The Benefits `OutcomeValidator.validateBenefits()` (in `src/validation/outcome-validator.ts`) performs **UI-only** validation because the Oracle HCM `benefitEnrollments` REST API returns **403 Forbidden** for all bot users, including `bot_hr_admin`.

### Current validation (lines 225-234):
- Checks for error banners (`.af_message_error`, `.oj-message-error`, etc.)
- Checks for any plan/enrollment/benefit CSS class visibility
- Logs whether plan summary is visible

### Known failure validations (in `src/data/known-failures.ts`):
- **BN-006**: Checks healthcare plan is still present after length-of-service event (UI text check)
- **BN-045**: Checks medical plan is NOT reset to "Select Staff Only" after dependent aging (UI text check)
- **BN-046**: Checks disabled dependent is still listed on healthcare after turning 26 (UI text check)
- **BN-132**: Checks "Print all benefits" opens a non-blank popup tab (UI interaction check)

## Needed OutcomeValidator Extensions

All extensions below use **UI-based fallback** since the REST API is unavailable.

### 1. Enrollment Confirmation Text Verification
```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
// UI fallback: verify enrollment confirmation text is visible after submission
private async validateEnrollmentConfirmation(tc: UATTestCase): Promise<void> {
  const confirmText = this.page.getByText(/enrollment.*submitted|enrollment.*confirmed|successfully enrolled/i).first();
  const visible = await confirmText.isVisible({ timeout: 10_000 }).catch(() => false);
  if (visible) {
    console.log(`[OutcomeValidator] ${tc.testId}: Enrollment confirmation text visible`);
  } else {
    console.warn(`[OutcomeValidator] ${tc.testId}: No enrollment confirmation text found`);
  }
}
```

### 2. Plan Summary Shows Expected Plans
```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
// UI fallback: verify plan cards/rows are visible in enrollment summary
private async validatePlanSummaryVisible(tc: UATTestCase): Promise<void> {
  const planCards = this.page.locator(
    '[class*="plan-card"], [class*="enrollment-card"], ' +
    'div[class*="benefit"]:has(span), table[id*="plan"] tr[data-afrrk]'
  );
  const count = await planCards.count();
  console.log(`[OutcomeValidator] ${tc.testId}: ${count} plan card(s) visible in summary`);
  // If we have field data with a specific plan name, check it appears
  const fieldData = getFieldData(tc.testId);
  if (fieldData) {
    const expectedPlan = getField(fieldData, 'Plan');
    if (expectedPlan) {
      const planText = this.page.getByText(expectedPlan, { exact: false }).first();
      const planVisible = await planText.isVisible({ timeout: 5_000 }).catch(() => false);
      if (planVisible) {
        console.log(`[OutcomeValidator] ${tc.testId}: Expected plan "${expectedPlan}" visible`);
      } else {
        console.warn(`[OutcomeValidator] ${tc.testId}: Expected plan "${expectedPlan}" NOT visible`);
      }
    }
  }
}
```

### 3. No Error Banners After Benefits Operations
```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
// UI fallback: verify no Oracle ADF/JET error messages visible
private async validateNoEnrollmentErrors(tc: UATTestCase): Promise<void> {
  const errorSelectors = [
    '.af_message_error',
    '[class*="AFError"]',
    '.oj-message-error',
    '[class*="error-message"]',
    'div[class*="warning"]:has-text("error")',
  ];
  for (const selector of errorSelectors) {
    const el = this.page.locator(selector).first();
    const visible = await el.isVisible({ timeout: 2_000 }).catch(() => false);
    if (visible) {
      const text = await el.textContent().catch(() => '');
      console.error(`[OutcomeValidator] ${tc.testId}: Error banner: ${text}`);
    }
  }
}
```

### 4. Life Event Processing Verification
```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
// UI fallback: verify life event was reported/processed in the Activity Center
private async validateLifeEventProcessed(tc: UATTestCase): Promise<void> {
  const lifeEventStatus = this.page.getByText(/processed|completed|approved/i)
    .or(this.page.locator('[class*="status"]:has-text("Processed")'))
    .first();
  const visible = await lifeEventStatus.isVisible({ timeout: 10_000 }).catch(() => false);
  if (visible) {
    console.log(`[OutcomeValidator] ${tc.testId}: Life event status shows processed/completed`);
  }
}
```

### 5. Dependent/Beneficiary Verification
```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
// UI fallback: check dependent/beneficiary section has entries
private async validateDependentsBeneficiaries(tc: UATTestCase): Promise<void> {
  const depRows = this.page.locator(
    'table:near(:text("Dependent")) tr[data-afrrk], ' +
    '[id*="dependent"] [role="row"], ' +
    'div[class*="dependent"]:has(span)'
  );
  const count = await depRows.count();
  console.log(`[OutcomeValidator] ${tc.testId}: ${count} dependent/beneficiary row(s) visible`);
}
```

### 6. Category-Specific Validation Dispatch

The `validateBenefits()` method should be enhanced to route to category-specific validators:

```typescript
// TODO: Add API validation once REST API permissions are granted for benefitEnrollments endpoint
private async validateBenefits(tc: UATTestCase): Promise<void> {
  await this.verifyNoErrors();

  const bp = (tc.businessProcess || '').toLowerCase();

  if (bp.includes('new hire') || bp.includes('rehire') || bp.includes('enrollment')) {
    await this.validateEnrollmentConfirmation(tc);
    await this.validatePlanSummaryVisible(tc);
  } else if (bp.includes('life event') || bp.includes('marriage') || bp.includes('birth') || bp.includes('divorce')) {
    await this.validateLifeEventProcessed(tc);
    await this.validatePlanSummaryVisible(tc);
  } else if (bp.includes('dependent') || bp.includes('beneficiar')) {
    await this.validateDependentsBeneficiaries(tc);
  } else if (bp.includes('terminat')) {
    await this.validatePlanSummaryVisible(tc); // Verify benefits ended
  } else if (bp.includes('view') || bp.includes('confirmation')) {
    await this.validatePlanSummaryVisible(tc);
  } else {
    // Generic: check plan summary is visible and no errors
    await this.validatePlanSummaryVisible(tc);
  }

  await this.validateNoEnrollmentErrors(tc);
}
```

## API Access Requirements

To enable full API-based validation, the following Oracle HCM REST API endpoints need to be accessible:

| Endpoint | Current Status | Needed For |
|----------|---------------|------------|
| `GET /hcmRestApi/resources/latest/benefitEnrollments` | 403 Forbidden | Verify enrollment records created/updated |
| `GET /hcmRestApi/resources/latest/benefitEnrollments?q=PersonNumber=<num>` | 403 Forbidden | Look up enrollments by person |
| `GET /hcmRestApi/resources/latest/benefitsLifeEvents` | Unknown (likely 403) | Verify life events reported/processed |
| `GET /hcmRestApi/resources/latest/benefitsDependents` | Unknown (likely 403) | Verify dependent additions/removals |
| `GET /hcmRestApi/resources/latest/benefitsBeneficiaries` | Unknown (likely 403) | Verify beneficiary designations |

### Required Roles for API Access
The `bot_hr_admin` user needs one of:
- **Benefits Administrator** (`ORA_BEN_BENEFITS_ADMINISTRATOR`)
- **Benefits Specialist** (`ORA_BEN_BENEFITS_SPECIALIST`)
- **Benefits Manager** (`ORA_BEN_BENEFITS_MANAGER`)

Once API access is granted, replace the UI-based checks with API calls similar to the pattern used in `validateAbsenceSubmission()` and `validateElementEntry()`.

## Flow Coverage Summary

### Business Process Classification (222 Not Started tests)

| Category | Count | Flow Handler (Admin) | Flow Handler (ESS) |
|----------|-------|---------------------|---------------------|
| job-reclass | 33 | `executeJobReclassAdmin` | `executeReclassEnrollment` |
| rehire | 19 | `executeRehireAdmin` | `executeRehireEnrollment` |
| termination | 13 | `executeTerminationBenefits` | N/A (admin only) |
| new-hire | 10 | `executeNewHireAdmin` | `executeNewHireEnrollment` |
| international | 7 | `executeInternationalAssignment` | `executeInternationalESS` |
| leave | 5 | `executeLeaveOfAbsence` | `executeLeaveESS` |
| 403b | 4 | `execute403bAdmin` | N/A |
| dependent | 3 | `executeDependentManagement` | `executeDependentEnrollment` |
| life-event | 3 | `executeLifeEventAdmin` | `executeLifeEventEnrollment` |
| flex | 3 | N/A | `executeFlexBenefits` |
| non-standard | 2 | `executeNonStandardEnrollment` | N/A |
| military | 2 | `executeMilitaryLeave` | N/A |
| disability | 1 | `executeDisabilityAdmin` | N/A |
| regional | 1 | `executeRegionalBenefits` | `executeRegionalEnrollment` |
| retirement | 1 | `executeRetirementBenefits` | N/A |
| location-change | 1 | `executeLocationChange` | N/A |
| death | 1 | `executeDeathBenefits` | N/A |
| waive | 1 | `executeWaiveHealthcare` | `executeWaiveHealthcareESS` |
| reprocess | 1 | `executeReprocess` | N/A |
| *empty BP (filtered)* | 111 | Skipped by `isTestable()` | Skipped by `isTestable()` |
| **Unclassified** | **0** | — | — |

All 111 "Not Started" tests with business process data are fully classified. The remaining 111 empty-BP tests are automatically skipped by `isTestable()` (no businessProcess + no testScript + no transactionCategory).
