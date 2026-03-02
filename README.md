# hcm-uat-automation

Oracle HCM UAT automation framework using Playwright + TypeScript. **1,201 tests** across **11 modules** with **114 parallel bot accounts** (19 base + 95 clones).

## Quick Start

### Run all tests in parallel (default, ~7 minutes)

```bash
npx tsx scripts/run-parallel.ts
```

This spawns one test process per bot, running all 1,201 tests across 114 concurrent Oracle HCM sessions.

### Common options

```bash
# Smoke test — 1 test per bot (quick sanity check)
npx tsx scripts/run-parallel.ts --one-per-bot

# Single module only
npx tsx scripts/run-parallel.ts --module "Core HR"

# Limit to N bots
npx tsx scripts/run-parallel.ts --bots 5

# Filter by AUTOMATED TRACKING SHEET status (Not Run, Passed, Failed, etc.)
# This uses the automated tracking sheet to decide which tests to run
npx tsx scripts/run-parallel.ts --tracking-status "Not Run"

# Filter by UAT PLAN SHEET status (Not Started, Failed, Passed, etc.)
# This uses the original test plan sheet definitions, not the automated tracking
npx tsx scripts/run-parallel.ts --status "Not Started"
npx tsx scripts/run-parallel.ts --status "Failed,Ready for Retest"

# Only re-run previously passed/failed tests
RUN_PASSED_ONLY=true npx tsx scripts/run-parallel.ts
RUN_FAILED_ONLY=true npx tsx scripts/run-parallel.ts
```

### Serial execution (legacy, single user)

```bash
npx playwright test                              # All tests
npx playwright test tests/core-hr/               # One module
npx playwright test -g "HR-019"                  # By test ID
npx playwright test --list                       # List tests
npx playwright show-report                       # View HTML report
```

## Setup

### Prerequisites

1. **UAT Plan cache** — fetch from Google Sheets:
   ```bash
   npx tsx scripts/fetch-uat-plan.ts
   ```

2. **Test data** — generate field-level data from migration database:
   ```bash
   npx tsx scripts/generate-test-data.ts
   ```

3. **Configuration files**:
   - `.env` — Oracle HCM URL, credentials, Google Sheets OAuth
   - `.config/bot-credentials.json` — all 114 bot usernames + passwords
   - `.tracking-sheet-id` — Google Sheets tracking sheet ID

4. **Bot accounts** — create Oracle HCM bot user accounts:
   ```bash
   npx tsx scripts/create-bot-users.ts --clones 5 --parallel
   npx tsx scripts/provision-bot-accounts.ts --clones  # Assign security roles
   ```

## Architecture

### Data Pipeline

- **UAT Plan Sheet** (1,201 test cases) → `scripts/fetch-uat-plan.ts` → `.cache/uat-plan.json` → all spec files
- **Migration DB** (field-level form data) → `scripts/generate-test-data.ts` → `.cache-generated/field-data.json` → flows

### Three-Layer Pattern

1. **Page Objects** (`src/pages/`) — UI interactions, form filling, waiting
2. **Flows** (`src/flows/`) — Business scenarios, multi-step workflows
3. **Specs** (`tests/`) — Dynamic test generation from UAT Plan cache

### Parallel Execution

- **114 bot accounts**: 19 base bots + 95 clones (5 per base)
- **Direct Oracle login** — no SSO/MFA, faster than Okta (avoids rate limiting)
- **Test distribution** — round-robin across base + clones per bot
- **Concurrent sessions** — 124GB RAM / 32 CPUs handles 114 chromium browsers

### Test Assignment

Tests are dynamically assigned to bots via `testerName` → bot mapping in `src/config/bot-users.ts`. The `isTestable()` function in `uat-plan-provider.ts` filters tests to only those assigned to the current `PARALLEL_BOT` env var.

## Modules (11)

| Module | Tests | Spec File |
|--------|-------|-----------|
| Core HR | 600 | `tests/core-hr/core-hr-uat-plan.spec.ts` |
| Payroll | 113 | `tests/payroll/payroll-processing.spec.ts` |
| Absence Management | 111 | `tests/absence/absence-management.spec.ts` |
| Benefits | 139 | `tests/benefits/benefits.spec.ts` |
| Time and Labor | 67 | `tests/time-labor/time-and-labor.spec.ts` |
| Journeys | 66 | `tests/journeys/journeys.spec.ts` |
| Workforce Compensation | 52 | `tests/compensation/compensation.spec.ts` |
| MPDX | 24 | `tests/mpdx/mpdx.spec.ts` |
| SAA | 6 | `tests/saa/saa.spec.ts` |
| OneApp | 19 | `tests/oneapp/oneapp.spec.ts` |
| Other Functions | 4 | `tests/other/other-functions.spec.ts` |

## Tracking

Two Google Sheets are used:

**1. UAT Plan Sheet** (original test definitions)
- Maintained by stakeholders and human testers
- Contains: test descriptions, business processes, expected results, human tester status (Passed/Failed/Not Started)
- Updated via: `scripts/fetch-uat-plan.ts`
- Used by: `--status` flag to filter tests

**2. Automated Tracking Sheet** (test execution results)
- Maintained by automated test runs
- Contains: test results (Passed/Failed/Not Run), duration, error messages
- Updated via: `scripts/update-tracking-sheet.ts` (runs after each bot completes)
- Used by: `--tracking-status` flag to filter tests

The tracking sheet is updated **incrementally** as each bot finishes — updates are queued sequentially to avoid Google Sheets API rate limits. A progress report comparing before/after pass rates is printed at the end.

To update manually after a run:
```bash
npx tsx scripts/update-tracking-sheet.ts
```

## Environment Variables

Required in `.env`:

```env
ORACLE_HCM_URL=https://stafflife-icahjb-test.fa.ocs.oraclecloud.com
GOOGLE_SHEET_ID=<sheet-id>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_REFRESH_TOKEN=<oauth-refresh-token>
```

Optional:
- `RUN_PASSED_ONLY=true` — only run previously passed tests
- `RUN_FAILED_ONLY=true` — only run previously failed tests
- `RUN_STATUS_FILTER=passed,failed` — comma-separated status filter
- `PARALLEL_BOT=<botName>` — set by `run-parallel.ts` automatically
- `PARALLEL_BOT_ACCOUNT=<cloneName>` — overrides login credentials for clone processes

## Key Files

- `CLAUDE.md` — Full architecture & detailed reference
- `src/config/bot-users.ts` — Bot account mappings (testerName → bot)
- `src/data/uat-plan-provider.ts` — UAT Plan loader, isTestable() filter
- `playwright.parallel.config.ts` — Parallel mode config (no globalSetup)
- `scripts/run-parallel.ts` — Main orchestrator for parallel execution

## Performance

- **Wall-clock time**: ~7 minutes (1,201 tests across 114 bots)
- **Pass rate**: ~92% (66 failures mostly due to bot role limitations)
- **Timeout**: 300s per test, 60s navigation, 30s actions

## Troubleshooting

### Processes stop spawning before all bots start
The script automatically raises the file descriptor limit at startup (`prlimit`). If it still fails, check the system hard limit:
```bash
ulimit -Hn
```

### Clone login failures
Bot clones may need password reset/re-provisioning:
```bash
npx tsx scripts/provision-bot-accounts.ts --clones
```

### Test timeouts
Some flows (T&L admin, payroll scheduled processes) may timeout. Check bot roles and escalate to admin.

### Missing UAT Plan data
Re-fetch from Google Sheets:
```bash
npx tsx scripts/fetch-uat-plan.ts
```

### Tracking sheet sync fails
Verify Google Sheets OAuth credentials in `.env` and check sheet ID in `.tracking-sheet-id`.
