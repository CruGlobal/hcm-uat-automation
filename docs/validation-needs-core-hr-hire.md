# Validation Needs: Core HR Hire/Add Flows

## Overview

152 hire/add-related tests across 87 unique business processes. 154/155 have field data from the migration DB. These tests cover:

- **Hire an Employee** (78 tests) — new hires: hourly, salaried, staff, PTFS, interns, national expatriates
- **Create Work Relationship** (49 tests) — rehires via CWR: within 12 months, after a year, with/without designation numbers
- **Assignment Change** (16 tests) — status changes, department changes for non-employees
- **Document Management** (10 tests) — document submission/editing for pending employees and non-employees

## API Validations by Business Process Type

### 1. Hire an Employee

**API Call**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber={personNumber}`

**Verify**:
- Worker exists (PersonNumber matches)
- `WorkRelationships[0].WorkRelationshipType` = "Employee" (or appropriate type)
- `WorkRelationships[0].StartDate` matches the hire date from test data
- `WorkRelationships[0].LegalEmployerName` matches "Legal Employer" field data
- `Assignments[0].AssignmentStatusType` = "ACTIVE"
- `Assignments[0].BusinessUnitName` matches "Business Unit" field data
- `Assignments[0].DepartmentName` matches "Department" field data (if provided)
- `Assignments[0].LocationCode` matches "Location" field data (if provided)
- `Assignments[0].JobName` matches "Job" field data (if provided, may be empty)

**Business Process Variants**:
| Pattern | Count | Person Type |
|---------|-------|-------------|
| Hire Hourly FT/PT Reg/Temp | 20 | Employee |
| Hire Salaried FT/PT Reg | 12 | Employee |
| Hire New Staff Raising Support | 4 | Employee - Staff |
| Hire Full Time Staff | 6 | Employee - Staff |
| Hire Part Time Field Staff | 2 | Employee - PTFS |
| Hire National Expatriate | 2 | Employee - National Expat Staff |
| Hire Early Payroll Staff | 2 | Employee - Staff |
| Hiring US/International Interns | 4 | Employee (Intern) |
| Pre-Hire (Add Pending Worker) | 2 | Pending Worker |
| New Hire (generic) | 1 | Employee |

### 2. Add a Pending Worker

**API Call**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber={personNumber}`

**Verify**:
- Worker exists (PersonNumber matches)
- `WorkRelationships[0].WorkRelationshipType` = "Pending Worker"
- `WorkRelationships[0].StartDate` matches the proposed start date
- `WorkRelationships[0].LegalEmployerName` matches "Legal Employer" field data

**Business Process Variants**:
| Pattern | Count |
|---------|-------|
| Add Staff Applicant (SA) - Pending | 1 |
| Add Employee - Staff Non RMO Spouse applicant | 1 |
| Add PTFS applicant | 1 |
| Add US/International Intern applicant | 2 |
| Add Pending Worker | 1 |

### 3. Add a Nonworker

**API Call**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber={personNumber}`

**Verify**:
- Worker exists (PersonNumber matches)
- `WorkRelationships[0].WorkRelationshipType` = "Nonworker"
- `Assignments[0].PersonTypeName` matches expected type (Affiliate, Volunteer, Consultant, etc.)
- `Assignments[0].BusinessUnitName` is set (required for non-workers)

**Business Process Variants**:
| Pattern | Count | Non-Worker Type |
|---------|-------|-----------------|
| Add Affiliate applicant | 2 | Affiliate |
| Add Non Employee - Consultant | 1 | Consultant |
| Add Volunteer | 1 | Volunteer |
| Add National Staff as Non-Employee | 2 | National Staff |
| Add Subsidiary as non-employee | 1 | Subsidiary |
| Add Dependent Continuing Coverage | 1 | Non-Employee |

### 4. Create Work Relationship (Rehire)

**API Call**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber={personNumber}&expand=WorkRelationships,Assignments`

**Verify**:
- Worker exists (PersonNumber matches)
- Worker has a NEW WorkRelationship (count increased by 1)
- Latest `WorkRelationships[].StartDate` matches the rehire date
- Latest `WorkRelationships[].WorkRelationshipType` = "Employee"
- Latest `Assignments[].AssignmentStatusType` = "ACTIVE"
- Latest `Assignments[].LegalEmployerName` matches field data

**Business Process Variants** (49 tests):
| Pattern | Count | Notes |
|---------|-------|-------|
| Rehire hourly FT/PT within/after 12 months | 14 | With/without designation |
| Rehire salaried FT/PT within/after year | 14 | With/without designation |
| Rehire Full Time Supported Staff | 6 | Primary/secondary member of couple |
| Rehire Full Time Staff Non RMO Spouse | 4 | Within/after 12 months |
| Rehire PTFS within/after year | 4 | Part Time Field Staff |
| Rehire US Intern within/after year | 4 | Intern rehires |
| Rehire Hourly PT Temporary | 2 | Temp rehires |

### 5. Pending to Hire (Convert)

**API Call**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber={personNumber}`

**Verify**:
- Worker exists (PersonNumber matches)
- `WorkRelationships[0].WorkRelationshipType` changed from "Pending Worker" to "Employee"
- `Assignments[0].AssignmentStatusType` = "ACTIVE"
- Staff Designation data exists if applicable

### 6. Document Management

**API Call**: Not directly verifiable via workers REST API. Would need Document Records API.

**Verify**:
- Person exists and can be found in Person Management
- Document Records section is accessible on person detail page
- For "Secure Document Submission": document uploaded and visible
- For "Edit of Existing Document": document content updated

## Routing Issues (For core-hr-routing agent)

The following tests are misrouted due to pattern matching gaps in `core-hr-uat.flow.ts`:

### 1. "Create a Work Relationship" (with "a") not matched

The router checks `process.includes('create work rel')` but some business processes have "Create **a** Work Relationship" (with an "a" between "create" and "work"). This breaks the substring match.

**Affected tests**:
- "Add a staff emeritus - Use Create a Work Relationship after a Term." → UNMATCHED (falls to generic)
- "Add Retired Hourly/Salary on CCV - Use Create a Work Relationship after a Term" → routes to `salary` (contains "Salary")

**Fix**: Change `process.includes('create work rel')` to `process.match(/create\s+(?:a\s+)?work\s+rel/i)` or add `process.includes('create a work rel')`.

### 2. Non-hire tests misrouted to hire flows

These tests contain keywords like "pending", "non employee", "affiliate", "volunteer" but are NOT hire/add operations:

| Test ID | Business Process | Routes to | Should route to |
|---------|-----------------|-----------|-----------------|
| HR-119, HR-120 | Manage Pending Worker Personal Information | `executeHire` → AddPendingWorkerFlow | `executePersonalInfoUpdate` |
| HR-125 | Manage Pending Worker Employee Personal Information | `executeHire` → AddPendingWorkerFlow | `executePersonalInfoUpdate` |
| HR-175–HR-178 | Modify Pending Worker Employment Start Date | `executeHire` → AddPendingWorkerFlow | new handler for date modification |
| HR-474 | Remove Non employee | `executeHire` → AddNonWorkerFlow | `executeTermination` or new removal handler |
| HR-475 | Remove Affiliate | `executeHire` → AddNonWorkerFlow | `executeTermination` or new removal handler |
| HR-130–HR-133 | Volunteer Service Agreement (VSA) | `executeHire` → AddNonWorkerFlow | new VSA handler |
| HR-169 | Termination of Hourly FT Reg...changing to affiliate | `executeHire` → AddNonWorkerFlow | `executeTermination` |
| HR-166 | MHA query for pending requests | `executeHire` → AddPendingWorkerFlow | MPDX or new MHA handler |

**Fix**: Add these patterns BEFORE the broad hire/pending/affiliate check in the routing chain:
```typescript
if (process.includes('manage pending') || process.includes('manage non employee')) {
  await this.executePersonalInfoUpdate(tc);
} else if (process.includes('modify pending')) {
  await this.executeModifyPendingWorker(tc);
} else if (process.includes('remove non') || process.includes('remove affiliate')) {
  await this.executeTermination(tc);
} else if (process.includes('volunteer service agreement') || process.includes('vsa')) {
  await this.executeVSA(tc);
} else if (process.includes('mha query')) {
  await this.executeMHAQuery(tc);
}
```

### 3. "Add a Self Supported Staff" (HR-014) — unmatched

Business process "Add a Self Supported Staff" doesn't contain any hire keywords. Currently falls to `executeGenericHRAction`. Should route to `executeHire` → HireEmployeeFlow.

**Fix**: Add `process.includes('add a self') || process.includes('add a staff')` to the hire pattern match.

## Field Data Coverage

| Flow | Total Tests | With Field Data | Without Field Data |
|------|------------|----------------|--------------------|
| Hire an Employee | 78 | 77 | 1 |
| Create Work Relationship | 49 | 49 | 0 |
| Assignment Change | 16 | 16 | 0 |
| Document Management | 10 | 10 | 0 |
| **Total** | **153** | **152** | **1** |

The 1 test without field data uses the navigation-only path (click Continue/Next/Submit without form filling).
