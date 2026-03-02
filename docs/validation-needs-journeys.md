# Journeys Module — Validation Needs

## Current State

- **36 testable tests** (72 "Not Started" minus 30 "Deferred" minus 6 empty rows from UAT_DATA)
- All 36 tests route through `resolveJourneyType()` in `journey-assignment.flow.ts`
- Routing types: onboarding (14), life-event (8), admin (6), transition (3), task-completion (2), offboarding (1), access-request (1), generic (1)
- OutcomeValidator currently falls through to `validateGeneric()` (no Journeys-specific handler)

## API Validation Status

- **Journeys REST API returns 403** for bot users — no `journeys` or `journeyTasks` endpoint access
- `GET /hcmRestApi/resources/latest/journeys` — 403 Forbidden
- Bot users lack the `ORA_PER_JOURNEYS_REST_SERVICE_ACCESS` privilege

## UI Validation (Current — Working)

OutcomeValidator's `validateGeneric()` checks for Oracle HCM error banners:
- `.af_message_error`, `[class*="AFError"]`, `.oj-message-error`, `[class*="error-message"]`
- This is sufficient for navigation-only tests (no field data exists for Journeys)

## Recommended Future Enhancements

```typescript
// TODO: Add API validation once REST API permissions are granted
// Add to OutcomeValidator.validate() dispatch:
//   else if (module.includes('journeys')) await this.validateJourneys(tc);

// private async validateJourneys(tc: UATTestCase): Promise<void> {
//   await this.verifyNoErrors();
//
//   // UI checks for journey assignment confirmation
//   const confirmation = this.page.locator(':text("successfully"), :text("assigned")').first();
//   const visible = await confirmation.isVisible({ timeout: 5000 }).catch(() => false);
//   if (visible) {
//     console.log(`[OutcomeValidator] ${tc.testId}: Journey assignment confirmed`);
//   }
//
//   // When API access is granted:
//   // const journeys = await hcmGet(this.page, `${this.baseUrl}/hcmRestApi/resources/latest/journeys`, this.creds);
//   // Verify journey assignment exists for the person
//   // Verify task status (completed/pending) matches expected outcome
// }
```

## Field Data Coverage

- **No field data** exists for Journeys tests (migration DB has no journey-specific tables)
- All tests use navigation-only mode: navigate to Journeys page → select tab → attempt action
- `fillFromTestCase(tc)` parses `testData` field for person name, template, dates, etc.
- Most `testData` fields reference test workers (e.g., "SUP_ONB_01") that may not exist in the HCM environment

## Test Distribution by Type

| Journey Type | Count | Flow Method | Notes |
|---|---|---|---|
| Onboarding | 14 | `executeOnboarding()` | Supported, hourly/salaried, volunteer |
| Life Event | 8 | `executeLifeEvent()` | Medical leave, marriage, SOSA, sabbatical, ADA |
| Admin | 6 | `executeAdminJourney()` | Mass assignment, cancellation, dept tree, job code |
| Transition | 3 | `executeTransition()` | Intern to RMO, international, internal hiring |
| Task Completion | 2 | `executeTaskCompletion()` | Progress tracking, task types |
| Offboarding | 1 | `executeOffboarding()` | Supported staff offboarding |
| Access Request | 1 | `executeAccessRequest()` | Oracle access, background checks |
| Generic | 1 | `executeGenericJourney()` | Fallback for unrecognized types |
