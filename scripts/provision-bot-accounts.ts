/**
 * Provision user accounts + assign security roles for existing bot employees.
 *
 * Uses a hybrid approach:
 *   - REST API (Basic Auth) for worker lookups and role validation
 *   - Security Console UI automation for account operations (create, password, roles)
 *
 * This matches the proven approach from assign-roles.ts and reset-bot-passwords.ts.
 *
 * Usage:
 *   npx tsx scripts/provision-bot-accounts.ts                    # All 19 base bots
 *   npx tsx scripts/provision-bot-accounts.ts bot_hr_admin       # Single bot (base or clone)
 *   npx tsx scripts/provision-bot-accounts.ts --clones           # All clone bots from credentials file
 *   npx tsx scripts/provision-bot-accounts.ts --discover-roles   # List available roles via REST
 *   npx tsx scripts/provision-bot-accounts.ts --check            # Check account status via Security Console
 *
 * Environment:
 *   HEADLESS=true           # Run headless (default: true)
 */

import { chromium, type Page } from 'playwright';
import { TOTP } from 'otpauth';
import { env } from '../src/config/environment';
import { getAllBotUsers, getBaseBotNames, getClonesForBot, type BotUserIdentity } from '../src/config/bot-users';
import { lookupPersonId, searchRoles, lookupRole } from './lib/hcm-rest-api';
import * as fs from 'fs';
import * as path from 'path';

// ── Role Mapping ─────────────────────────────────────────────────────

/** Common HR roles needed by most bots (using display names for Security Console search) */
const HR_SPECIALIST_ROLES = [
  'Human Resource Specialist',
  'CRU Human Resource Specialist View All',
  'CRU Human Resource Analyst View All',
];

/**
 * Cross-module roles. UAT Plan assigns testers across modules (e.g., an HR tester
 * may also have Payroll, Benefits, or Compensation tests), so all bots need roles
 * for every module their tests touch.
 */
const CROSS_MODULE_ROLES = [
  ...HR_SPECIALIST_ROLES,
  'Payroll Administrator',
  'Benefits Administrator',
  'Compensation Specialist',
  'Line Manager',
  'Time and Labor Manager',
];

/**
 * Map: botName → Oracle role display names to assign via Security Console.
 * These match the names used in the existing assign-roles.ts script.
 *
 * Most bots get CROSS_MODULE_ROLES since UAT Plan distributes tests across
 * modules regardless of tester specialty.
 */
const BOT_ROLE_MAP: Record<string, string[]> = {
  // HR Admin — full cross-module access
  bot_hr_admin: [...CROSS_MODULE_ROLES],

  // HR Specialists — cross-module (Payroll/Benefits/Comp tests assigned to HR testers)
  bot_hr_generalist_no_nid: ['Human Resource Specialist', 'Cru HR Specialist No Crisis and NID Data', 'Payroll Administrator', 'Benefits Administrator', 'Compensation Specialist', 'Line Manager', 'Time and Labor Manager'],
  bot_hr_generalist: [...CROSS_MODULE_ROLES],
  bot_hr_local_usops: [...CROSS_MODULE_ROLES],
  bot_hr_local_campus: [...CROSS_MODULE_ROLES],
  bot_hr_local_global: [...CROSS_MODULE_ROLES],
  bot_hr_local_global_crisis: [...CROSS_MODULE_ROLES],
  bot_hr_local_familylife: [...CROSS_MODULE_ROLES],
  bot_local_campus: [...CROSS_MODULE_ROLES],
  bot_hr_crisis: [...CROSS_MODULE_ROLES],
  bot_local_us_capacity: [...CROSS_MODULE_ROLES],

  // Dedicated API service user — needs comprehensive REST API access to all endpoints
  api_service: [
    ...CROSS_MODULE_ROLES,
    'IT Security Manager',
    'Human Capital Management Application Administrator',
    'CRU HCM Application Administrator View All',
    'Application Implementation Consultant',
  ],

  // Payroll bots
  bot_payroll_admin: [...CROSS_MODULE_ROLES],
  bot_payroll_spec: [...CROSS_MODULE_ROLES],

  // Benefits bot
  bot_benefit_admin: [...CROSS_MODULE_ROLES],

  // Time & Labor bot
  bot_time_admin: [...CROSS_MODULE_ROLES],

  // Compensation bots
  bot_comp_spec: [...CROSS_MODULE_ROLES],
  bot_comp_comm_approver: [...CROSS_MODULE_ROLES],

  // Manager/Approver bots
  bot_line_manager: [...CROSS_MODULE_ROLES],
  bot_vp_approver: [...CROSS_MODULE_ROLES],
  bot_div_approver: [...CROSS_MODULE_ROLES],
};

// ── Config ───────────────────────────────────────────────────────────

const CREDENTIALS_FILE = path.resolve(process.cwd(), '.config', 'bot-credentials.json');
const BOT_PASSWORD = 'WinBuildSend!1951@cru';
const HEADLESS = process.env.HEADLESS !== 'false';

// ── Common Helpers ───────────────────────────────────────────────────

async function waitForJET(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        const oj = (window as any).oj;
        if (!oj?.Context) return true;
        const bc = oj.Context.getPageContext().getBusyContext();
        return !bc.isReady || bc.isReady();
      } catch { return true; }
    },
    { timeout },
  );
}

async function clickSidebarUsers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim() === 'Users') {
        const parent = walker.currentNode.parentElement;
        if (parent && parent.offsetWidth > 0) {
          const rect = parent.getBoundingClientRect();
          if (rect.x < 200 && rect.y > 100) { parent.click(); return; }
        }
      }
    }
  });
  await page.waitForTimeout(3000);
}

// ── Login ────────────────────────────────────────────────────────────

/** Enter TOTP code with retry logic. */
async function enterTOTPCode(page: Page, totp: TOTP, mfaInput: ReturnType<Page['locator']>): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const rateLimitAlert = page.getByText('Too many attempts', { exact: false });
    const isRateLimited = await rateLimitAlert.isVisible({ timeout: 2000 }).catch(() => false);
    if (isRateLimited) {
      const waitSecs = 30 + attempt * 15;
      console.log(`[Login] Okta rate limited, waiting ${waitSecs}s...`);
      await page.waitForTimeout(waitSecs * 1000);
      await page.reload({ waitUntil: 'networkidle' });
      if (page.url().includes('fscmUI')) return;
      const hasMfaInput = await mfaInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasMfaInput) return;
    }

    const code = totp.generate();
    await mfaInput.fill(code);
    await page.locator('input[type="submit"]').click();
    await page.waitForTimeout(3_000);

    if (page.url().includes('fscmUI')) return;
    const secondFactorPage = await page.locator('a[aria-label="Select Password."]').isVisible({ timeout: 2000 }).catch(() => false);
    if (secondFactorPage) return;

    const errorMsg = page.locator('.o-form-has-errors, [data-se="o-form-error-container"]');
    const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasError && attempt < 5) {
      console.log(`[Login] TOTP attempt ${attempt} failed, waiting for next period...`);
      const now = Math.floor(Date.now() / 1000);
      const wait = 30 - (now % 30) + 1;
      await page.waitForTimeout(wait * 1000);
      continue;
    }
    if (attempt === 5 && !page.url().includes('fscmUI')) {
      await page.waitForURL('**/fscmUI/**', { timeout: 30_000 }).catch(() => {});
    }
  }
}

async function loginAsAdmin(page: Page): Promise<void> {
  console.log('[Login] Starting Okta SSO + TOTP MFA...');
  await page.goto(env.oracle.url);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (page.url().includes('fscmUI')) {
    console.log('[Login] Already authenticated');
    return;
  }

  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('input[name="identifier"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[name="identifier"]').fill(env.oracle.username);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3_000);

  const totp = new TOTP({ secret: env.okta.totpSecret });
  const mfaInput = page.locator('input[name="credentials.passcode"]');
  const gaSelect = page.locator('a[aria-label="Select Google Authenticator."]');
  const gaSelectVisible = await gaSelect.isVisible({ timeout: 5_000 }).catch(() => false);

  if (gaSelectVisible) {
    // New flow: MFA first (passwordless)
    console.log('[Login] New Okta flow: MFA first');
    await gaSelect.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3_000);
    await mfaInput.waitFor({ state: 'visible', timeout: 15_000 });
    await enterTOTPCode(page, totp, mfaInput);

    if (!page.url().includes('fscmUI')) {
      const pwdSelect = page.locator('a[aria-label="Select Password."]');
      const pwdSelectVisible = await pwdSelect.isVisible({ timeout: 5_000 }).catch(() => false);
      if (pwdSelectVisible) {
        await pwdSelect.click();
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(3_000);
        const pwField = page.locator('input[name="credentials.passcode"]');
        await pwField.waitFor({ state: 'visible', timeout: 10_000 });
        await pwField.fill(env.oracle.password);
        await page.locator('input[type="submit"]').click();
      }
    }
  } else {
    // Old flow: password first
    console.log('[Login] Old Okta flow: password first');
    const pwField = page.locator('input[name="credentials.passcode"]');
    await pwField.waitFor({ state: 'visible', timeout: 15_000 });
    await pwField.fill(env.oracle.password);
    await page.locator('input[type="submit"]').click();
    await page.waitForLoadState('networkidle').catch(() => {});

    await gaSelect.waitFor({ state: 'visible', timeout: 15_000 });
    await gaSelect.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await mfaInput.waitFor({ state: 'visible', timeout: 15_000 });
    await enterTOTPCode(page, totp, mfaInput);
  }

  if (!page.url().includes('fscmUI')) {
    await page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
  }
  console.log('[Login] Login successful');
}

async function navigateToSecurityConsole(page: Page): Promise<void> {
  await page.locator('a[title="Navigator"]').first().click({ force: true });
  await page.waitForTimeout(3000);
  // Click "Show More" repeatedly until fully expanded
  const showMore = page.locator('a:has-text("Show More")').first();
  for (let i = 0; i < 5; i++) {
    if (!await showMore.isVisible({ timeout: 2000 }).catch(() => false)) break;
    await showMore.click({ force: true });
    await page.waitForTimeout(1500);
  }
  await waitForJET(page);

  const secLink = page.getByRole('link', { name: 'Security Console' }).first();
  if (await secLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await secLink.click();
  } else {
    // Direct URL fallback
    console.log('[Nav] Security Console not in navigator, using direct URL');
    await page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_security_console', { timeout: 60_000 });
  }
  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  await page.waitForTimeout(5000);

  // Dismiss Warning
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  // Click Users sidebar
  await clickSidebarUsers(page);
  console.log('[Nav] On User Accounts page');
}

// ── Credentials File ─────────────────────────────────────────────────

function loadCredentials(): Record<string, { username: string; password: string }> {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  }
  return {};
}

function saveCredentials(creds: Record<string, { username: string; password: string }>): void {
  const dir = path.dirname(CREDENTIALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n');
}

// ── CLI ──────────────────────────────────────────────────────────────

interface CliArgs {
  targetBot?: string;
  discoverRoles: boolean;
  checkOnly: boolean;
  clones: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { discoverRoles: false, checkOnly: false, clones: false };

  for (const arg of args) {
    if (arg === '--discover-roles') result.discoverRoles = true;
    else if (arg === '--check') result.checkOnly = true;
    else if (arg === '--clones') result.clones = true;
    else if (!arg.startsWith('--')) result.targetBot = arg;
  }

  return result;
}

/**
 * Derive the base bot name from a clone name (strip trailing _N suffix).
 * e.g., "bot_hr_admin_3" → "bot_hr_admin"
 */
function getBaseBotName(botName: string): string {
  return botName.replace(/_\d+$/, '');
}

/**
 * Get roles for a bot by looking up its base bot name in BOT_ROLE_MAP.
 * Works for both base bots and clones.
 */
function getRolesForBot(botName: string): string[] {
  const roles = BOT_ROLE_MAP[botName];
  if (roles) return roles;
  // Try base bot name (clone → base)
  const baseName = getBaseBotName(botName);
  return BOT_ROLE_MAP[baseName] || [];
}

// ── Discover Roles (REST API) ────────────────────────────────────────

async function discoverRolesViaRest(page: Page): Promise<void> {
  const baseUrl = env.oracle.url.replace(/\/$/, '');
  console.log('\n=== Discovering Available Oracle HCM Roles (REST API) ===\n');

  const searchTerms = [
    'Human Resource Specialist',
    'HR Specialist',
    'Payroll',
    'Benefits',
    'Compensation',
    'Line Manager',
    'Cru',
  ];

  for (const term of searchTerms) {
    console.log(`--- Search: "${term}" ---`);
    const roles = await searchRoles(page, baseUrl, term);
    if (roles.length === 0) {
      console.log('  (no results)');
    } else {
      for (const r of roles) {
        console.log(`  ${r.RoleCode} — ${r.RoleName}`);
      }
    }
    console.log('');
  }

  // Validate configured role names against REST API
  console.log('=== Validating configured role codes ===\n');
  const allRoleNames = new Set<string>();
  for (const roles of Object.values(BOT_ROLE_MAP)) {
    for (const r of roles) allRoleNames.add(r);
  }

  for (const roleName of Array.from(allRoleNames)) {
    const results = await searchRoles(page, baseUrl, roleName, 5);
    const found = results.find(r => r.RoleName === roleName);
    const status = found ? `OK (${found.RoleCode})` : 'NOT FOUND';
    console.log(`  "${roleName}": ${status}`);
  }
}

// ── Check Account Status (Security Console UI) ──────────────────────

async function checkAccountStatus(page: Page, bots: readonly BotUserIdentity[]): Promise<void> {
  console.log('\n=== Bot Account Status (Security Console) ===\n');
  console.log(`${'Bot Name'.padEnd(35)} ${'PersonNum'.padEnd(12)} ${'Account'.padEnd(30)} ${'Status'}`);
  console.log('-'.repeat(90));

  for (const bot of bots) {
    const searchInput = page.locator('input[placeholder*="3 or more"]').first();
    await searchInput.clear();
    await searchInput.fill(`uat.${bot.botName}`);
    await searchInput.press('Enter');
    await page.waitForTimeout(5000);

    const noData = page.getByText('No data to display');
    if (await noData.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`${bot.botName.padEnd(35)} ${bot.personNumber.padEnd(12)} NO ACCOUNT`);
      continue;
    }

    // Extract username and status from the search results list
    // The Security Console card format shows: "User Name  uat.botname ... Status Active"
    const bodyText = await page.textContent('body') || '';

    // Try multiple patterns for username extraction
    let username = 'found';
    const patterns = [
      /User Name\s+(uat\.\S+)/,
      /User Name(uat\.\S+)/,
      new RegExp(`(uat\\.${bot.botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S*)`),
    ];
    for (const pat of patterns) {
      const m = bodyText.match(pat);
      if (m) { username = m[1]; break; }
    }

    // Extract status
    const statusMatch = bodyText.match(/Status\s*(Active|Locked|Inactive)/i);
    const status = statusMatch?.[1] || 'Active';

    console.log(`${bot.botName.padEnd(35)} ${bot.personNumber.padEnd(12)} ${username.padEnd(30)} ${status}`);
  }
}

// ── Security Console: Create User Account ────────────────────────────

/**
 * Create a user account for a bot user via Security Console → Users → Add User Account.
 *
 * Oracle Security Console "Add User Account" form:
 *   - Person (autocomplete LOV) — search by last name (= botName)
 *   - User Name (text input)
 *   - Password + Confirm Password (password inputs)
 *   - Click "Add User Account" button in the form to save
 *
 * Takes screenshots at each step in /tmp/ for debugging.
 * Returns the username on success, or null on failure.
 */
async function createAccountViaUI(
  page: Page,
  bot: BotUserIdentity,
): Promise<string | null> {
  const username = `uat.${bot.botName}`;
  console.log(`  Creating account via Security Console: ${username}...`);

  // Step 1: Click "Add User Account" button on the Users page
  const addBtn = page.getByRole('button', { name: 'Add User Account' });
  if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Fallback: try link version
    const addLink = page.locator('a:has-text("Add User Account")').first();
    if (await addLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addLink.click();
    } else {
      console.log(`  ERROR: "Add User Account" button not found`);
      await page.screenshot({ path: `/tmp/create-account-${bot.botName}-no-button.png` }).catch(() => {});
      return null;
    }
  } else {
    await addBtn.click();
  }
  await page.waitForTimeout(5000);
  await waitForJET(page);
  await page.screenshot({ path: `/tmp/create-account-${bot.botName}-step1-form.png` }).catch(() => {});

  // Step 2: Fill User Information fields (First Name, Last Name, Email)
  // The "Add User Account" form has plain text fields, not a Person LOV.
  const labeledFields: Array<{ label: string; value: string }> = [
    { label: 'First Name', value: 'UAT' },
    { label: 'Last Name', value: bot.botName.replace(/^bot_/, '') },
    { label: 'Email', value: `uat.${bot.botName}@cru.org` },
  ];
  for (const { label, value } of labeledFields) {
    const field = page.getByLabel(label, { exact: true });
    if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
      await field.fill(value);
      console.log(`    ${label}: ${value}`);
    }
  }
  await page.screenshot({ path: `/tmp/create-account-${bot.botName}-step2-info.png` }).catch(() => {});

  // Step 3: Fill User Name field
  let userNameFilled = false;
  // Try label-based first (most reliable for this form)
  const userNameByLabel = page.getByLabel('User Name', { exact: true });
  if (await userNameByLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userNameByLabel.fill(username);
    userNameFilled = true;
    console.log(`    Username filled via label: ${username}`);
  } else {
    // Fallback: id-based selectors
    const userNameSelectors = [
      'input[id*="UserName" i]',
      'input[id*="userName"]',
      'input[id*="username"]',
    ];
    for (const sel of userNameSelectors) {
      const field = page.locator(sel).first();
      if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
        await field.clear();
        await field.fill(username);
        userNameFilled = true;
        console.log(`    Username filled via ${sel}`);
        break;
      }
    }
  }

  // Step 4: Fill Password and Confirm Password
  const pwdFields = page.locator('input[type="password"]:visible');
  const pwdCount = await pwdFields.count();
  if (pwdCount >= 2) {
    await pwdFields.nth(0).fill(BOT_PASSWORD);
    await pwdFields.nth(1).fill(BOT_PASSWORD);
    console.log(`    Password fields filled (${pwdCount} found)`);
  } else if (pwdCount === 1) {
    await pwdFields.nth(0).fill(BOT_PASSWORD);
    console.log(`    Only 1 password field found`);
  } else {
    console.log(`    WARNING: No password fields found`);
  }

  await page.screenshot({ path: `/tmp/create-account-${bot.botName}-step3-filled.png` }).catch(() => {});

  // Step 5: Submit the form
  // Try several button labels that Oracle uses
  const submitLabels = ['Add User Account', 'Save and Close', 'Save', 'Submit', 'OK'];
  let submitted = false;

  for (const label of submitLabels) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(8000);
      submitted = true;
      console.log(`    Submitted via "${label}" button`);
      break;
    }
  }

  if (!submitted) {
    console.log(`    ERROR: No submit button found`);
    await page.screenshot({ path: `/tmp/create-account-${bot.botName}-no-submit.png` }).catch(() => {});
    // Cancel
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(3000);
    }
    return null;
  }

  await page.screenshot({ path: `/tmp/create-account-${bot.botName}-step4-result.png` }).catch(() => {});

  // Step 6: Check for errors
  const errorIndicators = page.locator('.x6w, [class*="error" i], [class*="Error"]').first();
  const hasError = await errorIndicators.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasError) {
    const errorText = await errorIndicators.textContent().catch(() => 'unknown error');
    console.log(`    ERROR after submit: ${errorText}`);
    // Try to dismiss and go back
    const okBtn = page.getByRole('button', { name: 'OK' });
    if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await okBtn.click();
      await page.waitForTimeout(2000);
    }
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(3000);
    }
    return null;
  }

  // Step 7: Check if we ended up on a detail page (success) or back on user list
  // On success, Security Console may show the account detail page or user list
  const bodyText = await page.textContent('body') || '';
  if (bodyText.includes('User Account Details') || bodyText.includes(username)) {
    console.log(`  Account created successfully: ${username}`);
    return username;
  }

  // Check if we see "Confirmation" or success message
  if (bodyText.includes('success') || bodyText.includes('Success') || bodyText.includes('created')) {
    console.log(`  Account created successfully: ${username}`);
    return username;
  }

  // Assume success if no error was detected
  console.log(`  Account creation submitted (assuming success): ${username}`);
  return username;
}

// ── Security Console: Reset Password ─────────────────────────────────

/**
 * Reset password for a bot user via Security Console.
 * Reuses the proven pattern from reset-bot-passwords.ts.
 */
async function resetPasswordViaUI(
  page: Page,
  botName: string,
): Promise<boolean> {
  // We should already be on the user detail page
  const resetBtn = page.getByRole('button', { name: 'Reset Password' });
  if (!await resetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  Reset Password button not found`);
    return false;
  }
  await resetBtn.click();
  await page.waitForTimeout(3000);

  // Click "Manually change the password" radio button (second radio)
  const manualRadio = page.locator('input[type="radio"]').nth(1);
  await manualRadio.click({ force: true });
  await page.waitForTimeout(1000);

  // Fill password fields
  const pwdFields = page.locator('input[type="password"]');
  const newPwd = pwdFields.nth(0);
  const confirmPwd = pwdFields.nth(1);

  await newPwd.waitFor({ state: 'visible', timeout: 5000 });
  const isEnabled = await newPwd.isEnabled().catch(() => false);
  if (!isEnabled) {
    await page.evaluate(() => {
      document.querySelectorAll('input[type="password"]').forEach(inp => {
        (inp as HTMLInputElement).disabled = false;
      });
    });
    await page.waitForTimeout(500);
  }

  await newPwd.fill(BOT_PASSWORD);
  await confirmPwd.fill(BOT_PASSWORD);
  await page.waitForTimeout(500);

  // Click "Reset Password" button in dialog
  const dialogResetBtn = page.locator('button:has-text("Reset Password")').last();
  await dialogResetBtn.click();
  await page.waitForTimeout(5000);

  console.log(`  Password reset`);
  return true;
}

// ── Security Console: Assign Roles ───────────────────────────────────

/**
 * Add roles to a user via Security Console.
 * Reuses the proven pattern from assign-roles.ts.
 * Expects the user detail page is already open.
 */
async function addRolesViaUI(
  page: Page,
  botName: string,
  roles: string[],
): Promise<{ added: string[]; skipped: string[]; errors: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Check existing roles
  const existingRoles = await page.evaluate(() => {
    const roles: string[] = [];
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
      if (headerTexts.includes('Role Code')) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const firstCell = row.querySelector('td');
          const name = firstCell?.textContent?.trim();
          if (name) roles.push(name);
        }
        break;
      }
    }
    return roles;
  });

  console.log(`  Current roles: ${existingRoles.join(', ') || '(none)'}`);

  const rolesToAdd = roles.filter(r => !existingRoles.includes(r));
  const alreadyHas = roles.filter(r => existingRoles.includes(r));
  for (const r of alreadyHas) skipped.push(r);

  if (rolesToAdd.length === 0) {
    console.log(`  All roles already assigned`);
    return { added, skipped, errors };
  }

  // Click Edit
  const editBtn = page.getByRole('button', { name: 'Edit' });
  if (!await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    errors.push('Edit button not found');
    return { added, skipped, errors };
  }
  await editBtn.click();
  await page.waitForTimeout(3000);

  // Click Add Role → opens dialog
  const addRoleBtn = page.getByRole('button', { name: 'Add Role' }).first();
  await addRoleBtn.click();
  await page.waitForTimeout(3000);

  // For each role, search and add
  for (const roleName of rolesToAdd) {
    try {
      const roleSearchBox = page.locator('input[placeholder*="3 or more characters to search"]').last();
      if (!await roleSearchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
        errors.push(`Search box not visible for ${roleName}`);
        break;
      }
      await roleSearchBox.clear();
      await roleSearchBox.fill(roleName);

      // Click search icon or press Enter
      const searchIcon = page.locator('[id*="urSrcBx"] ~ a, button[title*="Search"], img[title*="Search"]').first();
      if (await searchIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchIcon.click();
      } else {
        await roleSearchBox.press('Enter');
      }
      await page.waitForTimeout(5000);

      // Check for no results
      if (await page.locator('text=Search Result Count : 0').isVisible({ timeout: 1000 }).catch(() => false)) {
        errors.push(`Role "${roleName}" not found`);
        continue;
      }

      // Select the role from results
      const roleRow = page.locator(`td:has-text("${roleName}")`).first();
      if (await roleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleRow.click();
        await page.waitForTimeout(1000);
      } else {
        const roleLink = page.locator(`a:has-text("${roleName}")`).last();
        if (await roleLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleLink.click();
          await page.waitForTimeout(1000);
        } else {
          errors.push(`Role "${roleName}" not visible in results`);
          continue;
        }
      }

      // Click "Add Role Membership"
      const addMembershipBtn = page.getByRole('button', { name: 'Add Role Membership' });
      if (await addMembershipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addMembershipBtn.click();
        await page.waitForTimeout(3000);
        added.push(roleName);
        console.log(`    + Added: ${roleName}`);
      } else {
        errors.push(`"Add Role Membership" button not visible for ${roleName}`);
      }
    } catch (err: any) {
      errors.push(`Error adding "${roleName}": ${err.message.slice(0, 80)}`);
    }
  }

  // Close the dialog
  const dialogDoneBtn = page.getByRole('button', { name: 'Done' }).last();
  if (await dialogDoneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dialogDoneBtn.click();
    await page.waitForTimeout(2000);
  }

  // Exit edit mode — roles persist immediately, no save needed
  const saveBtn = page.getByRole('button', { name: 'Save and Close' });
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isDisabled = await saveBtn.getAttribute('aria-disabled');
    if (isDisabled === 'true') {
      await cancelBtn.click();
    } else {
      await saveBtn.click();
    }
    await page.waitForTimeout(3000);
  } else if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(3000);
  }

  // Dismiss any warning
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  return { added, skipped, errors };
}

// ── Provision Single Bot ─────────────────────────────────────────────

interface ProvisionResult {
  botName: string;
  status: 'created' | 'exists' | 'roles_updated' | 'failed';
  username?: string;
  rolesAdded: number;
  rolesSkipped: number;
  roleErrors: string[];
  error?: string;
}

async function provisionBot(
  page: Page,
  bot: BotUserIdentity,
): Promise<ProvisionResult> {
  const rolesToAssign = getRolesForBot(bot.botName);
  // Use username from credentials file if available, otherwise default to uat.botName
  const credFile = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  const username = credFile[bot.botName]?.username || `uat.${bot.botName}`;

  console.log(`\n[${bot.botName}] Provisioning (PersonNumber: ${bot.personNumber}, username: ${username})...`);

  try {
    // Search for existing account
    const searchInput = page.locator('input[placeholder*="3 or more"]').first();
    await searchInput.clear();
    await searchInput.fill(username);
    await searchInput.press('Enter');
    await page.waitForTimeout(5000);

    const noData = page.getByText('No data to display');
    const accountMissing = await noData.isVisible({ timeout: 2000 }).catch(() => false);

    if (accountMissing) {
      console.log(`  Account not found — attempting to create via Security Console...`);

      const createdUsername = await createAccountViaUI(page, bot);
      if (!createdUsername) {
        return {
          botName: bot.botName,
          status: 'failed',
          rolesAdded: 0, rolesSkipped: 0, roleErrors: [],
          error: `Failed to create account ${username}. Check screenshots in /tmp/create-account-${bot.botName}-*.png`,
        };
      }

      // After account creation, we may be on the detail page or the user list.
      // Navigate back to user list and search for the new account to continue with role assignment.
      const doneBtn = page.getByRole('button', { name: 'Done' });
      if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await doneBtn.click();
        await page.waitForTimeout(3000);
      }

      // Reset password to ensure it's set correctly
      // First, search for the new account
      const searchInput2 = page.locator('input[placeholder*="3 or more"]').first();
      await searchInput2.clear();
      await searchInput2.fill(createdUsername);
      await searchInput2.press('Enter');
      await page.waitForTimeout(5000);

      const accountLink2 = page.locator(`a:has-text("${bot.botName}")`).first();
      if (await accountLink2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await accountLink2.click();
        await page.waitForTimeout(5000);

        // Reset password
        await resetPasswordViaUI(page, bot.botName);

        // Now assign roles (we're on the detail page)
        let rolesResult = { added: [] as string[], skipped: [] as string[], errors: [] as string[] };
        if (rolesToAssign.length > 0) {
          rolesResult = await addRolesViaUI(page, bot.botName, rolesToAssign);
        }

        // Go back to user list
        const backDone = page.getByRole('button', { name: 'Done' });
        if (await backDone.isVisible({ timeout: 5000 }).catch(() => false)) {
          await backDone.click();
          await page.waitForTimeout(3000);
        }

        return {
          botName: bot.botName,
          status: 'created',
          username: createdUsername,
          rolesAdded: rolesResult.added.length,
          rolesSkipped: rolesResult.skipped.length,
          roleErrors: rolesResult.errors,
        };
      }

      // Could not find the newly created account — partial success
      return {
        botName: bot.botName,
        status: 'created',
        username: createdUsername,
        rolesAdded: 0, rolesSkipped: 0, roleErrors: ['Could not find account after creation for role assignment'],
      };
    }

    // Click into the account — try username first, then botName
    let accountLink = page.locator(`a:has-text("${username}")`).first();
    if (!await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      accountLink = page.locator(`a:has-text("${bot.botName}")`).first();
    }
    if (!await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Try clicking the first result link
      accountLink = page.locator('.x1ib a, [class*="UserName"] a, td a').first();
    }
    if (!await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      return {
        botName: bot.botName,
        status: 'failed',
        rolesAdded: 0, rolesSkipped: 0, roleErrors: [],
        error: `Account link not visible after search for ${username}`,
      };
    }
    await accountLink.click();
    await page.waitForTimeout(5000);

    // Reset password if needed (auto-created accounts don't have known passwords)
    const resetBtn = page.getByRole('button', { name: 'Reset Password' });
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetPasswordViaUI(page, bot.botName);
      // Clear leftover ADF modal glass pane that blocks subsequent clicks
      await page.evaluate(() => {
        document.querySelectorAll('.AFModalGlassPane').forEach(el => el.remove());
      });
      await page.waitForTimeout(2000);
    }

    // Clear any leftover ADF modal glass pane before role assignment
    await page.evaluate(() => {
      document.querySelectorAll('.AFModalGlassPane').forEach(el => el.remove());
    });
    await page.waitForTimeout(2000);

    // Assign roles
    let rolesResult = { added: [] as string[], skipped: [] as string[], errors: [] as string[] };
    if (rolesToAssign.length > 0) {
      rolesResult = await addRolesViaUI(page, bot.botName, rolesToAssign);
    } else {
      console.log(`  No additional roles needed`);
    }

    // Click Done to go back to user list
    const doneBtn = page.getByRole('button', { name: 'Done' });
    if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(3000);
    }

    const statusType = rolesResult.added.length > 0 ? 'roles_updated' as const : 'exists' as const;

    return {
      botName: bot.botName,
      status: statusType,
      username,
      rolesAdded: rolesResult.added.length,
      rolesSkipped: rolesResult.skipped.length,
      roleErrors: rolesResult.errors,
    };
  } catch (err: any) {
    console.log(`  ERROR: ${err.message}`);
    // Try to recover to user list
    try {
      const doneBtn = page.getByRole('button', { name: 'Done' });
      if (await doneBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await doneBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch { /* ignore */ }

    return {
      botName: bot.botName,
      status: 'failed',
      rolesAdded: 0, rolesSkipped: 0, roleErrors: [],
      error: err.message,
    };
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cliArgs = parseArgs();
  const allBots = getAllBotUsers();

  // Determine which bots to process
  let botsToProcess: BotUserIdentity[];
  if (cliArgs.clones) {
    // --clones: discover all clone bots from credentials file
    const baseNames = getBaseBotNames();
    const cloneBots: BotUserIdentity[] = [];
    for (const baseName of baseNames) {
      const cloneNames = getClonesForBot(baseName);
      for (const cloneName of cloneNames) {
        cloneBots.push({
          botName: cloneName,
          sheetName: '',
          personNumber: '',
        });
      }
    }
    if (cloneBots.length === 0) {
      console.log('No clone bots found in credentials file.');
      console.log('Run: npx tsx scripts/create-bot-users.ts --clones 5 --parallel');
      process.exit(1);
    }
    console.log(`Found ${cloneBots.length} clone bots to provision`);
    botsToProcess = cloneBots;
  } else if (cliArgs.targetBot) {
    // Single bot — check BOT_USERS first, then accept any name (for clones)
    const bot = allBots.find(b => b.botName === cliArgs.targetBot);
    if (bot) {
      botsToProcess = [bot];
    } else {
      // Accept arbitrary bot name (e.g., bot_hr_admin_1)
      botsToProcess = [{
        botName: cliArgs.targetBot,
        sheetName: '',
        personNumber: '',
      }];
    }
  } else {
    // Deduplicate base bots from BOT_USERS (which has aliases)
    const seen = new Set<string>();
    botsToProcess = [];
    for (const b of allBots) {
      if (!seen.has(b.botName)) {
        seen.add(b.botName);
        botsToProcess.push(b);
      }
    }
  }

  // Launch browser
  console.log(`[Main] Launching browser (headless=${HEADLESS})...`);
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    // --discover-roles: uses REST API (no UI login needed for lookups)
    if (cliArgs.discoverRoles) {
      // Still need to navigate to any page for page.request to work
      await page.goto('about:blank');
      await discoverRolesViaRest(page);
      return;
    }

    // Login for Security Console access
    await loginAsAdmin(page);
    await page.waitForTimeout(3000);

    // Navigate to Security Console → Users
    await navigateToSecurityConsole(page);

    // --check mode
    if (cliArgs.checkOnly) {
      await checkAccountStatus(page, botsToProcess);
      return;
    }

    // Provision mode
    console.log(`\n=== Provisioning ${botsToProcess.length} bot accounts ===\n`);

    const credentials = loadCredentials();
    const results: ProvisionResult[] = [];

    for (const bot of botsToProcess) {
      const result = await provisionBot(page, bot);
      results.push(result);

      // Update credentials file for existing/updated accounts
      if (result.status !== 'failed') {
        credentials[bot.botName] = {
          username: result.username || `uat.${bot.botName}`,
          password: BOT_PASSWORD,
        };
      }
    }

    // Save updated credentials
    saveCredentials(credentials);
    console.log(`\nCredentials saved to ${CREDENTIALS_FILE}`);

    // Summary
    console.log('\n=== SUMMARY ===\n');
    const created = results.filter(r => r.status === 'created');
    const existing = results.filter(r => r.status === 'exists');
    const updated = results.filter(r => r.status === 'roles_updated');
    const failed = results.filter(r => r.status === 'failed');

    if (created.length > 0) {
      console.log(`Created (${created.length}):`);
      for (const r of created) console.log(`  + ${r.botName} → ${r.username}`);
    }
    if (updated.length > 0) {
      console.log(`Roles Updated (${updated.length}):`);
      for (const r of updated) console.log(`  ~ ${r.botName}: +${r.rolesAdded} roles`);
    }
    if (existing.length > 0) {
      console.log(`Already Complete (${existing.length}):`);
      for (const r of existing) console.log(`  = ${r.botName} (${r.rolesSkipped} roles)`);
    }
    if (failed.length > 0) {
      console.log(`Failed (${failed.length}):`);
      for (const r of failed) console.log(`  x ${r.botName}: ${r.error}`);
    }

    const totalRoleErrors = results.flatMap(r => r.roleErrors);
    if (totalRoleErrors.length > 0) {
      console.log(`\nRole Errors (${totalRoleErrors.length}):`);
      for (const e of totalRoleErrors) console.log(`  ! ${e}`);
    }

    console.log(`\nTotal: ${created.length} created, ${updated.length} updated, ${existing.length} unchanged, ${failed.length} failed`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
