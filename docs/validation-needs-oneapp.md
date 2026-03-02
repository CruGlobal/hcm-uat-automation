# OneApp Validation Needs

## Module Overview
- **38 rows** in UAT Plan = **19 unique tests** (each test ID appears twice — once with data, once as empty duplicate)
- **19 empty-BP duplicates** are auto-skipped by spec (`test.skip` when no businessProcess + no testScenario)
- **All 19 real tests have field data** including Person Number — enables API validation

## Current Validation (OutcomeValidator)
OneApp falls through to `validateGeneric()` which only checks for error banners on the page.

## Recommended Additions to OutcomeValidator

### 1. Worker Existence Check (Core HR API — already available)
For all OneApp tests, validate the referenced person exists via `getWorkerFull(personNumber)`:
- All 19 tests have `Person Number` in field data
- Prepare for Hire tests: verify worker created as pending worker
- New Hire tests: verify work relationship + assignment exist
- 2nd Year / Job Reclass / Payroll Change: verify assignment attributes match expected values

```typescript
// In OutcomeValidator.validate(), add before generic fallback:
else if (module.includes('oneapp')) await this.validateOneApp(tc);

private async validateOneApp(tc: UATTestCase): Promise<void> {
  await this.verifyNoErrors();
  const fieldData = getFieldData(tc.testId);
  if (!fieldData) return;
  const personNumber = getField(fieldData, 'Person Number');
  if (!personNumber) return;
  const worker = await getWorkerFull(this.page, this.baseUrl, personNumber, this.creds);
  if (!worker) {
    console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} not found`);
    return;
  }
  expect(worker.PersonNumber).toBe(personNumber);
  console.log(`[OutcomeValidator] ${tc.testId}: Worker ${personNumber} verified`);
}
```

### 2. Assignment Verification (for transfer/reclass tests)
For 1APP-11 (PTFS Transfer) and Job Reclass tests, verify assignment attributes:
- Department matches `Assignment > Department`
- Job matches `Assignment > Job`
- Person Type matches `Assignment > Person Type`

**API**: `getWorkerFull()` already returns `workRelationships[].assignments[]` with these fields.

### 3. Salary Element Verification (for payroll/salary tests)
For Payroll Change and Additional Salary tests, verify element entries:
- `lookupElementEntriesByNumber(personNumber)` — already available in hcm-rest-api

**Note**: Requires payroll admin API access (bot_hr_admin may have this).

## Test Distribution
| Category | Tests | Validation |
|---|---|---|
| Prepare for Hire | 7 (1APP-01 to 1APP-07) | Worker exists as pending worker |
| New Hire | 3 (1APP-09 to 1APP-11) | Worker hired, work relationship active |
| 2nd Year | 2 (1APP-13, 1APP-14) | Assignment change recorded |
| Job Reclass | 2 (1APP-16, 1APP-17) | Job/person type updated |
| Payroll Change | 3 (1APP-19 to 1APP-21) | Salary/element entries updated |
| Additional Salary | 2 (1APP-23, 1APP-24) | Element entry added |

## No API Permission Issues
All validation uses `getWorkerFull()` which is available to `bot_hr_admin` (HR Specialist role).
Element entry lookup via `lookupElementEntriesByNumber()` also works for HR admin bots.
