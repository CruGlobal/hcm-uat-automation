# Tests TODO: NAV-ONLY and PARTIAL Implementations

Systematic audit of all test flows. Tests listed here navigate to the correct page but
don't perform the full action described in their test script. Organized by priority
(human-Passed false-positive risk first) and grouped by method for parallel work.

**Legend:**
- `[P]` = human-Passed in UAT Plan (false positive risk)
- `[F]` = human-Failed
- `[NS]` = Not Started
- `[D]` = Deferred
- `[C]` = Cancelled
- `[B]` = Blocked
- `[IP]` = In Progress
- `[FD]` = has field data from migration DB

---

## Priority 1: Human-Passed Tests at Risk (false positives)

### 1A. `executeWorkforceStructure` — PARTIAL (7 Passed / 35 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:589`
**What it does:** Navigates to Workforce Structures, clicks the relevant link (Jobs/Locations/etc), clicks "Add" button, then STOPS.
**What's missing:** No fields filled (Name, Code, Description, etc.), no Submit, no verification.
**Test scripts:** HCM.CORE.101-109

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-225 | [P][FD] | Location Change - Use Change Location |
| HR-226 | [P][FD] | Location Change - Use Change Location |
| HR-227 | [P][FD] | Location Change - Use Change Location |
| HR-544 | [P][FD] | Inactivate Job Code |
| HR-557 | [P][FD] | Approve Transaction |
| HR-558 | [P][FD] | Reject Transaction |
| HR-559 | [P][FD] | Request More Information on Transaction |
| Test 2 | [NS] | Change Job |
| HR-533 | [NS][FD] | Add AOR for Dept |
| HR-539 | [NS][FD] | Create new Dept in Tree |
| HR-540 | [NS][FD] | Update dept structure in Tree |
| HR-541 | [NS][FD] | Inactivate Depts and in tree |
| HR-542 | [NS][FD] | Update values on the Department |
| HR-543 | [NS][FD] | Add new Job Code |
| HR-545 | [NS][FD] | Update EIT values |
| HR-546 | [NS][FD] | Add new Location Code |
| HR-547 | [NS][FD] | Add new EIT values |
| HR-548 | [NS][FD] | Inactivate EIT values |
| HR-549 | [NS][FD] | Modify EIT values |
| HR-550 | [NS][FD] | Add or Modify Salary Grades |
| HR-553 | [NS][FD] | Mass Changes for Dept changes |
| HR-560 | [NS][FD] | Create new Job Family |
| HR-561 | [NS][FD] | Inactivate Job Family |
| HR-562 | [NS][FD] | Add/Update Position |
| HR-563 | [NS][FD] | Inactivate Position |
| HR-564 | [NS][FD] | Update Grade values |
| HR-565 | [NS][FD] | Add new Grade |
| HR-566 | [NS][FD] | Inactivate Grade |
| HR-567 | [NS][FD] | Create Department |
| HR-568 | [NS][FD] | Create Job |
| HR-569 | [NS][FD] | Create Location |
| HR-570 | [NS][FD] | Create Position |
| HR-571 | [NS][FD] | Create Grade |
| HR-572 | [NS][FD] | Create Job Family |
| HR-574 | [NS][FD] | Inactivate Location |

**Fix approach:** For create tests: fill Name + Code fields from testData/businessProcess, click Save/Submit. For inactivate tests: search existing item, set status to Inactive. For HR-225/226/227: fix routing — these are location changes, should use AssignmentChangeFlow (currently caught by "location" keyword before reaching executeChangeLocation). For approve/reject (HR-557/558/559): navigate to notifications bell and approve/reject pending transaction.

---

### 1B. `executePersonalInfoUpdate` — PARTIAL (5 Passed / 60 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:528`
**What it does:** Searches person, clicks Edit, but fills NO fields — submits empty change.
**What's missing:** Should fill at least one field based on business process (marital status, name, address, etc.).
**Test scripts:** HCM.CORE.218, HCM.CORE.3xx

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-115 | [P][FD] | Manage Employee Personal Information |
| HR-129 | [P][FD] | Name change |
| HR-231 | [P][FD] | Seniority Date Change - Use Seniority Dates |
| HR-250 | [P][FD] | Securing/Unsecuring - Staff Secure Status |
| HR-251 | [P][FD] | Securing/Unsecuring - Staff Secure Status |
| HR-114 | [NS][FD] | Manage Employee Personal Information |
| HR-116 | [NS][FD] | Manage Employee Personal Information |
| HR-117 | [NS][FD] | Manage Employee Personal Information |
| HR-118 | [NS][FD] | Manage Employee Personal Information |
| HR-119 | [NS][FD] | Manage Pending Worker Personal Information |
| HR-120 | [NS][FD] | Manage Pending Worker Personal Information |
| HR-121 | [NS][FD] | Manage Non Employee Personal Information |
| HR-122 | [F][FD] | Manage Non Employee Personal Information |
| HR-123 | [NS][FD] | Manage Non Employee Personal Information |
| HR-124 | [NS][FD] | Manage Employee Personal Information |
| HR-125 | [NS][FD] | Manage Pending Worker Employee Personal Information |
| HR-126 | [NS][FD] | Manager Non Employee Non Worker Personal Information |
| HR-127 | [NS][FD] | Add deceased date |
| HR-128 | [NS][FD] | Name change |
| HR-134 | [D][FD] | Send Payroll Options Forms to New Staff |
| HR-135 | [D][FD] | Send Payroll Options Forms to New Staff |
| HR-175 | [NS][FD] | Modify Pending Worker Employment Start Date |
| HR-176 | [NS][FD] | Modify Pending Worker Employment Start Date |
| HR-177 | [NS][FD] | Modify Pending Worker Employment Start Date |
| HR-178 | [NS][FD] | Modify Pending Worker Employment Start Dates |
| HR-179 | [NS][FD] | Modify employee Employment Start Date |
| HR-180 | [NS][FD] | Modify employee Employment Start Date |
| HR-181 | [NS][FD] | Modify employee Employment Start Dates |
| HR-182 | [NS][FD] | Modify employee Employment Start Dates |
| HR-183 | [NS][FD] | Modify Benefits Service Date - Use Seniority Dates |
| HR-232 | [NS][FD] | Seniority Date Change - Use Seniority Dates |
| HR-233 | [NS][FD] | Seniority Date Change - Use Seniority Dates |
| HR-249 | [B][FD] | Securing/Unsecuring - Staff Secure Status |
| HR-437 | [NS][FD] | Adjusting accrual rates of a paid employee |
| HR-459 | [NS][FD] | Verification of Employment |
| HR-460 | [NS][FD] | Verification of Employment |
| HR-506 | [NS][FD] | Update Staff Account and Designation Primary staff flag |
| HR-507 | [NS][FD] | Update Staff Account and Designation |
| HR-508 | [NS][FD] | Merging/Connecting Accounts |
| HR-509 | [NS][FD] | Splitting/Disconnecting Accounts |
| HR-510 | [NS][FD] | Update Crisis Management Info |
| HR-511 | [NS][FD] | Update Team Membership |
| HR-512 | [NS][FD] | Update Team Membership |
| HR-513 | [NS][FD] | Update Staff Secure Status |
| HR-514 | [NS][FD] | Update Service Recognition |
| HR-515 | [NS][FD] | Update Ethnic Ministry Fund |
| HR-516 | [NS][FD] | Update Care Giver |
| HR-517 | [NS][FD] | Update Care Giver |
| HR-518 | [NS][FD] | Update Staff Groups |
| HR-519 | [NS][FD] | Update Staff Groups |
| HR-520 | [NS][FD] | Update Training Status |
| HR-522 | [NS][FD] | Update Acknowledgements |
| HR-523 | [NS][FD] | Update Acknowledgements |
| HR-524 | [NS][FD] | Update Ministers Housing Allowance |
| HR-525 | [NS][FD] | Update Ministers Housing Allowance |
| HR-528 | [NS][FD] | Update Work Locations - (Addresses for Taxation) |
| HR-529 | [NS][FD] | Update Work Locations - (Addresses for Taxation) |
| HR-530 | [NS][FD] | View Legacy Employee Number |
| HR-556 | [NS][FD] | Mass Changes for Training status EIT info |
| Test 3 | [NS] | Update Staff Group Values |

**Fix approach:** Sub-route by business process. For "Name change": fill First/Last Name fields. For "Seniority Date": fill date field. For "Manage Personal Info": open Personal Details section, verify fields editable. For EIT updates (HR-506 through HR-525): navigate to More Information > Extra Information and fill the relevant EIT. For "Verification of Employment": this is view-only, so verifying the person page loads is correct.

---

### 1C. `executeCourseEnrollment` — PARTIAL (1 Passed / 1 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:1312`
**What it does:** Opens Learning, fills person name and course name fields, but never clicks Submit/Enroll.
**What's missing:** Click the Enroll/Submit button after filling fields.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-521 | [P][FD] | Course Student Enrollment |

**Fix approach:** After filling person and course fields, click "Enroll" or "Submit" button.

---

## Priority 2: PARTIAL Methods (have some action, but incomplete)

### 2A. `executeSalaryChange` — PARTIAL (1 Passed / 19 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:1035`
**What it does:** Searches person, opens "Manage Salary" action, clicks Continue, clicks Submit — but fills no salary fields.
**What's missing:** Should fill salary amount, effective date, action reason from field data.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-427 | [P][FD] | Pay Change Intern |
| HR-419 | [NS][FD] | Pay Change Hourly |
| HR-420 | [NS][FD] | Pay Change Hourly |
| HR-421 | [NS][FD] | Pay Change Hourly |
| HR-422 | [NS][FD] | Pay Change Salaried |
| HR-423 | [NS][FD] | Pay Change Salaried |
| HR-424 | [NS][FD] | Pay Change Salaried |
| HR-425 | [C][FD] | Pay Change Intern |
| HR-426 | [NS][FD] | Pay Change Intern |
| HR-428 | [C][FD] | Pay Change PTFS |
| HR-429 | [NS][FD] | Pay Change PTFS |
| HR-430 | [NS][FD] | Pay Change PTFS |
| HR-431 | [D][FD] | Pay Change for Staff |
| HR-432 | [D][FD] | Pay Change for Staff |
| HR-433 | [D][FD] | Pay Change for Staff |
| HR-434 | [D][FD] | Pay Change for Staff - non RMO Spouse |
| HR-435 | [D][FD] | Pay Change for Staff - non RMO Spouse |
| HR-436 | [D][FD] | Pay Change for Staff - non RMO Spouse |
| HR-554 | [NS][FD] | Mass Changes for Pay Changes |

**Fix approach:** Use field data to fill Salary Amount, Salary Basis, Effective Date, Action Code before clicking Submit. Similar to how CompensationManagementFlow fills salary fields.

---

### 2B. `executeManagerChange` — PARTIAL (0 Passed / 4 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:428`
**What it does:** Searches person, opens "Change Manager" dialog, tries to fill manager name, clicks Submit. But the dialog interaction may not work correctly (no manager name from field data).
**What's missing:** Should fill manager name from field data or testData.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-184 | [NS][FD] | Supervisor change - enter as a Manager Change |
| HR-185 | [NS][FD] | Supervisor change - enter as a Manager Change |
| HR-186 | [NS][FD] | Supervisor change - enter as a Manager Change |
| HR-187 | [NS][FD] | Supervisor change - enter as a Manager Change |

**Fix approach:** Extract manager name from field data and fill the Manager Name LOV field in the Change Manager dialog.

---

### 2C. `comp:handleGradeStepProgression` — PARTIAL (0 Passed / 4 total)

**File:** `src/flows/compensation/compensation-management.flow.ts:357`
**What it does:** Calls runGradeStepProgression(), fills Grade field if visible, takes screenshot. No Submit.
**What's missing:** Click Submit/Save after filling grade.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| WC-007 | [D][FD] | Update Wage Structures |
| WC-013 | [NS][FD] | Minimum Wage compliance |
| WC-014 | [NS][FD] | Merit Calculation |
| WC-041 | [NS][FD] | Workforce Compensation |

---

### 2D. `comp:handleWageRange` — NAV-ONLY (0 Passed / 7 total)

**File:** `src/flows/compensation/compensation-management.flow.ts:374`
**What it does:** Calls massChangeSalaries(), logs salary info, takes screenshot. No action.
**What's missing:** Should verify or update wage range data.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| WC-003 | [NS][FD] | Wage Range Workflow |
| WC-004 | [NS][FD] | Wage Range Workflow |
| WC-008 | [NS][FD] | Merit Planning |
| WC-009 | [NS][FD] | Merit Planning |
| WC-015 | [NS][FD] | Statement Edits/Generation |
| WC-040 | [NS][FD] | Workforce Compensation |
| WC-043 | [NS][FD] | Workforce Compensation |

---

### 2E. Payroll script-based routes — PARTIAL (1 Passed / 8 total)

**File:** `src/flows/payroll/payroll-processing.flow.ts`
**What they do:** Navigate to Scheduled Processes or Absence Admin, attempt to schedule a process, but many page methods throw or silently catch errors.

| Test ID | Status | Method | Business Process |
|---------|--------|--------|-----------------|
| PY-075 | [P][FD] | executeCoreHRPayrollScenario (MHA) | PA wages and Minister's Housing Allowance |
| PY-002 | [IP][FD] | executeCoreHRPayrollScenario (leave) | Unpaid Leave |
| PY-041 | [NS][FD] | executeCoreHRPayrollScenario (hire) | New Hire Reporting |
| PY-052 | [NS][FD] | executeCoreHRPayrollScenario (leave) | Leave accruals |
| PY-053 | [NS][FD] | executeCoreHRPayrollScenario (leave) | Leave accruals |
| PY-038 | [NS][FD] | executeYearEnd | W-2 Process |
| PY-039 | [NS][FD] | executeYearEnd | W-2 Corrections |
| PY-040 | [NS][FD] | executeYearEnd | Generate W-2 files |

---

## Priority 3: NAV-ONLY Methods (0 human-Passed, lower risk)

### 3A. `executeGenericHRAction` — NAV-ONLY (0 Passed / 14 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:1100`
**What it does:** Navigates to Person Management, searches for person, waits 5 seconds. No action.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-174 | [NS][FD] | National applies to come on full time staff |
| HR-461 | [NS][FD] | MHA query for pending requests |
| HR-462 | [NS][FD] | MHA query for participation |
| HR-463 | [NS][FD] | MHA query for roll over |
| HR-464 | [NS][FD] | MHA requirement updates |
| HR-465 | [NS][FD] | MHA Approvals |
| HR-531 | [NS][FD] | Add Security Role |
| HR-532 | [NS][FD] | Update staff member role |
| HR-534 | [NS][FD] | Add AOR for Team |
| HR-535 | [NS][FD] | Add AOR for International HR Partner |
| HR-536 | [NS][FD] | Remove/Inactivate Security Roles |
| HR-537 | [NS][FD] | Update Roles with new rights |
| HR-538 | [NS][FD] | Run any Processes to update roles |
| HR-551 | [NS][FD] | Error One App Tax Code |

**Fix approach:** Sub-route by business process. MHA tests (HR-461-465): navigate to MHA-specific pages. Security role tests (HR-531-538): navigate to Security Console and search for role. HR-174: navigate to Pending Workers dashboard.

---

### 3B. `executeApprovalDelegation` — NAV-ONLY (0 Passed / 4 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:786`
**What it does:** Opens Navigator, clicks "Approval Delegations" link, waits 5 seconds.
**What's missing:** Should create or configure a delegation.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-455 | [NS][FD] | Approval Delegations |
| HR-456 | [NS][FD] | Approval Delegations |
| HR-457 | [NS][FD] | Approval Delegations |
| HR-458 | [NS][FD] | Approval Delegations |

---

### 3C. `executeMassUpdate` — NAV-ONLY (0 Passed / 1 total)

**File:** `src/flows/core-hr/core-hr-uat.flow.ts:700`
**What it does:** Goes to Person Management, clicks "Mass Updates" text (with catch), waits.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| HR-552 | [NS][FD] | Mass Changes for Job Changes |

---

### 3D. `jr:executeAdminJourney` — PARTIAL (0 Passed / 18 total)

**File:** `src/flows/journeys/journey-assignment.flow.ts:263`
**What it does:** For mass assignment: goes to Explore tab + screenshot. For cancellation/closure: searches person in Organization Journeys + clicks first result. No actual admin action performed.

| Test ID | Status | Business Process |
|---------|--------|-----------------|
| JR-022 | [D][FD] | Annual Agreement / Annual Vows Renewal |
| JR-024 | [D][FD] | Dept Tree Add/Change Request Journey |
| JR-025 | [D][FD] | Dept Tree Add/Change Request Journey |
| JR-026 | [D][FD] | Manager View & Reassignment After Manager Change |
| JR-027 | [NS][FD] | Multiple Concurrent Journeys |
| JR-028 | [NS][FD] | Eligibility & Security - Negative Journey Assignment |
| JR-030 | [NS][FD] | Journey Cancellation / Closure |
| JR-031 | [D][FD] | Hourly/Salaried 1st-90th Day Journey |
| JR-035 | [D][FD] | Job Code Add/Change Request Journey |
| JR-036 | [D][FD] | Job Code Add/Change Request Journey |
| JR-037 | [D][FD] | Job Code Add/Change Request Journey |
| JR-038 | [D][FD] | Job Code Add/Change Request Journey |
| JR-040 | [D][FD] | Annual Agreement / Annual Vows - Reminder and Non-Completion |
| JR-044 | [NS][FD] | Mass Assignment of Journeys via Explore/Launchpad |
| JR-045 | [C][FD] | Contextual Journey for Manager Transaction |
| JR-046 | [NS][FD] | Journeys and Document Records - Attachments |
| JR-047 | [D][FD] | Synchronize Journey Template Changes |
| JR-048 | [D][FD] | Journey Error Handling and Troubleshooting |

---

### 3E. Other Functions — all NAV-ONLY (0 Passed / 4 total)

**File:** `src/flows/other/other-functions.flow.ts`

| Test ID | Status | Method | Business Process |
|---------|--------|--------|-----------------|
| OF-001 | [NS][FD] | executeAORSecurity | AOR Security |
| OF-002 | [NS][FD] | executeRoleSecurity | Role Security |
| OF-003 | [NS][FD] | executeMassUpload | Mass Uploads |
| OF-004 | [NS][FD] | executeMassUpload | Mass Uploads |

---

## Dead Code (0 tests route here — fix routing or remove)

These methods exist but are never reached because earlier patterns in the if/else chain match first.

| Method | File:Line | Preempted By |
|--------|-----------|-------------|
| `executePromotion` | core-hr-uat.flow.ts:766 | "DEPT:Promotion" tests match "transfer" first |
| `executeChangeLocation` | core-hr-uat.flow.ts:635 | "Change Location" tests match "location" in executeWorkforceStructure |
| `executeManagerSelfService` | core-hr-uat.flow.ts:1054 | All manager tests caught by earlier BP patterns |
| `executeEmployeeSelfService` | core-hr-uat.flow.ts:1082 | All employee tests caught by earlier BP patterns |
| `executeWorkSchedule` | core-hr-uat.flow.ts:1022 | No tests have "work schedule" in BP |
| `comp:handleWageStructure` | compensation-management.flow.ts:392 | All matching tests hit script-based routing first |

**Fix approach:** Either fix the routing order so these methods ARE reached for appropriate tests (e.g., HR-225/226/227 should route to executeChangeLocation, not executeWorkforceStructure), or remove the dead code.

---

## Summary

| Priority | Category | Tests | Human-Passed | Methods |
|----------|----------|------:|------------:|--------:|
| P1 | False positive risk | 96 | 14 | 3 |
| P2 | Partial (incomplete action) | 42 | 2 | 5 |
| P3 | NAV-ONLY (0 Passed) | 41 | 0 | 5 |
| -- | Dead code | 0 | 0 | 6 |
| **Total** | | **179** | **16** | **19** |

**179 tests** across **13 active methods** need implementation work.
**16 human-Passed tests** are at risk of being false positives.
**6 dead-code methods** should be fixed (routing) or removed.
