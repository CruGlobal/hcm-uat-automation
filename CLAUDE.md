# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oracle HCM UAT automation framework using Playwright + TypeScript. 1,201 tests across 11 spec files covering 12 modules. Tests are dynamically generated from the **UAT Plan spreadsheet** (the single source of test cases). Field-level form data is generated from the **migration database** and matched to UAT Plan test IDs.

## Project Location

This project lives at `/home/ai/htdocs/hcm-uat-automation/` (not the parent `uat-automation` directory).

## Running Tests

**All tests should run in parallel using bot users.** The system has 19 bot user accounts, each with dedicated Oracle HCM credentials (direct login, no SSO). Each bot runs its tests in its own Playwright process with an independent Oracle HCM session.

### Hard cap: 50 concurrent Playwright processes (system-wide)

**Before launching any parallel test run**, you MUST check how many Playwright processes are already running on the system and ensure your run will not exceed the **hard cap of 50 total Playwright processes** across all sessions. The `run-parallel.ts` script enforces this automatically:
- On startup, it counts existing `playwright` processes via `pgrep -c -f "playwright test"`.
- It calculates `availableSlots = 50 - existingProcesses`.
- If `availableSlots <= 0`, it exits with an error.
- Otherwise, it limits spawned processes to `availableSlots` (dropping lowest-priority bot accounts if necessary).
- **Never bypass this cap.** If you need more slots, wait for existing runs to finish or ask the user to stop other runs.

### Parallel execution (preferred — 19 bots, ~12x speedup):
```bash
npx tsx scripts/run-parallel.ts                        # All bots, all their tests
npx tsx scripts/run-parallel.ts --one-per-bot           # Smoke test: 1 test per bot (fast)
npx tsx scripts/run-parallel.ts --module "Core HR"      # One module, parallel across bots
npx tsx scripts/run-parallel.ts --bots 5               # Limit to 5 bots
npx tsx scripts/run-parallel.ts --max-processes 40     # Override hard cap (default: 50)
RUN_PASSED_ONLY=true npx tsx scripts/run-parallel.ts   # Only previously-passed tests
```

How it works:
- `scripts/run-parallel.ts` reads the UAT Plan, groups tests by bot user (via `testerName` → bot mapping in `src/config/bot-users.ts`), and spawns one `npx playwright test` process per bot.
- Each process sets `PARALLEL_BOT=<botName>` env var. The `isTestable()` function in `uat-plan-provider.ts` filters tests to only those assigned to that bot.
- Uses `playwright.parallel.config.ts` (no globalSetup, no storageState — each bot logs in independently via direct Oracle login).
- 19 concurrent Oracle HCM sessions, ~60 tests per bot, wall-clock time reduced from ~85min to ~7min.

### Serial execution (single user, legacy):
```bash
npx playwright test                              # Run all tests serially
npx playwright test tests/core-hr/               # Run one module
npx playwright test -g "HR-019"                  # Run by test name/ID
npx playwright test --list                       # List all tests without running
```

### Other commands:
```bash
npx playwright show-report                       # Open HTML report
npx tsx scripts/generate-test-data.ts            # Generate field data from migration DB
npx tsx scripts/fetch-uat-plan.ts                # Fetch UAT Plan from Google Sheets
```

Timeouts: 300s/test, 60s navigation, 30s actions.

## Architecture

Three-layer pattern: **Page Objects → Flows → Specs**, with a shared data layer and multi-user session management.

### Data Pipeline

Two complementary data sources:

**1. UAT Plan Sheet (test case definitions, 1,201 cases):**
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
- `base.flow.ts` — login (auto-resolves correct bot user per test) → navigate to module.
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
| core-hr/core-hr-uat-plan.spec.ts | 600 | Core HR |
| payroll/payroll-processing.spec.ts | 113 | Payroll |
| absence/absence-management.spec.ts | 111 | Absence Management |
| benefits/benefits.spec.ts | 139 | Benefits |
| time-labor/time-and-labor.spec.ts | 67 | Time and Labor |
| journeys/journeys.spec.ts | 66 | Journeys |
| compensation/compensation.spec.ts | 52 | Workforce Compensation |
| mpdx/mpdx.spec.ts | 24 | MPDX |
| saa/saa.spec.ts | 6 | SAA |
| oneapp/oneapp.spec.ts | 19 | OneApp |
| other/other-functions.spec.ts | 4 | Other Functions |
| **Total** | **1,201** | |

## Multi-User Bot System

19 bot user accounts for parallel test execution. Each bot has dedicated Oracle HCM credentials and comprehensive security roles. Tests are assigned to bots via `testerName` → bot mapping.

### Key files:
- `src/config/bot-users.ts` — Static registry: `testerName` (from UAT Plan) → `{ botName, sheetName, personNumber }`. Includes alias mappings so all 1,200+ tests map to a bot.
- `.config/bot-credentials.json` — Credentials (not checked in): `{ botName: { username, password } }`. Username format: `uat.<botName>`.
- `src/config/user-session-manager.ts` — Resolves which user runs each test, tracks current session to minimize re-logins.
- `scripts/run-parallel.ts` — Parallel orchestrator.
- `playwright.parallel.config.ts` — Config for parallel mode (no globalSetup/storageState).

### Bot login:
- Bot users use **direct Oracle login** (native User ID/Password form, no SSO/Okta/MFA) — faster and avoids rate limiting.
- `LoginPage.fullLogin(username, password)` → routes to `directLogin()` when no `totpSecret` is provided.
- `base.flow.ts` `loginToHCM(tc)` resolves the correct bot via `resolveUser(tc)` and handles login switching.

### Adding/modifying bot users:
- Assign security roles: `npx tsx scripts/inspect/assign-roles.ts` (Security Console UI automation)
- Bot credentials template: `.config/bot-credentials.example.json`

## Login Flow

Two login paths based on user type:

**Bot users (parallel mode — preferred):** Direct Oracle login, no SSO.
1. Navigate to Oracle HCM login page
2. Fill "User ID" + "Password" fields on the native Oracle login form
3. Click "Sign In" → redirect to `**/fscmUI/**`

**Default user (serial mode — legacy):** Okta SSO with TOTP MFA.
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

- **Parallel is the default.** Always use `scripts/run-parallel.ts` to run tests. Serial mode (`npx playwright test`) is only for debugging a single test.
- `PARALLEL_BOT` env var: When set, `isTestable()` filters tests to only those assigned to that bot user. Set automatically by `run-parallel.ts`.
- `src/utils/oracle-hcm-helpers.ts` contains `waitForOracleJET()` which checks `oj.Context.getPageContext().getBusyContext()` — critical for Oracle JET apps.
- `excelSerialToDate(serial)` converts Excel serial date numbers (e.g., "46054") to MM/DD/YYYY strings — used because Google Sheets returns dates as serial numbers.
- Oracle HCM URLs: Home page = `**/fscmUI/faces/AtkHomePageWelcome**`, Pending Workers dashboard = `/fscmUI/redwood/employment-pending-workers/view/dashboard`.
- Navigator menu: `a[title="Navigator"]` → `a:has-text("Show More")` → `a[title="New Person"]`.
- Temporary `inspect-*.ts` scripts in the project root are for UI exploration and can be deleted.

## Test Idempotency (Re-runnable Tests)

Some tests perform one-time operations that prevent re-execution with the same data:

| Problem | Tests Affected | Solution |
|---------|---------------|----------|
| Can't hire person who already exists (name+SSN conflict) | Hire, Add Pending Worker, Add Non-Worker (~200 tests) | **Run-unique data**: append run counter to names, offset SSNs |
| Can't terminate already-terminated person | Termination (~30 tests) | **Pre-flight**: reverse termination via REST API |
| Can't rehire already-active person | Rehire (~49 tests) | **Pre-flight**: re-terminate via REST API |
| Can't create duplicate absence | Absence entry (~40 tests) | **Pre-flight**: withdraw duplicate via REST API |
| Can't create duplicate element entry | Payroll entry (~20 tests) | **Pre-flight**: delete duplicate via REST API |

### How it works

**Pre-Flight Checker** (`src/validation/pre-flight-checker.ts`): Runs before each test via REST API (no browser needed). Checks current state and resets if consumed. Already implemented for termination, rehire, absence, payroll.

**Run-Unique Data** (hire/create tests): `getFieldData()` in `uat-plan-provider.ts` applies run-specific mutations when `RUN_COUNTER` env var is set (auto-set by `run-parallel.ts`):
- Last name: `{testId}` → `{testId} R{counter}` (e.g., "HR-023 R2")
- SSN: offset by `counter * 5000` to avoid collisions
- Each execution creates genuinely new people in Oracle HCM

**Run counter**: Stored in `.cache/run-counter.json`, incremented by `run-parallel.ts` on each invocation. For serial debugging: `RUN_COUNTER=N npx playwright test -g "HR-023"`.

### Key files
- `src/validation/pre-flight-checker.ts` — Pre-flight state checks and resets
- `src/data/uat-plan-provider.ts` → `getFieldData()` — Applies run-unique mutations
- `scripts/run-parallel.ts` — Increments and passes `RUN_COUNTER`
- `.cache/run-counter.json` — Persisted run counter

## Adding a New Module

1. Create page objects in `src/pages/<module>/`
2. Create flows in `src/flows/<module>/`, extending `BaseFlow`
3. Create specs in `tests/<module>/`, importing from `tests/fixtures/uat-plan.fixture.ts`
4. The module name must match one in `UAT_MODULES` in `src/data/types.ts`
5. To add field data: update `scripts/generate-test-data.ts` to generate `TestCase` objects for the module's business process types
