# Oracle HCM REST API Reference

Comprehensive reference for all Oracle HCM REST API endpoints used in this project for test validation, data setup, and pre-flight state management.

**Base URL**: `https://stafflife-icahjb-test.fa.ocs.oraclecloud.com`
**API Base Path**: `/hcmRestApi/resources/latest/` (or versioned: `/hcmRestApi/resources/11.13.18.05/`)
**Helper Library**: `scripts/lib/hcm-rest-api.ts`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Common Query Patterns](#common-query-patterns)
3. [Workers](#workers)
4. [Worker Child Resources](#worker-child-resources)
5. [Assignments and Assignment Changes](#assignments-and-assignment-changes)
6. [Person Extra Information (EIT)](#person-extra-information-eit)
7. [Absences](#absences)
8. [Element Entries (Payroll)](#element-entries-payroll)
9. [Salaries](#salaries)
10. [Benefit Enrollments](#benefit-enrollments)
11. [Time Records](#time-records)
12. [Journeys and Checklists](#journeys-and-checklists)
13. [Organizational Data (Lookups)](#organizational-data-lookups)
14. [Security and User Accounts](#security-and-user-accounts)
15. [Write Operations](#write-operations)
16. [Validation Patterns](#validation-patterns)
17. [Known Limitations](#known-limitations)

---

## Authentication

### Basic Auth

All REST API calls use HTTP Basic Authentication. The credentials are sent as a Base64-encoded `Authorization` header.

```typescript
const auth = Buffer.from(`${username}:${password}`).toString('base64');
headers['Authorization'] = `Basic ${auth}`;
```

### Credential Requirements

| User Type | Username Format | REST API Access | Notes |
|-----------|----------------|-----------------|-------|
| Federated user (OWSM) | `josh.starcher@cru.org` | Full access | OWSM requires email-format username |
| Bot users | `uat.bot_hr_admin` | Full access | Direct Oracle users work for REST API |

**Default credentials used in `scripts/lib/hcm-rest-api.ts`**:
- Username: `josh.starcher@cru.org`
- Password: `WinBuildSend!1951@cru`

Bot users also work (confirmed with `uat.bot_hr_admin`). All 114 bot accounts (19 base + 95 clones) share password `WinBuildSend!1951@cru`.

### Required Headers

| Header | Value | When Required |
|--------|-------|---------------|
| `Accept` | `application/json` | Always |
| `Authorization` | `Basic <base64>` | Always |
| `Content-Type` | `application/json` | POST, PATCH requests |
| `REST-Framework-Version` | `4` | EIT/EFF operations, versioned endpoints |
| `Effective-Of` | `RangeMode=CORRECTION;RangeStartDate=YYYY-MM-DD` | Date-effective writes (EIT, assignments) |

### Effective-Of Header Modes

Used for date-effective record operations (Person Extra Info, assignments, legislative info):

| Mode | Syntax | Use Case |
|------|--------|----------|
| CORRECTION | `RangeMode=CORRECTION;RangeStartDate=2025-01-01` | Overwrite existing record from start date |
| UPDATE | `RangeMode=UPDATE;RangeStartDate=2025-03-24` | Create new effective-dated row from start date |
| UPDATE with end | `RangeMode=UPDATE;RangeStartDate=2025-03-24;RangeEndDate=4712-12-31` | Update with explicit end date |

---

## Common Query Patterns

### Filtering with `q` parameter

```
q=FieldName='value'              # Exact match (strings must be quoted)
q=FieldName=12345                # Numeric match (no quotes)
q=FieldName LIKE '*partial*'     # Partial match (wildcards)
q=FieldName NOT IN ('A','B')     # Exclusion
q=FieldName>='10817000'          # Comparison operators
```

Multiple conditions can be combined with `;` (AND):
```
q=PersonNumber='10817020';WorkerType='E'
```

### Pagination

| Parameter | Description | Default |
|-----------|-------------|---------|
| `limit` | Max records per page | 25 |
| `offset` | Skip N records | 0 |
| `hasMore` | Response field: `true` if more pages exist | - |

```
GET /workers?limit=500&offset=0
→ Response includes: { "items": [...], "count": 25, "hasMore": true, "limit": 500, "offset": 0 }
```

### Field Selection

```
fields=PersonId,PersonNumber,DisplayName    # Only return specific fields
```

**Note**: `fields` only works on some endpoints. Use it to reduce payload size.

### Expansion

```
expand=all                                   # Expand all child resources inline
expand=workRelationships                     # Expand specific child
expand=workRelationships.assignments         # Nested expansion
```

### Data Format

```
onlyData=true    # Returns only data (no HATEOAS links) — smaller payloads
onlyData=false   # Returns data + links (default) — needed to get unique IDs from link hrefs
```

### Ordering

```
orderBy=startDate:desc    # Sort by field descending
orderBy=PersonNumber:asc  # Sort by field ascending
```

### Finder Queries

Some endpoints support named finder queries instead of `q`:
```
finder=finderName;param1=value1,param2=value2
```

Example (time records):
```
finder=filterByPerNumTimeGrp;personNumber=10817020,startTime=2025-01-01T00:00:00Z,stopTime=2026-01-01T00:00:00Z,groupType=ProcessedTimecard
```

---

## Workers

The central resource. Most validation starts by looking up a worker.

### GET — List/Search Workers

```
GET /hcmRestApi/resources/latest/workers?q=PersonNumber='10817020'&onlyData=true
GET /hcmRestApi/resources/latest/workers?q=DisplayName LIKE '*Murray*'&fields=PersonId,PersonNumber,DisplayName&onlyData=true&limit=5
GET /hcmRestApi/resources/latest/workers?q=PersonNumber>='10817000'&limit=500&offset=0&onlyData=false
```

**Response**:
```json
{
  "items": [{
    "PersonId": 300000012345678,
    "PersonNumber": "10817020",
    "CorrespondenceLanguage": null,
    "BloodType": null,
    "DateOfBirth": "1990-01-01",
    "DateOfDeath": null,
    "CountryOfBirth": null,
    "RegionOfBirth": null,
    "TownOfBirth": null,
    "ApplicantNumber": null,
    "CreatedBy": "uat.bot_hr_admin",
    "CreationDate": "2026-02-28T09:00:00.000+00:00",
    "LastUpdatedBy": "uat.bot_hr_admin",
    "LastUpdateDate": "2026-02-28T09:00:00.000+00:00"
  }],
  "count": 1,
  "hasMore": false,
  "limit": 25,
  "offset": 0
}
```

### GET — Worker with All Child Resources

```
GET /hcmRestApi/resources/latest/workers?q=PersonNumber='10817020'&expand=all&onlyData=true
```

Returns the worker record with all nested child collections inline:
- `emails` — email addresses
- `workRelationships` — employment records (with nested `assignments`)
- `names` — person names (legal, preferred)
- `phones` — phone numbers
- `addresses` — postal addresses
- `legislativeInfo` — gender, marital status, legislation-specific data

### Worker Unique ID

When `onlyData=false`, response includes `links` with `rel: "self"`. The worker unique ID is embedded in the self link URL:

```
/hcmRestApi/resources/latest/workers/00020000000EACED00057708000110D9401063DA...
```

This long hex-encoded ID is required for child resource operations (EIT, names, addresses, etc.). Extract it from the self link:

```typescript
const selfLink = worker.links?.find((l: any) => l.rel === 'self');
const uid = selfLink.href.split('/workers/')[1];
```

### POST — Create a Pending Worker

```
POST /hcmRestApi/resources/latest/workers
Content-Type: application/json
```

**Request Body** (full example):
```json
{
  "DateOfBirth": "1998-02-15",
  "names": [{
    "LastName": "Smith",
    "FirstName": "John",
    "MiddleNames": "Robert",
    "KnownAs": "Johnny",
    "Title": "MR.",
    "LegislationCode": "US"
  }],
  "emails": [{
    "EmailType": "H1",
    "EmailAddress": "john.smith@example.com",
    "PrimaryFlag": true,
    "FromDate": "2026-03-01"
  }],
  "nationalIdentifiers": [{
    "LegislationCode": "US",
    "NationalIdentifierType": "SSN",
    "NationalIdentifierNumber": "888-71-1879",
    "PrimaryFlag": true
  }],
  "legislativeInfo": [{
    "LegislationCode": "US",
    "Gender": "F",
    "MaritalStatus": "S"
  }],
  "phones": [
    { "PhoneType": "H1", "PhoneNumber": "665-4331", "AreaCode": "412", "CountryCodeNumber": "1", "LegislationCode": "US", "FromDate": "2026-03-01", "PrimaryFlag": true },
    { "PhoneType": "HM", "PhoneNumber": "111-4221", "AreaCode": "412", "CountryCodeNumber": "1", "LegislationCode": "US", "FromDate": "2026-03-01", "PrimaryFlag": false }
  ],
  "addresses": [{
    "AddressType": "HOME",
    "AddressLine1": "3 Br Avenue",
    "TownOrCity": "Grass Lake",
    "Region1": "Lake",
    "Region2": "IL",
    "Country": "US",
    "PostalCode": "60002",
    "PrimaryFlag": true
  }],
  "ethnicities": [{
    "LegislationCode": "US",
    "Ethnicity": "7",
    "PrimaryFlag": true
  }],
  "workRelationships": [{
    "LegalEmployerName": "Campus Crusade for Christ, Inc.",
    "WorkerType": "P",
    "EnterpriseSeniorityDate": "2026-03-01",
    "LegalEmployerSeniorityDate": "2026-03-01",
    "PrimaryFlag": false,
    "assignments": [{
      "AssignmentName": "Staff",
      "ActionCode": "ADD_PEN_WKR",
      "ReasonCode": "PENDWKR",
      "BusinessUnitName": "Cru",
      "LocationCode": "USLoc002",
      "ProposedUserPersonType": "Employee",
      "ProjectedStartDate": "2026-03-01",
      "UserPersonType": "Pending Worker",
      "DepartmentName": "Benefits US",
      "JobCode": "JOB027",
      "GradeCode": "PROF01",
      "managers": [{
        "ManagerAssignmentNumber": "E100",
        "ManagerType": "LINE_MANAGER"
      }],
      "workMeasures": [
        { "Value": 1.5, "Unit": "FTE" },
        { "Value": 1, "Unit": "HEAD" }
      ]
    }]
  }]
}
```

**Response**: Returns the created worker with `PersonId`, `PersonNumber`, and all nested records including their IDs.

### Helper Functions (from `hcm-rest-api.ts`)

```typescript
// Look up worker by PersonNumber
lookupPersonId(page, baseUrl, '10817020') → WorkerRecord | null

// Search by display name (partial match)
lookupWorkerByName(page, baseUrl, 'Murray') → WorkerRecord | null

// Get full worker with all child resources
getWorkerFull(page, baseUrl, '10817020') → WorkerFullRecord | null

// Get specific child resources
getWorkerEmails(page, baseUrl, '10817020') → EmailRecord[]
getWorkerWorkRelationships(page, baseUrl, '10817020') → WorkRelationshipRecord[]
```

---

## Worker Child Resources

All accessed via: `GET /workers/{PersonId or UniqueId}/child/{resourceName}`

### Names

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/names?onlyData=true
```

**Key fields**: `PersonNameId`, `LastName`, `FirstName`, `MiddleNames`, `DisplayName`, `FullName`, `Title`, `KnownAs`, `LegislationCode`

**Update** (PATCH — requires unique ID from links):
```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/names/{namesUid}
Headers: REST-Framework-Version: 4, Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-03-01
Body: { "MiddleNames": "Francis" }
```

### Emails

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/emails?onlyData=true
```

**Key fields**: `EmailAddressId`, `EmailType` (H1=Home, W1=Work), `EmailAddress`, `PrimaryFlag`, `FromDate`, `ToDate`

**Update**:
```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/emails/{EmailAddressId}
Body: { "EmailType": "H1", "EmailAddress": "new.email@example.com" }
```

### Phones

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/phones?onlyData=true
```

**Key fields**: `PhoneId`, `PhoneType` (H1=Home, HM=Mobile, WM=Work Mobile, W1=Work), `PhoneNumber`, `AreaCode`, `CountryCodeNumber`, `PrimaryFlag`, `FromDate`

**Create**:
```
POST /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/phones
Body: { "PhoneType": "WM", "AreaCode": "206", "PhoneNumber": "758-1009", "FromDate": "2026-03-01" }
```

**Update**:
```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/phones/{PhoneId}
Body: { "PhoneType": "WM", "AreaCode": "206", "PhoneNumber": "755-1009" }
```

### Addresses

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/addresses?onlyData=true
```

**Key fields**: `AddressId`, `AddressType` (HOME, MAIL), `AddressLine1-4`, `TownOrCity`, `Region1` (County), `Region2` (State), `Country`, `PostalCode`, `PrimaryFlag`

**Update**:
```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/addresses/{addressesUid}
Headers: Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-03-01
Body: { "AddressLine1": "4379 E Deer Lake Rd" }
```

### Legislative Info

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/legislativeInfo?onlyData=true
```

**Key fields**: `LegislationCode`, `Gender` (M/F), `MaritalStatus` (S=Single, M=Married, etc.)

**Update** (e.g., change marital status):
```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/legislativeInfo/{legislativeInfoUid}
Headers: Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-03-01
Body: { "MaritalStatus": "M" }
```

### Work Relationships

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/workRelationships?onlyData=true
```

**Key fields**: `PeriodOfServiceId`, `LegislationCode`, `LegalEntityId`, `LegalEmployerName`, `WorkerType` (E=Employee, P=Pending Worker, C=Contingent Worker, N=Nonworker), `PrimaryFlag`, `StartDate`, `TerminationDate`, `NotificationDate`, `LastWorkingDate`, `RecommendedForRehire`

#### Nested: Assignments

```
GET /hcmRestApi/resources/latest/workers?q=PersonNumber='10817020'&expand=workRelationships.assignments&onlyData=true
```

**Assignment key fields**: `AssignmentId`, `AssignmentNumber`, `AssignmentName`, `ActionCode`, `ReasonCode`, `EffectiveStartDate`, `EffectiveEndDate`, `BusinessUnitId`, `BusinessUnitName`, `AssignmentType`, `AssignmentStatusTypeCode` (ACTIVE_PROCESS, INACTIVE, SUSPENDED), `AssignmentStatusType` (ACTIVE, INACTIVE), `SystemPersonType` (EMP, CWK, NONWKR, PWK), `UserPersonType`, `JobId`, `JobCode`, `GradeId`, `GradeCode`, `DepartmentId`, `DepartmentName`, `LocationId`, `LocationCode`, `PeopleGroup` (support type, e.g., `SUPPORTED_RMO.OPTOUT`, `NONE.`), `AssignmentCategory` (FR=Full-time Regular, etc.), `PermanentTemporary`, `FullPartTime`, `NormalHours`, `Frequency`, `ManagerFlag`

### Disabilities

```
POST /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/disabilities
Headers: REST-Framework-Version: 4, Content-Type: application/vnd.oracle.adf.resourceitem+json
Body: {
  "LegislationCode": "US",
  "Status": "A",
  "Reason": "GSE_OCC_INC",
  "Degree": 10,
  "SelfDisclosedType": "ORA_PER_NO_ANSWER_US"
}
```

---

## Assignments and Assignment Changes

### GET — Assignment Details

```
GET /hcmRestApi/resources/latest/workers?q=PersonNumber='10434398'&expand=workRelationships.assignments&onlyData=true
```

### PATCH — Assignment Change (Promotion, Transfer, etc.)

```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/workRelationships/{PeriodOfServiceId}/child/assignments/{assignmentsUid}
Headers:
  REST-Framework-Version: 4
  Content-Type: application/vnd.oracle.adf.resourceitem+json
  Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-04-01;RangeEndDate=4712-12-31
Body: {
  "ActionCode": "ASSIGN_CHANGE",
  "JobCode": "JOB065",
  "GradeCode": "MGMT04"
}
```

### PATCH — Update PeopleGroup (Support Type)

```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/workRelationships/{PeriodOfServiceId}/child/assignments/{assignmentsUid}
Headers:
  REST-Framework-Version: 4
  Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-04-01;RangeEndDate=4712-12-31
Body: {
  "ActionCode": "CHANGE_SALARY",
  "PeopleGroup": "NONE."
}
```

**Note**: PeopleGroup segments are separated by `.` (dot). Example values: `SUPPORTED_RMO.OPTOUT`, `NONE.`, `SELF_FUNDED.`

### POST — Add Work Relationship (Rehire)

```
POST /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/workRelationships
Headers: REST-Framework-Version: 4, Content-Type: application/vnd.oracle.adf.resourceitem+json
Body: {
  "LegalEmployerName": "Campus Crusade for Christ, Inc.",
  "WorkerType": "P",
  "PrimaryFlag": false,
  "assignments": [{
    "BusinessUnitName": "Cru",
    "ActionCode": "ORA_ADD_PWK_WORK_RELATION",
    "ProposedUserPersonType": "Employee",
    "UserPersonType": "Pending Worker",
    "ProjectedStartDate": "2026-04-01"
  }]
}
```

---

## Person Extra Information (EIT)

Person Extra Information uses a 3-level nested pattern through the workers EFF (Extensible Flexfield) framework.

### Architecture

```
workers/{uid}
  └── child/workersEFF/{effId}
        └── child/{ContextName}
```

### Step 1: Get Worker (with links for unique ID)

```
GET /hcmRestApi/resources/latest/workers?q=PersonNumber='62'&onlyData=false
```

Extract the worker unique ID from the `self` link.

### Step 2: Get Workers EFF

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/workersEFF?onlyData=false
```

**Response** includes:
- `PersonId`, `CategoryCode` (e.g., `PER_EIT`)
- Child links listing all available EIT contexts

The `effId` is the `PersonId` value (e.g., `300000007332060`).

### Available EIT Contexts (Cru-specific)

| Context Name (VO) | Description |
|--------------------|-------------|
| `PersonExtraInformationContextStaff__Account__and__DesignationprivateVO` | Staff Account & Designation numbers |
| `PersonExtraInformationContextCrisis__Management__InformationprivateVO` | Crisis management contact info |
| `PersonExtraInformationContextCare__GiverprivateVO` | Care giver information |

### Step 3: Read EIT Records

```
GET /hcmRestApi/resources/latest/workers/{uid}/child/workersEFF/{effId}/child/PersonExtraInformationContextStaff__Account__and__DesignationprivateVO?onlyData=true
```

### Step 3: Create EIT Record (POST)

```
POST /hcmRestApi/resources/latest/workers/{uid}/child/workersEFF/{effId}/child/PersonExtraInformationContextStaff__Account__and__DesignationprivateVO
Headers:
  REST-Framework-Version: 4
  Content-Type: application/json
  Effective-Of: RangeMode=CORRECTION;RangeStartDate=2025-01-01
Body: {
  "staffAccountNumber": "new",
  "designationNumber": "new",
  "primaryPerson": "Y"
}
```

**Response**:
```json
{
  "PersonExtraInfoId": 300000015790137,
  "EffectiveStartDate": "2025-01-01",
  "EffectiveEndDate": "4712-12-31",
  "staffAccountNumber": "new",
  "designationNumber": "new",
  "primaryPerson": "Y"
}
```

### Step 3: Update EIT Record (PATCH)

```
PATCH /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/workersEFF/{effId}/child/{ContextName}/{eitUid}
Headers:
  REST-Framework-Version: 4
  Content-Type: application/json
  Effective-Of: RangeMode=UPDATE;RangeStartDate=2026-03-01
Body: {
  "secureHomeCity": "Orlando"
}
```

### Crisis Management Example (POST)

```
POST /hcmRestApi/resources/11.13.18.05/workers/{uid}/child/workersEFF/{effId}/child/PersonExtraInformationContextCrisis__Management__InformationprivateVO
Headers:
  REST-Framework-Version: 4
  Effective-Of: RangeMode=CORRECTION;RangeStartDate=2025-10-19
Body: {
  "secureHomeAddressLine1": "123 Main Street",
  "secureHomeAddressLine2": "N42",
  "secureHomeCity": "Orlando",
  "secureHomeRegion": "Florida",
  "secureHomeAddressPostalCode": "32801",
  "secureHomeCountry": "US",
  "secureWorkAddressLine1": "100 Lake Hart Dr",
  "secureWorkCity": "Orlando",
  "secureWorkRegion": "Florida",
  "secureWorkAddressPostalCode": "32832",
  "secureWorkCountry": "US",
  "securePhone": "4075551234",
  "secureEmail": "john.doe@cru.org"
}
```

### Important: `/personExtraInformation` Endpoint is READ-ONLY

The standalone endpoint `GET /hcmRestApi/resources/latest/personExtraInformation` exists and returns data, but **POST/PATCH operations return 403 Forbidden**. Always use the nested `workers/{uid}/child/workersEFF/{effId}/child/{ContextName}` pattern for writes.

---

## Absences

### GET — Query Absences by PersonId

```
GET /hcmRestApi/resources/latest/absences?q=personId=300000012345678&onlyData=true
GET /hcmRestApi/resources/latest/absences?limit=5&orderBy=startDate:desc&onlyData=true
```

**Key fields**: `absenceCaseId`, `absenceStatusCd` (ORA_SUBMITTED, ORA_APPROVED, WITHDRAWN), `approvalStatusCd`, `startDate`, `endDate`, `personId`, `absenceTypeId`

### GET — Absence Types

```
GET /hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true
```

### PATCH — Withdraw an Absence

```
PATCH /hcmRestApi/resources/latest/absences/{absenceCaseId}
Body: { "absenceStatusCd": "WITHDRAWN" }
```

### Helper Functions

```typescript
lookupAbsences(page, baseUrl, personId) → AbsenceRecord[]
lookupAbsencesByNumber(page, baseUrl, '10817020') → AbsenceRecord[]
withdrawAbsence(baseUrl, absenceCaseId) → void
```

---

## Element Entries (Payroll)

### GET — Query Element Entries by PersonId

```
GET /hcmRestApi/resources/latest/elementEntries?q=PersonId=300000012345678&onlyData=true
```

**Key fields**: `ElementEntryId`, `EffectiveStartDate`, `EffectiveEndDate`, `ElementTypeId`, `PersonId`, `CreatorType`, `EntryType`

### DELETE — Remove an Element Entry

```
DELETE /hcmRestApi/resources/latest/elementEntries/{ElementEntryId}
```

### Helper Functions

```typescript
lookupElementEntries(page, baseUrl, personId) → ElementEntryRecord[]
lookupElementEntriesByNumber(page, baseUrl, '10817020') → ElementEntryRecord[]
deleteElementEntry(baseUrl, elementEntryId) → void
```

---

## Salaries

### GET — Query Salaries by AssignmentId

```
GET /hcmRestApi/resources/latest/salaries?q=AssignmentId=300000245474285&onlyData=true
GET /hcmRestApi/resources/latest/salaries?limit=1&onlyData=true
```

**Key fields**: `SalaryId`, `AssignmentId`, `SalaryBasisId`, `SalaryAmount`, `CurrencyCode`, `DateFrom`, `DateTo`, `AnnualSalary`, `AnnualFullTimeSalary`

### POST — Create Salary

```
POST /hcmRestApi/resources/11.13.18.05/salaries
Headers: REST-Framework-Version: 4, Content-Type: application/vnd.oracle.adf.resourceitem+json
Body: {
  "AssignmentId": 300000245474285,
  "SalaryBasisId": 300000048365126,
  "CurrencyCode": "USD",
  "DateFrom": "2026-03-15",
  "SalaryAmount": 12000,
  "AnnualSalary": 12000.00,
  "AnnualFullTimeSalary": 12000.00,
  "ActionId": 300000000118920
}
```

### Salary Basis LOV

```
GET /hcmRestApi/resources/latest/salaryBasisLov?limit=1&onlyData=true
```

### Helper Functions

```typescript
lookupSalaries(page, baseUrl, assignmentId) → SalaryRecord[]
lookupSalariesByNumber(page, baseUrl, '10817020') → SalaryRecord[]
```

---

## Benefit Enrollments

### GET — Query Enrollments by PersonId

```
GET /hcmRestApi/resources/latest/benefitEnrollments?q=PersonId=300000012345678&onlyData=true
```

**Key fields**: `EnrollmentResultId`, `PersonId`, `ProgramId`, `PlanTypeId`, `PlanId`, `OptionId`, `PersonName`, `EnrollmentCoverageStartDate`, `EnrollmentCoverageEndDate`

### Related LOV Endpoints

```
GET /hcmRestApi/resources/latest/benefitProgramsLOV?limit=5&onlyData=true
GET /hcmRestApi/resources/latest/benefitPlansLOV?limit=5&onlyData=true
GET /hcmRestApi/resources/latest/benefitPlanTypesLOV?limit=5&onlyData=true
GET /hcmRestApi/resources/latest/benefitOptionsLOV?limit=5&onlyData=true
GET /hcmRestApi/resources/latest/eligiblePlansLOV?limit=5&onlyData=true
```

### Helper Functions

```typescript
lookupBenefitEnrollments(page, baseUrl, personId) → BenefitEnrollmentRecord[]
lookupBenefitEnrollmentsByNumber(page, baseUrl, '10817020') → BenefitEnrollmentRecord[]
```

---

## Time Records

### GET — Query Time Record Groups

Uses a **finder** query (not `q` parameter):

```
GET /hcmRestApi/resources/latest/timeRecordGroups?finder=filterByPerNumTimeGrp;personNumber=10817020,startTime=2026-01-01T00:00:00Z,stopTime=2026-12-31T00:00:00Z,groupType=ProcessedTimecard&onlyData=true
```

**Key fields**: `timeRecordGroupId`, `startTime`, `stopTime`, `groupType`, `personNumber`, `personId`

**Note**: The finder approach requires all parameters. If `groupType=ProcessedTimecard` returns no results, omit `groupType` for a broader search.

### Related Endpoints

```
GET /hcmRestApi/resources/latest/timecards?limit=1&onlyData=true
GET /hcmRestApi/resources/latest/timeRecordEventRequests?limit=1&onlyData=true
GET /hcmRestApi/resources/latest/attendanceViolations?limit=1&onlyData=true
```

### Helper Functions

```typescript
lookupTimeRecords(page, baseUrl, '10817020', startDate?, stopDate?) → TimeRecordGroupRecord[]
```

---

## Journeys and Checklists

### GET — Journeys

```
GET /hcmRestApi/resources/latest/journeys?limit=1&onlyData=true
```

**Key fields**: `JourneyId`, `Name`, `Category`

### GET — Allocated Checklists

```
GET /hcmRestApi/resources/latest/allocatedChecklists?q=PersonId=300000012345678&onlyData=true
```

**Key fields**: `AllocatedChecklistId`, `ChecklistName`, `ChecklistStatus`, `AllocationDate`, `CompletionDate`

### Helper Functions

```typescript
lookupAllocatedChecklists(page, baseUrl, personId) → AllocatedChecklistRecord[]
lookupAllocatedChecklistsByNumber(page, baseUrl, '10817020') → AllocatedChecklistRecord[]
```

---

## Organizational Data (Lookups)

### Locations

```
GET /hcmRestApi/resources/latest/locations?limit=50&onlyData=true
```

### Departments

```
GET /hcmRestApi/resources/latest/departments?limit=50&onlyData=true
```

### Jobs

```
GET /hcmRestApi/resources/latest/jobs?limit=50&onlyData=true
```

### Grades

```
GET /hcmRestApi/resources/latest/grades?limit=50&onlyData=true
```

### Legal Entities

```
GET /hcmRestApi/resources/latest/legalEntities?limit=50&onlyData=true
```

### Business Units

```
GET /hcmRestApi/resources/latest/businessUnits?limit=50&onlyData=true
```

### Common Lookups LOV

```
GET /hcmRestApi/resources/latest/commonLookupsLOV?q=LookupType='MAR_STATUS'&onlyData=true&limit=5
GET /hcmRestApi/resources/latest/commonLookupsLOV?q=LookupType='WORKER_TYPE'&onlyData=true&limit=5
```

### Public Workers

```
GET /hcmRestApi/resources/latest/publicWorkers?limit=1&onlyData=true
```

---

## Security and User Accounts

### Roles LOV

```
GET /hcmRestApi/resources/latest/rolesLOV?q=RoleCode='ORA_PER_EMPLOYEE_ABSTRACT'&onlyData=true
GET /hcmRestApi/resources/latest/rolesLOV?q=RoleName LIKE '*HR*'&limit=25&onlyData=true
```

**Key fields**: `RoleId`, `RoleCode`, `RoleName`

### User Accounts

```
GET /hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true
```

### Helper Functions

```typescript
lookupRole(page, baseUrl, 'ORA_PER_EMPLOYEE_ABSTRACT') → RoleLOVRecord | null
searchRoles(page, baseUrl, 'HR', limit?) → RoleLOVRecord[]
```

---

## Write Operations

These are used for pre-flight state resets (preparing test data before re-running tests).

### Reverse Termination

Restores a terminated worker to active status.

```
POST /hcmRestApi/resources/latest/workers/{PersonId}/child/workRelationships/{PeriodOfServiceId}/action/reverseTermination
Body: {}
```

```typescript
reverseTermination(baseUrl, personId, workRelationshipId) → void
```

### Terminate Work Relationship

```
POST /hcmRestApi/resources/latest/workers/{PersonId}/child/workRelationships/{PeriodOfServiceId}/action/terminateWorkRelationship
Body: {
  "ActionCode": "TERMINATE_EMPLOYMENT",
  "TerminationDate": "2026-03-01",
  "NotificationDate": "2026-03-01"
}
```

```typescript
terminateWorker(baseUrl, personId, workRelationshipId, terminationDate) → void
```

### Withdraw Absence

```
PATCH /hcmRestApi/resources/latest/absences/{absenceCaseId}
Body: { "absenceStatusCd": "WITHDRAWN" }
```

```typescript
withdrawAbsence(baseUrl, absenceCaseId) → void
```

### Delete Element Entry

```
DELETE /hcmRestApi/resources/latest/elementEntries/{ElementEntryId}
```

```typescript
deleteElementEntry(baseUrl, elementEntryId) → void
```

---

## Validation Patterns

### Verify a Hire Succeeded

```typescript
import { lookupPersonId, getWorkerFull } from './scripts/lib/hcm-rest-api';

const BASE_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';

// 1. Check worker exists
const worker = await lookupPersonId(null, BASE_URL, personNumber);
expect(worker).not.toBeNull();

// 2. Get full record with assignments
const full = await getWorkerFull(null, BASE_URL, personNumber);
const wr = full.workRelationships[0];
expect(wr.WorkerType).toBe('E');  // Employee
expect(wr.StartDate).toBe('2026-03-01');
expect(wr.LegalEmployerName).toBe('Campus Crusade for Christ, Inc.');
expect(wr.TerminationDate).toBeNull();

// 3. Check assignment details
const asg = wr.assignments[0];
expect(asg.AssignmentStatusType).toBe('ACTIVE');
expect(asg.BusinessUnitName).toBe('Cru');
expect(asg.DepartmentName).toContain('Benefits');
```

### Verify Person Extra Info Was Created

```typescript
// Get worker with links (onlyData=false) to extract unique ID
const data = await hcmGet(null, BASE_URL,
  `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&onlyData=false`);
const uid = data.items[0].links.find(l => l.rel === 'self').href.split('/workers/')[1];

// Get EFF
const eff = await hcmGet(null, BASE_URL,
  `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF?onlyData=false`);
const effId = eff.items[0].PersonId;

// Check Staff Account & Designation context
const ctx = await hcmGet(null, BASE_URL,
  `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF/${effId}/child/PersonExtraInformationContextStaff__Account__and__DesignationprivateVO?onlyData=true`);
expect(ctx.items.length).toBeGreaterThan(0);
expect(ctx.items[0].designationNumber).toBe('new');
```

### Verify Absence Was Entered

```typescript
const absences = await lookupAbsencesByNumber(null, BASE_URL, personNumber);
const recent = absences.find(a =>
  a.startDate === '2026-03-01' &&
  a.absenceStatusCd !== 'WITHDRAWN'
);
expect(recent).toBeDefined();
expect(recent.approvalStatusCd).toBe('ORA_APPROVED');
```

### Verify Element Entry Exists

```typescript
const entries = await lookupElementEntriesByNumber(null, BASE_URL, personNumber);
const match = entries.find(e =>
  e.EffectiveStartDate === '2026-03-01' &&
  e.ElementTypeId === expectedElementTypeId
);
expect(match).toBeDefined();
```

### Verify Assignment Change

```typescript
const full = await getWorkerFull(null, BASE_URL, personNumber);
const asg = full.workRelationships[0].assignments[0];
expect(asg.ActionCode).toBe('ASSIGN_CHANGE');
expect(asg.JobCode).toBe('JOB065');
expect(asg.GradeCode).toBe('MGMT04');
expect(asg.EffectiveStartDate).toBe('2026-04-01');
```

### Verify Salary

```typescript
const salaries = await lookupSalariesByNumber(null, BASE_URL, personNumber);
expect(salaries.length).toBeGreaterThan(0);
expect(salaries[0].SalaryAmount).toBe(50000);
expect(salaries[0].CurrencyCode).toBe('USD');
```

---

## Known Limitations

### Authentication
- OWSM (Oracle Web Services Manager) requires email-format username for federated users. Plain usernames like `josh.starcher` will fail with 401.
- Bot users (`uat.bot_hr_admin`) work for REST API — they are direct Oracle users, not federated.

### Read-Only Endpoints
- `GET /personExtraInformation` — works for reads, but POST/PATCH returns 403 Forbidden. Use the nested `workers/{uid}/child/workersEFF/{effId}/child/{ContextName}` pattern instead.

### Versioned vs Latest
- `latest` resolves to the current API version and works for most operations.
- Some write operations (especially EIT, assignments, names, addresses) require the versioned path (`11.13.18.05`) and `REST-Framework-Version: 4` header.
- When in doubt, use the versioned path with `REST-Framework-Version: 4` for write operations.

### Content-Type Variants
- Most endpoints accept `application/json`.
- Some Oracle-specific endpoints prefer `application/vnd.oracle.adf.resourceitem+json` — both usually work, but use the ADF variant if `application/json` fails.

### Timeout
- The `hcmRequest` helper uses a 20-second hard timeout.
- The `create-person-extra-info.ts` script uses 30-second timeout for EIT operations (they can be slower).

### Unique IDs
- Worker unique IDs (the long hex strings like `00020000000EACED...`) are session-dependent and can change. Always extract them fresh from the `links` array rather than caching them long-term.
- `PersonId` (numeric, e.g., `300000012345678`) is stable and preferred for filtering. But child resource URLs require the hex unique ID.

### PeopleGroup (Support Type)
- Segments are separated by `.` (dot).
- Common values: `NONE.`, `SUPPORTED_RMO.OPTOUT`, `SELF_FUNDED.`
- When updating PeopleGroup, you must also provide an `ActionCode`.

### Pagination Limits
- Default page size is 25. Maximum varies by endpoint but 500 is generally safe.
- Always check `hasMore` in the response to handle pagination.

---

## All Confirmed Accessible Endpoints (Summary)

| Endpoint | Methods | Notes |
|----------|---------|-------|
| `workers` | GET, POST | Core worker operations |
| `workers/{id}/child/workRelationships` | GET, POST | Employment records, rehire |
| `workers/{id}/child/workRelationships/{id}/child/assignments` | GET, PATCH | Assignment changes |
| `workers/{id}/child/workRelationships/{id}/action/reverseTermination` | POST | Pre-flight reset |
| `workers/{id}/child/workRelationships/{id}/action/terminateWorkRelationship` | POST | Pre-flight reset |
| `workers/{id}/child/names` | GET, PATCH | Person name updates |
| `workers/{id}/child/emails` | GET, PATCH | Email updates |
| `workers/{id}/child/phones` | GET, POST, PATCH | Phone CRUD |
| `workers/{id}/child/addresses` | GET, PATCH | Address updates |
| `workers/{id}/child/legislativeInfo` | GET, PATCH | Gender, marital status |
| `workers/{id}/child/disabilities` | POST | Disability records |
| `workers/{id}/child/workersEFF/{effId}/child/{Context}` | GET, POST, PATCH | Person Extra Info (EIT) |
| `emps` | GET | Alternative employee view |
| `absences` | GET, PATCH | Absence records, withdrawal |
| `absenceTypes` | GET | Absence type catalog |
| `elementEntries` | GET, DELETE | Payroll element entries |
| `salaries` | GET, POST | Salary records |
| `salaryBasisLov` | GET | Salary basis lookup |
| `benefitEnrollments` | GET | Benefit enrollment records |
| `benefitProgramsLOV` | GET | Benefits catalog |
| `benefitPlansLOV` | GET | Benefits catalog |
| `benefitPlanTypesLOV` | GET | Benefits catalog |
| `benefitOptionsLOV` | GET | Benefits catalog |
| `eligiblePlansLOV` | GET | Benefits catalog |
| `timeRecordGroups` | GET | Time & labor records (finder) |
| `timecards` | GET | Timecard data |
| `timeRecordEventRequests` | GET | Time event requests |
| `attendanceViolations` | GET | Attendance violations |
| `journeys` | GET | Journey definitions |
| `allocatedChecklists` | GET | Journey instances |
| `locations` | GET | Location catalog |
| `departments` | GET | Department catalog |
| `jobs` | GET | Job catalog |
| `grades` | GET | Grade catalog |
| `legalEntities` | GET | Legal entity catalog |
| `businessUnits` | GET | Business unit catalog |
| `commonLookupsLOV` | GET | Lookup values by type |
| `rolesLOV` | GET | Security role catalog |
| `userAccounts` | GET | User account data |
| `publicWorkers` | GET | Public worker directory |
| `assignmentChanges` | GET | Assignment change history |
| `personDocumentsOfRecord` | GET | Person documents |
| `workerDocumentsOfRecord` | GET | Worker documents |
| `businessProcessApprovalUsers` | GET | Approval workflow users |
| `businessProcessNotifications` | GET | Workflow notifications |
| `personExtraInformation` | GET only | READ-ONLY (403 on writes) |
