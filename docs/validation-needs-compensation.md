# Compensation Module — Validation Needs

## API Status

The Compensation REST API (`compensationChanges`, `salaryHistory`) returns **403 Forbidden** for bot users. This matches the pattern seen with Benefits (`benefitEnrollments`) and Time & Labor (`timecards`).

```
// TODO: Add API validation once REST API permissions are granted for compensationChanges endpoint
```

## Current Validation (UI-based)

The `OutcomeValidator.validateGeneric(tc)` method is used for all Compensation tests:
- Checks for Oracle HCM error banners (`.af_message_error`, `[class*="AFError"]`, `.oj-message-error`)
- Throws on visible errors, passes silently otherwise

## Recommended Validation Extensions

When API access is available, add a `validateCompensation(tc)` method to `OutcomeValidator`:

### 1. Salary Change Confirmation
- After Base Pay changes (COMP.102), verify salary amount via `salaryHistory` API
- Compare submitted amount against API response
- Check effective date matches

### 2. Compensation Plan Status
- After Workforce Compensation Planning (COMP.401-408), verify plan status
- Check budget allocation amounts
- Verify approval workflow status

### 3. Individual Compensation
- After ICP allocation (COMP.3xx), verify bonus/one-time payment record exists
- Check amount, component, and effective date

### 4. Total Compensation Statement
- After statement generation (COMP.5xx), verify statement exists for the period
- Check statement includes expected compensation components

### 5. UI Fallback Checks (Available Now)
These can be added without API access:
- Verify comp change confirmation toast/message after submit
- Check salary update visible in salary history table
- Verify "successfully submitted" or "saved" confirmation text
- Screenshot comparison for compensation plan worksheets

## Test Coverage Summary

| Business Process | Tests | Script Range | Routing |
|---|---|---|---|
| Base Pay | 6 | COMP.1xx | handleBasePay |
| Individual Compensation | 6 | COMP.3xx | handleIndividualCompensation / handleICP |
| Workforce Compensation | 14 | COMP.4xx | handleCompensationPlanning |
| Total Compensation | 9 | COMP.5xx | handleTotalCompensation |
| Merit Planning/Calc | 5 | COMP.4xx | handleCompensationPlanning |
| Bonuses | 2 | COMP.3xx | handleBonus |
| View Employee History | 2 | COMP.105 | handleHistory |
| Wage Range/Min Wage | 3 | COMP.411/414 | handleWageRange |
| Update Wage Structures | 1 | COMP.2xx | handleWageStructure |
| Creating Job Code | 3 | CORE.101 | handleJobCode |
| Statement Edits/Gen | 1 | COMP.409+ | handleHistory/handleTotalCompensation |
| Empty metadata | 52 | (none) | handleGeneric |
| **Total** | **104** | | |
