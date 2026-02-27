# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oracle HCM UAT automation framework using Playwright + TypeScript. 1,580 tests across 20 spec files covering 12 modules. Tests are dynamically generated from two data sources: a transposed test data sheet (424 detailed cases) and the UAT Plan sheet (1,139 unique high-level cases).

## Project Location

This project lives at `/home/ai/htdocs/hcm-uat-automation/` (not the parent `uat-automation` directory).

## Commands

```bash
npx playwright test                              # Run all tests
npx playwright test tests/core-hr/               # Run one module
npx playwright test tests/core-hr/hires.spec.ts  # Run one spec
npx playwright test -g "HR-019"                  # Run by test name/ID
npx playwright test --list                       # List all tests without running
npx playwright show-report                       # Open HTML report
npm run fetch-data                               # Preview Google Sheets data
npm run fetch-data "Core - Hires"                # Fetch a specific tab
```

Tests run serially (`workers: 1`) because Oracle HCM sessions conflict. Timeouts: 120s/test, 60s navigation, 30s actions.

## Architecture

Three-layer pattern: **Page Objects → Flows → Specs**, with a shared data layer.

### Data Pipeline

Two parallel data pipelines feed tests:

**1. Test Data Sheet (detailed field-level data, 424 cases):**
```
Test Data Sheet (9 tabs, transposed) → global-setup.ts → .cache/*.json → test-data.fixture.ts → core-hr + payroll specs
```
- `global-setup.ts` runs once before all tests via Playwright `globalSetup`, fetching all tabs via Google Sheets API v4 and caching as JSON. Without Google credentials, it creates empty cache files.
- `test-data.fixture.ts` extends Playwright's `test` with `loadTab` fixture and provides `hasRequiredFields()` and `testTitle()` helpers. Core HR and payroll element entry specs import `{ test, expect }` from this fixture.
- `testTitle(tc)` appends `col-{columnIndex}` when scenario is empty to avoid Playwright duplicate-title errors.
- The `TestCase` interface in `src/data/types.ts` holds field-level data with `getField(tc, partialKey)` for case-insensitive partial key matching.

**2. UAT Plan Sheet (high-level test metadata, 1,139 cases):**
```
UAT Plan Sheet (11 modules) → scripts/fetch-uat-plan.ts → .cache/uat-plan.json → uat-plan.fixture.ts → all module specs
```
- `scripts/fetch-uat-plan.ts` fetches the full UAT Plan spreadsheet (27 tabs, deduplicates by testId).
- `uat-plan-provider.ts` provides `loadUATModule()`, `loadByCategory()`, `uatTestTitle()`, `isTestable()`.
- `uat-plan.fixture.ts` extends Playwright's `test` for UAT Plan tests. New module specs (absence, benefits, time-labor, journeys, compensation, mpdx, saa, other) import from this fixture.
- The `UATTestCase` interface holds test metadata: testId, module, businessProcess, testScenario, transactionCategory, testScript, expectedResult, etc.

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
- `core-hr/` — 8 tab-specific flows + `core-hr-uat.flow.ts` for UAT Plan routing (575 tests).
- `payroll/` — element-entry + payroll-processing flows.
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
20 spec files with dynamic test generation from cached data:

| Spec File | Tests | Source |
|---|---|---|
| core-hr/add-pending-workers.spec.ts | 27 | Test Data |
| core-hr/add-non-worker.spec.ts | 24 | Test Data |
| core-hr/create-work-relationship.spec.ts | 12 | Test Data |
| core-hr/hires.spec.ts | 40 | Test Data |
| core-hr/pending-to-hire.spec.ts | 47 | Test Data |
| core-hr/rehires.spec.ts | 98 | Test Data |
| core-hr/assign-change-xfr.spec.ts | 25 | Test Data |
| core-hr/terms-ends.spec.ts | 15 | Test Data |
| core-hr/core-hr-uat-plan.spec.ts | 575 | UAT Plan |
| payroll/payroll.spec.ts | 136 | Test Data |
| payroll/payroll-processing.spec.ts | 103 | UAT Plan |
| absence/absence-management.spec.ts | 108 | UAT Plan |
| benefits/benefits.spec.ts | 139 | UAT Plan |
| time-labor/time-and-labor.spec.ts | 64 | UAT Plan |
| journeys/journeys.spec.ts | 63 | UAT Plan |
| compensation/compensation.spec.ts | 52 | UAT Plan |
| mpdx/mpdx.spec.ts | 22 | UAT Plan |
| saa/saa.spec.ts | 6 | UAT Plan |
| oneapp/oneapp.spec.ts | 20 | UAT Plan |
| other/other-functions.spec.ts | 4 | UAT Plan |
| **Total** | **1,580** | |

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

- Most Oracle HCM page selectors in `core-hr/` and `payroll/` pages still have `TODO` placeholder comments — they need updating by inspecting the actual Oracle HCM UI.
- `src/utils/oracle-hcm-helpers.ts` contains `waitForOracleJET()` which checks `oj.Context.getPageContext().getBusyContext()` — critical for Oracle JET apps.
- `excelSerialToDate(serial)` converts Excel serial date numbers (e.g., "46054") to MM/DD/YYYY strings — used because Google Sheets returns dates as serial numbers.
- Oracle HCM URLs: Home page = `**/fscmUI/faces/AtkHomePageWelcome**`, Pending Workers dashboard = `/fscmUI/redwood/employment-pending-workers/view/dashboard`.
- Navigator menu: `a[title="Navigator"]` → `a:has-text("Show More")` → `a[title="New Person"]`.
- Temporary `inspect-*.ts` scripts in the project root are for UI exploration and can be deleted.

## Adding a New Module

1. Create page objects in `src/pages/<module>/`
2. Create flows in `src/flows/<module>/`, extending `BaseFlow`
3. Create specs in `tests/<module>/`:
   - For detailed test data: import from `tests/fixtures/test-data.fixture.ts`
   - For UAT Plan tests: import from `tests/fixtures/uat-plan.fixture.ts`
4. For test data sheet: add the tab name to `MODULE_TABS` in `src/data/types.ts`
5. For UAT Plan: the module name must match one in `UAT_MODULES` in `src/data/types.ts`
