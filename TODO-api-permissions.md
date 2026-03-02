# REST API Permissions — RESOLVED

## Summary

All Oracle HCM REST API endpoints are now accessible using:
- **Username:** `josh.starcher@cru.org` (email format required by OWSM)
- **Password:** `WinBuildSend!1951@cru`
- **Auth method:** HTTP Basic Auth via Node.js `https` module (NOT Playwright `page.request`)

## Key Findings

1. **OWSM (Oracle Web Services Manager)** protects the REST API at `realm="owsm"`
2. Bot users (`uat.bot_*`) do NOT work for REST API — only federated users with email-format usernames
3. The `page.request.get()` approach (Playwright) was returning 401 for ALL users — switched to Node.js `https`
4. All major HCM modules now have working API validation

## Endpoint Status

| Module | Endpoint | Status | Data Available |
|--------|----------|--------|----------------|
| Core HR | workers, publicWorkers | ✅ 200 | Worker records, work relationships, emails |
| Absence | absences | ✅ 200 | Absence records with status/approval |
| Payroll | elementEntries | ✅ 200 | Element entries with person/dates |
| Benefits | benefitEnrollments + 6 LOVs | ✅ 200 | Enrollment records, plan details |
| Compensation | salaries, eligiblePlansLOV | ✅ 200 | Salary records, eligible plans |
| Time & Labor | timeRecordGroups, timeRecordEventRequests | ✅ 200 | Time record groups |
| Journeys | journeys, allocatedChecklists | ✅ 200 | Journey templates, assigned checklists |
| Approvals/SAA | businessProcessApprovalUsers | ✅ 200 | Approval user data |
| Reference | locations, departments, jobs, grades | ✅ 200 | Org structure data |
| Admin | rolesLOV, userAccounts | ✅ 200 | Role lookup, user accounts |

## Files Updated

- `scripts/lib/hcm-rest-api.ts` — Switched from Playwright `page.request` to Node.js `https`; updated credentials; added `lookupBenefitEnrollments*`, `lookupSalaries*`, `lookupTimeRecords`, `lookupAllocatedChecklists*`
- `src/validation/outcome-validator.ts` — Added API validation for Benefits, Compensation, Time & Labor, Journeys, MPDX, and SAA modules (previously UI-only fallbacks)
