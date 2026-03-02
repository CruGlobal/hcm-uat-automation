# Payroll Validation Needs

## Current State

- **226 total Payroll tests** in UAT Plan
- **113 testable** (have businessProcess, testScript, or transactionCategory)
- **113 skipped** by `isTestable()` (empty placeholder rows with no BP/script/category)
- All 113 testable tests have field data from migration DB

### Routing Breakdown
| Route | Count | Handler |
|-------|-------|---------|
| Element Entry (field data with Search For + Element name) | 108 | `ElementEntryFlow` |
| Core HR tab (leave, hire, MHA scenarios) | 5 | `executeCoreHRPayrollScenario()` |
| **Total testable** | **113** | |

### Business Process Categories (Priority 3 fallback routing)
| Category | Script IDs | Example BPs |
|----------|-----------|-------------|
| Payroll Run | PAY.510 | Semi-monthly, Hourly, RMO Salary Change, FLI/STT, SECA |
| Off-Cycle Payroll | PAY.106, PAY.103, PAY.520 | Bonus, Additional Salary, Back Pay, ADC, Severance, Disability |
| W-4 / Tax Forms | PAY.113, PAY.602 | ESS W-4, MSS W-4, SECA, Tax Overrides/Refunds |
| Calculation Card | PAY.114 | International/PA/OH Staff cards |
| Costing/Config | PAY.301 | Hourly/Salary designation, Configuration |
| Direct Deposit | PAY.111 | Direct Deposit setup |
| Check Processing | PAY.324, PAY.418 | Reverse/Reissue, Create and Print, Stale Dated |
| Tax Management | PAY.307, PAY.422 | Tax Adjustments, Tax Payment File |
| Pay Advice | PAY.419 | Generate Advice |
| DD File | PAY.417 | Run Direct Deposit File |
| Year End | Year End Process | W-2 Process/Corrections/Files |
| 403b Loan | PAY.309 | 403B Loan Payback |
| Multi-State Tax | PAY.316 | Multi-state taxes/reciprocity |
| ACH Returns | PAY.325 | ACH Returns |
| ESS Tax | (no script) | ESS Tax Location Update |
| State FLI | PAY.510 | CO/OR/WA/MN/NY/CT/ME/DE/VT FLI |
| Leave | (varies) | Unpaid Leave of Absence/Return From Leave |
| Hire Reporting | (varies) | New Hire Reporting |

## API Validation (Already Implemented)

### Element Entry API
- **Endpoint**: `lookupElementEntriesByNumber(personNumber)` from `scripts/lib/hcm-rest-api.ts`
- **REST path**: `/hcmRestApi/resources/latest/elementEntries?q=PersonId={id}&onlyData=true`
- **Coverage**: All 108 element entry tests
- **Current checks**:
  - Verifies element entries exist for the person
  - Matches element name from field data against returned entries
  - Logs match/mismatch counts

### Validation Flow in OutcomeValidator
```
validatePayroll(tc)
  → if fieldData has "Search For" + "Element name": validateElementEntry()
  → else: verifyNoErrors() (UI-only)
```

## Recommended Validation Enhancements

### 1. Effective Date Matching
- Field data provides `Effective date` (Excel serial → MM/DD/YYYY)
- Element entry API returns `EffectiveStartDate` and `EffectiveEndDate`
- **Enhancement**: Compare converted effective date against entry's `EffectiveStartDate`
- **Effort**: Low — date conversion already exists via `excelSerialToDate()`

### 2. Element Entry Value Verification
- Some tests include `Amount` in field data
- Element entry API returns entry values in nested `elementEntryValues` collection
- **Enhancement**: After confirming element exists, verify the entry value matches expected amount
- **Effort**: Medium — need to expand `ElementEntryRecord` type to include values

### 3. Scheduled Process Status Tracking
- 5 non-element-entry tests route to Scheduled Processes (leave, hire reporting)
- Currently validated UI-only via `verifyNoErrors()`
- **Enhancement**: Use `/hcmRestApi/resources/latest/ess/processRequests` to check process status
- **Effort**: Medium — new API endpoint, need to identify process request ID

### 4. Person Number Resolution for Element Entry Tests
- 108 element entry tests use "Search For" (employee name) but may not have Person Number in field data
- API validation requires Person Number
- **Enhancement**: Add name-to-number resolution via `workers` API before element entry lookup
- **Effort**: Low — `lookupPersonId()` already exists but needs name-based search variant

## Known Limitations

1. **Bot access**: Payroll admin bots (`bot_payroll_admin`) have element entry access but may lack Scheduled Processes admin privileges
2. **113 empty tests**: Placeholder rows with no data — cannot be made testable without UAT Plan updates
3. **Off-cycle payroll**: Process name varies by Oracle HCM environment ("Calculate QuickPay" vs "Run QuickPay")
4. **Year End processes**: May only work during year-end periods (W-2 generation is seasonal)
