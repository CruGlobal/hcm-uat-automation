# Validation Needs: Core HR Changes (Assignment Change, Termination, Create Work Relationship)

## Overview

286 Core HR "change" tests across 4 action types, all with field data from migration DB.
These tests modify existing person records (unlike hire/add flows which create new ones).

| Action Type | Test Count | Flow File |
|---|---|---|
| Assignment Change (Change Assignment, Strategy Change, etc.) | 157 | `assignment-change.flow.ts` |
| Create Work Relationship (Rehire) | 49 | `create-work-relationship.flow.ts` |
| Transfer (Local/Global Transfer, Company Change) | 47 | `assignment-change.flow.ts` (reused) |
| Termination (Voluntary/Involuntary, End Assignment) | 25 | `termination.flow.ts` |
| Change Location / Change Hours / Manager Change | 8 | Router inline (core-hr-uat.flow.ts) |

## OutcomeValidator Extensions Needed

### 1. Assignment Change Validation
**API**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber='{number}'&expand=assignments`

Verify after assignment change submission:
- `assignments[].AssignmentStatusTypeCode` matches expected status
- `assignments[].PersonTypeCode` matches expected person type
- `assignments[].JobId` / `assignments[].JobCode` matches expected job
- `assignments[].GradeId` / `assignments[].GradeCode` matches expected grade
- `assignments[].DepartmentId` / `assignments[].DepartmentName` matches expected department
- `assignments[].LocationId` / `assignments[].LocationCode` matches expected location
- `assignments[].BusinessUnitId` matches expected business unit
- `assignments[].ActionCode` matches the action performed (e.g., "ASG_CHANGE")

**Field data mapping**:
- `"Person Number"` → API query parameter
- `"Assignment > Assignment Status"` → `AssignmentStatusTypeCode`
- `"Assignment > Person Type"` → `PersonTypeCode`
- `"Assignment > Job"` → Job name/code lookup
- `"Assignment > Department"` → Department name lookup
- `"Assignment > Location"` → Location name lookup

### 2. Termination Validation
**API**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber='{number}'&expand=workRelationships`

Verify after termination submission:
- `workRelationships[].TerminationDate` is set and matches expected date
- `workRelationships[].ActualTerminationDate` is set
- `workRelationships[].ActionCode` is "TERMINATION" or "END_ASSIGNMENT"
- `workRelationships[].ActionReasonCode` matches expected reason
- For End Assignment: specific assignment's status changes to "Inactive"

**Field data mapping**:
- `"Person Number"` → API query parameter
- `"When - Effective date"` → expected `TerminationDate`
- `"What's the way"` → expected action code (Termination / End Assignment)
- `"Why"` → expected `ActionReasonCode`

### 3. Create Work Relationship (Rehire) Validation
**API**: `GET /hcmRestApi/resources/latest/workers?q=PersonNumber='{number}'&expand=workRelationships,workRelationships.assignments`

Verify after CWR/rehire submission:
- A new work relationship exists with `WorkRelationshipStatus = "ACTIVE"`
- `workRelationships[].StartDate` matches expected start date
- `workRelationships[].LegalEntityId` matches expected legal employer
- New assignment fields match expected values (person type, job, grade, department, location)
- The new work relationship ID is different from any terminated work relationship

**Field data mapping**:
- `"Use Person > Last Name"` + `"Use Person > First Name"` → person lookup
- `"Use Person > When"` → expected work relationship `StartDate`
- `"Use Person > Legal Employer"` → expected `LegalEntityId`
- `"Assignment > *"` fields → new assignment attributes

### 4. Transfer Validation
**API**: Same as Assignment Change (transfers modify the existing assignment)

Verify after transfer submission:
- `assignments[].LocationId` changed (for location transfers)
- `assignments[].DepartmentId` changed (for department transfers)
- `assignments[].BusinessUnitId` changed (for company/legal entity transfers)
- `assignments[].LegalEntityId` changed (for global transfers)
- Assignment history shows transfer action with correct effective date

**Field data mapping**: Same as Assignment Change.

## Implementation Notes

### API Authentication
All Oracle HCM REST API calls use Basic Auth with bot credentials.
The `hcm-rest-api.ts` helper already supports `getWorkerFull(personNumber)`.

### Effective Date Considerations
- Assignment changes and terminations are date-effective. The API returns the
  current-as-of-today view by default.
- To validate future-dated changes, use `?effectiveDate={YYYY-MM-DD}` parameter.
- Many test dates are in the future (March 2026), so validation must use effective date filtering.

### Multiple Assignments
- Some persons have multiple assignments (additional jobs).
- Assignment change validation must identify the correct assignment by matching
  the assignment number or using the primary assignment flag.
- End Additional Job should verify the specific non-primary assignment is ended.

### Unrouted Patterns (Need Router Update — Task #5)
The following business processes fall through to `executeGenericHRAction` and
need routing in `core-hr-uat.flow.ts`:
- "End Additional Job..." (8 tests) — should route to Termination with `End Assignment` action
- "Hourly/Salaried FT to Paid/Unpaid Leave" (8 tests) — assignment status change
- "Return from Leave" (4 tests) — assignment status change
- "Adding an additional job row..." (14 tests) — uses "Add Assignment" action
- "Supported RMO to Medical/Military/Sabbatical Leave" (6 tests) — status change
