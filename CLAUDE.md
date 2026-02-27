# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oracle HCM UAT automation framework using Playwright + TypeScript. ~1,155 tests across 11 spec files covering 12 modules. Tests are dynamically generated from the **UAT Plan spreadsheet** (the single source of test cases). Field-level form data is generated from the **migration database** and matched to UAT Plan test IDs.

## Project Location

This project lives at `/home/ai/htdocs/hcm-uat-automation/` (not the parent `uat-automation` directory).

## Commands

```bash
npx playwright test                              # Run all tests
npx playwright test tests/core-hr/               # Run one module
npx playwright test -g "HR-019"                  # Run by test name/ID
npx playwright test --list                       # List all tests without running
npx playwright show-report                       # Open HTML report
npx tsx scripts/generate-test-data.ts            # Generate field data from migration DB
npx tsx scripts/fetch-uat-plan.ts                # Fetch UAT Plan from Google Sheets
```

Tests run serially (`workers: 1`) because Oracle HCM sessions conflict. Timeouts: 120s/test, 60s navigation, 30s actions.

## Architecture

Three-layer pattern: **Page Objects → Flows → Specs**, with a shared data layer.

### Data Pipeline

Two complementary data sources:

**1. UAT Plan Sheet (test case definitions, ~1,155 cases):**
```
UAT Plan Sheet (11 modules) → scripts/fetch-uat-plan.ts → .cache/uat-plan.json → uat-plan.fixture.ts → all 11 spec files
```
- `scripts/fetch-uat-plan.ts` fetches the full UAT Plan spreadsheet (27 tabs, deduplicates by testId).
- `uat-plan-provider.ts` provides `loadUATModule()`, `loadByCategory()`, `uatTestTitle()`, `isTestable()`, `getFieldData()`.
- `uat-plan.fixture.ts` extends Playwright's `test` for UAT Plan tests. All spec files import from this fixture.
- The `UATTestCase` interface holds test metadata: testId, module, businessProcess, testScenario, transactionCategory, testScript, expectedResult, etc.

**2. Migration Database (field-level form data, matched to UAT Plan IDs):**
```
UAT Plan IDs + Migration DB → scripts/generate-test-data.ts → .cache-generated/field-data.json → uat-plan-provider.getFieldData()
```
- `scripts/generate-test-data.ts` loads the UAT Plan cache, groups tests by business process type, queries the migration DB for matching persons/assignments, and outputs `TestCase` objects keyed by UAT Plan testId.
- `getFieldData(testId)` in `uat-plan-provider.ts` returns field data for a test ID (or undefined if none exists).
- When field data exists, flows delegate to tab-specific flows (HireEmployeeFlow, RehireEmployeeFlow, etc.) which fill all form fields.
- When no field data exists, flows use navigation-only behavior (click Continue/Next/Submit).
- The `TestCase` interface in `src/data/types.ts` holds field-level data with `getField(tc, partialKey)` for case-insensitive partial key matching.

### Page Objects (`src/pages/`)
- `base.page.ts` — All pages extend this. Provides `waitForJET()` (Oracle JET busy-context wait), `dismissPopups()`, `fillField()` with Tab-to-trigger-validation, `fillCombobox()`, `clickAdfButton()`, `clickAdfLink()`, and `clickAndWait()`.
- `login.page.ts` — Real Okta SSO + TOTP MFA login flow (fully working).
- `home.page.ts` — Shared across all modules. Navigator menu, New Person tasks, Element Entries.
- `core-hr/` — 8 page objects: person-management, when-and-why, assignment, payroll-details, salary, managers, staff-designation, confirmation.
- `payroll/` — 2 page objects: element-entry, payroll-processing.
- `absence/` — absence-management (absence entry, approval, withdrawal, balance).
- `benefits/` — benefits (enrollment, life events, dependents, beneficiaries).
- `time-labor/` — timecard (entry, approval, web clock, attestation).
- `journeys/` — journeys (assignment, task completion, checklist).
- `compensation/` — compensation (base pay, individual comp, planning, total comp).
- `mpdx/` — mpdx (salary calc, MPD goals, MHA, expense reports).
- `saa/` — saa (salary approval, MHA approval, HR specialist view).

### Flows (`src/flows/`)
Composable scenario classes between page objects and specs. Each flow orchestrates multiple page objects for a business scenario.
- `base.flow.ts` — login → navigate to module.
- `core-hr/base-core-hr.flow.ts` — Shared base composing all core-hr page objects, with `fillCommonSections(tc)`.
- `core-hr/` — 8 tab-specific flows (hire, rehire, add-pending, add-nonworker, pending-to-hire, create-work-rel, assignment-change, termination) + `core-hr-uat.flow.ts` for UAT Plan routing (575 tests). When field data exists, delegates to the tab-specific flow for full form filling.
- `payroll/` — element-entry + payroll-processing flows. PayrollProcessingFlow delegates to ElementEntryFlow when field data exists.
- `absence/` — base-absence, absence-entry, absence-approval, absence-admin flows.
- `benefits/` — base-benefits, benefits-enrollment, benefits-admin flows.
- `time-labor/` — base-time-labor, timecard-entry, time-approval, time-admin flows.
- `journeys/` — base-journeys, journey-assignment flows.
- `compensation/` — base-compensation, compensation-management flows.
- `mpdx/` — mpdx flow (routes by test script type).
- `saa/` — saa flow (HR specialist view, approvals).
- `other/` — other-functions flow.
- `oneapp/` — oneapp flow (Prepare for Hire, New Hire, Job Reclass, Payroll Change, Transfer).

### Specs (`tests/`)
11 spec files with dynamic test generation from UAT Plan cache:

| Spec File | Tests | Module |
|---|---|---|
| core-hr/core-hr-uat-plan.spec.ts | 575 | Core HR |
| payroll/payroll-processing.spec.ts | 103 | Payroll |
| absence/absence-management.spec.ts | 108 | Absence Management |
| benefits/benefits.spec.ts | 139 | Benefits |
| time-labor/time-and-labor.spec.ts | 64 | Time and Labor |
| journeys/journeys.spec.ts | 63 | Journeys |
| compensation/compensation.spec.ts | 52 | Workforce Compensation |
| mpdx/mpdx.spec.ts | 22 | MPDX |
| saa/saa.spec.ts | 6 | SAA |
| oneapp/oneapp.spec.ts | 20 | OneApp |
| other/other-functions.spec.ts | 4 | Other Functions |
| **Total** | **~1,155** | |

## Login Flow

Authentication uses Okta SSO with TOTP MFA:
1. Navigate to Oracle HCM → click "Company Single Sign-On" (`#ssoBtn`)
2. Okta username page → enter username (`input[name="identifier"]`)
3. Okta password page → enter password (`input[name="credentials.passcode"]`)
4. Okta MFA selection → click Google Authenticator (`a[aria-label="Select Google Authenticator."]`)
5. Enter TOTP code (generated from `OKTA_TOTP_SECRET` env var using `otpauth` npm package)
6. Wait for redirect to `**/fscmUI/**`

Note: Okta password and MFA code fields share the same selector (`input[name="credentials.passcode"]`) — they appear on different pages sequentially.

## Environment Variables

Required in `.env` (see `.env.example`):
```
ORACLE_HCM_URL=https://stafflife-icahjb-test.fa.ocs.oraclecloud.com
ORACLE_HCM_USERNAME=<okta username>
ORACLE_HCM_PASSWORD=<okta password>
OKTA_TOTP_SECRET=<base32 totp secret from Google Authenticator>
GOOGLE_SHEET_ID=<sheet id>
GOOGLE_CLIENT_ID=<oauth client id>
GOOGLE_CLIENT_SECRET=<oauth client secret>
GOOGLE_REFRESH_TOKEN=<oauth refresh token>
```

Password with spaces must be quoted in `.env`: `ORACLE_HCM_PASSWORD="word1 word2 word3 word4"`. The code strips surrounding quotes.

## Important Details

- `src/utils/oracle-hcm-helpers.ts` contains `waitForOracleJET()` which checks `oj.Context.getPageContext().getBusyContext()` — critical for Oracle JET apps.
- `excelSerialToDate(serial)` converts Excel serial date numbers (e.g., "46054") to MM/DD/YYYY strings — used because Google Sheets returns dates as serial numbers.
- Oracle HCM URLs: Home page = `**/fscmUI/faces/AtkHomePageWelcome**`, Pending Workers dashboard = `/fscmUI/redwood/employment-pending-workers/view/dashboard`.
- Navigator menu: `a[title="Navigator"]` → `a:has-text("Show More")` → `a[title="New Person"]`.
- Temporary `inspect-*.ts` scripts in the project root are for UI exploration and can be deleted.

## Adding a New Module

1. Create page objects in `src/pages/<module>/`
2. Create flows in `src/flows/<module>/`, extending `BaseFlow`
3. Create specs in `tests/<module>/`, importing from `tests/fixtures/uat-plan.fixture.ts`
4. The module name must match one in `UAT_MODULES` in `src/data/types.ts`
5. To add field data: update `scripts/generate-test-data.ts` to generate `TestCase` objects for the module's business process types
