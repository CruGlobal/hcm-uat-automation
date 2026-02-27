# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oracle HCM UAT automation framework using Playwright + TypeScript. Test cases are sourced from a Google Sheet — 221 cases across 9 tabs (8 Core HR + 1 Payroll). Tests are dynamically generated from cached JSON data.

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
```
Google Sheet (9 tabs) → global-setup.ts → .cache/*.json → test-data.fixture.ts → spec files
```
- `global-setup.ts` runs once before all tests via Playwright `globalSetup`, fetching all tabs via Google Sheets API v4 and caching as JSON. Without Google credentials, it creates empty cache files.
- `test-data.fixture.ts` extends Playwright's `test` with `loadTab` fixture and provides `hasRequiredFields()` and `testTitle()` helpers. Specs import `{ test, expect }` from this fixture instead of `@playwright/test` directly.
- `testTitle(tc)` appends `col-{columnIndex}` when scenario is empty to avoid Playwright duplicate-title errors.
- The `TestCase` interface in `src/data/types.ts` is shared across all modules — every tab uses the same column structure.
- `getField(tc, partialKey)` does case-insensitive partial key matching for flexible field lookup.

### Page Objects (`src/pages/`)
- `base.page.ts` — All pages extend this. Provides `waitForJET()` (Oracle JET busy-context wait), `dismissPopups()`, `fillField()` with Tab-to-trigger-validation, and `clickAndWait()`.
- `login.page.ts` — Real Okta SSO + TOTP MFA login flow (fully working).
- `home.page.ts` — Shared across all modules.
- `core-hr/` — 8 page objects: person-management, when-and-why, assignment, payroll-details, salary, managers, staff-designation, confirmation.
- `payroll/` — 1 page object: element-entry.

### Flows (`src/flows/`)
Composable scenario classes between page objects and specs. Each flow orchestrates multiple page objects for a business scenario.
- `base.flow.ts` — login → navigate to module.
- `core-hr/base-core-hr.flow.ts` — Shared base composing all core-hr page objects, with `fillCommonSections(tc)`.
- 8 tab-specific core-hr flows + 1 payroll flow.

### Specs (`tests/`)
One spec per tab with dynamic test generation:
```typescript
const cases = loadCachedTestCases(TAB);
for (const tc of cases) {
  test(testTitle(tc), async ({ page }) => {
    test.skip(!hasRequiredFields(tc, REQUIRED), `${tc.testId} missing required data`);
    const flow = new SomeFlow(page);
    await flow.execute(tc);
  });
}
```

### Test Case Counts
| Tab | Tests |
|---|---|
| Core - Add Pending Workers | 7 |
| Core - Add Non Worker | 9 |
| Core - Create Work Relationship | 2 |
| Core - Hires | 22 |
| Core - One app Pending to Hire | 22 |
| Core - rehires | 48 |
| Core - Assign Change/XFR | 5 |
| Core - Terms/Ends | 0 |
| Payroll | 106 |

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
3. Create specs in `tests/<module>/`, importing from `tests/fixtures/test-data.fixture.ts`
4. The module tab name must match an entry in `MODULE_TABS` in `src/data/types.ts`
