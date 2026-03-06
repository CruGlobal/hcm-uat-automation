/**
 * Create bot users in Oracle HCM via the "Hire an Employee" wizard.
 *
 * This script uses Playwright to automate the 5-step Hire wizard directly,
 * leveraging Oracle ADF component APIs for reliable form interaction.
 *
 * Usage:
 *   npx tsx scripts/create-bot-users.ts                    # Create all remaining users
 *   npx tsx scripts/create-bot-users.ts bot_comp_spec      # Create a specific user by name
 *   npx tsx scripts/create-bot-users.ts --clones 5         # Create 5 clones of each role (serial)
 *   npx tsx scripts/create-bot-users.ts --clones 5 --parallel                # Parallel: 19 bots hire concurrently
 *   npx tsx scripts/create-bot-users.ts --clones 5 --parallel --max-concurrent 10  # Limit concurrency
 *   npx tsx scripts/create-bot-users.ts --reset            # Reset progress, start fresh
 *
 * Environment:
 *   HEADLESS=true           # Run headless (default: false for debugging)
 *   SLOW_MO=200             # Slow down actions by N ms (default: 0)
 *
 * Input:  /tmp/bot-users-to-create.json  (array of BotUser objects)
 * State:  /tmp/bot-user-progress.json    (tracks created users, survives restarts)
 * Output: /tmp/bot-user-creation-results.json (full results log)
 */

import { chromium, type Page } from 'playwright';
import { TOTP } from 'otpauth';
import { env } from '../src/config/environment';
import { lookupPersonId } from './lib/hcm-rest-api';
import { getBotCredentials, getBaseBotNames } from '../src/config/bot-users';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

interface BotUser {
  row: number;
  bot_name: string;
  sheet_name: string;
  hire_date: string;
  legal_employer: string;
  hire_way: string;
  hire_reason: string;
  business_unit: string;
  last_name: string;
  first_name: string;
  gender: string;
  dob: string;
  nid_country: string;
  nid_type: string;
  nid: string;
  email_type: string;
  email: string;
  person_type: string;
  job: string;
  department: string;
  location: string;
  assignment_category: string;
  regular_temp: string;
  ft_pt: string;
  hourly_salaried: string;
  people_group: string;
}

interface ProgressEntry {
  index: number;
  bot_name: string;
  person_number: string;
}

interface ProgressFile {
  created: ProgressEntry[];
  remaining: number[];
}

interface CreationResult {
  bot_name: string;
  status: 'created' | 'failed' | 'skipped';
  person_number?: string;
  error?: string;
  timestamp: string;
}

// ── Config ───────────────────────────────────────────────────────────

const INPUT_FILE = '/tmp/bot-users-to-create.json';
const PROGRESS_FILE = '/tmp/bot-user-progress.json';
const RESULTS_FILE = '/tmp/bot-user-creation-results.json';
const SCREENSHOT_DIR = '/tmp/bot-creation-screenshots';

const HEADLESS = process.env.HEADLESS === 'true';
const SLOW_MO = Number(process.env.SLOW_MO) || 0;

// ── ADF Helpers ──────────────────────────────────────────────────────

/** Wait for Oracle JET/ADF busy context to become ready. */
async function waitForJET(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        const oj = (window as any).oj;
        if (!oj?.Context) return true; // JET not loaded yet, keep going
        const bc = oj.Context.getPageContext().getBusyContext();
        return !bc.isReady || bc.isReady();
      } catch {
        return true;
      }
    },
    { timeout },
  );
}

/** Wait for full page readiness: network idle + JET busy context. */
async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForJET(page);
}

/** Dismiss any Oracle HCM notification popups or walkme guides. */
async function dismissPopups(page: Page): Promise<void> {
  const dismissSelectors = [
    '.walkme-click-and-hover',
    '.walkme-custom-balloon-close-button',
    'button[aria-label="Close"]',
    '.oj-dialog-close-icon',
    '.x1o6[role="button"]',
    '[id*="WalkMe"]',
    'div.oj-popup-close',
    'a[aria-label="Close notification"]',
  ];
  for (const selector of dismissSelectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

/** Remove any leftover ADF popup glass panes that block interaction. */
async function clearGlassPane(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('.AFModalGlassPane').forEach((el) => el.remove());
  });
}

/**
 * Find an ADF input element by partial ID pattern.
 * ADF component IDs shift after Legal Employer re-renders the form,
 * so we search by the stable suffix (e.g., 'it20' for Last Name).
 * Returns the element's full ID or null.
 */
async function findAdfInputByPartialId(
  page: Page,
  pattern: string,
  inputType = 'input',
): Promise<string | null> {
  return page.evaluate(
    ({ pat, tag }) => {
      const els = document.querySelectorAll(`${tag}[id*="${pat}"]`);
      for (const el of Array.from(els)) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) {
          return htmlEl.id;
        }
      }
      return null;
    },
    { pat: pattern, tag: inputType },
  );
}

/**
 * Set an ADF selectOneChoice value using the ADF API.
 * This is the only reliable way to set readonly comboboxes (Gender, Legal Employer, NID Type).
 * Searches by label match (fuzzy), falling back to setValue(raw).
 */
async function setAdfSelectOneChoice(
  page: Page,
  componentIdPattern: string,
  value: string,
): Promise<boolean> {
  return page.evaluate(
    ({ pattern, val }) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return false;

      // Find the component by scanning all inputs matching the pattern
      const candidates = document.querySelectorAll(`[id*="${pattern}"]`);
      for (const el of Array.from(candidates)) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.offsetWidth === 0) continue;
        const cid = htmlEl.id.replace(/::content$/, '');
        const comp = adfPage.findComponentByAbsoluteId(cid);
        if (!comp) continue;

        const items = comp.getSelectItems?.();
        if (items) {
          const nVal = val.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
          // Exact match first
          for (let i = 0; i < items.length; i++) {
            if (items[i].getLabel?.() === val || items[i].getValue?.() === val) {
              comp.setValue(items[i].getValue());
              return true;
            }
          }
          // Fuzzy match
          for (let i = 0; i < items.length; i++) {
            const nl = (items[i].getLabel?.() || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
            if (nl === nVal || nl.includes(nVal) || nVal.includes(nl)) {
              comp.setValue(items[i].getValue());
              return true;
            }
          }
        }
        // Direct value set
        comp.setValue(val);
        return true;
      }
      return false;
    },
    { pattern: componentIdPattern, val: value },
  );
}

/**
 * Set an ADF input text field value using the ADF API.
 * Finds the component by partial ID, then calls setValue().
 */
async function setAdfInputValue(
  page: Page,
  partialId: string,
  value: string,
): Promise<boolean> {
  return page.evaluate(
    ({ pat, val }) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return false;

      const els = document.querySelectorAll(`input[id*="${pat}"]`);
      for (const el of Array.from(els)) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.offsetWidth === 0) continue;
        const cid = htmlEl.id.replace(/::content$/, '');
        const comp = adfPage.findComponentByAbsoluteId(cid);
        if (comp) {
          comp.setValue(val);
          return true;
        }
      }
      return false;
    },
    { pat: partialId, val: value },
  );
}

/**
 * Click an ADF wizard button (Next, Back, Submit, Cancel) by visible text.
 * ADF uses <a role="button"> elements that need AdfActionEvent to trigger
 * server-side actions. Standard click does not trigger the server round-trip.
 */
async function clickAdfButton(page: Page, buttonText: string): Promise<void> {
  const clicked = await page.evaluate((text: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) return false;
    const links = document.querySelectorAll('a[role="button"]');
    for (const a of Array.from(links)) {
      const htmlA = a as HTMLElement;
      if (htmlA.textContent?.trim() === text && htmlA.offsetWidth > 0) {
        // Walk up parents to find ADF component
        let el: HTMLElement | null = htmlA;
        for (let i = 0; i < 5; i++) {
          el = el?.parentElement ?? null;
          if (!el) break;
          if (el.id) {
            const comp = adfPage.findComponentByAbsoluteId(el.id);
            if (comp) {
              const evt = new (window as any).AdfActionEvent(comp);
              evt.queue();
              return true;
            }
          }
        }
      }
    }
    return false;
  }, buttonText);

  if (!clicked) {
    // Fallback: try regular click on button/link with that text
    const btn = page.locator(`a:has-text("${buttonText}"), button:has-text("${buttonText}")`).first();
    const isVisible = await btn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await btn.click({ force: true });
    } else {
      throw new Error(`ADF button "${buttonText}" not found on page`);
    }
  }

  await page.waitForTimeout(2000);
  await waitForJET(page);
}

/**
 * Click an ADF link/action by its component ID.
 * Queues an AdfActionEvent for server-side processing.
 */
async function clickAdfLink(page: Page, componentId: string): Promise<void> {
  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) throw new Error('AdfPage.PAGE not available');
    const comp = adfPage.findComponentByAbsoluteId(id);
    if (!comp) throw new Error(`ADF component not found: ${id}`);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);
  await page.waitForTimeout(2000);
  await waitForJET(page);
}

/**
 * Handle LOV (List of Values) dialog that appears after Tab or LOV icon click.
 * Selects the first matching row and clicks OK.
 */
async function handleLovDialog(page: Page, matchText?: string): Promise<boolean> {
  const glassPane = page.locator('div.AFModalGlassPane');
  const hasDialog = await glassPane.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasDialog) return true; // No dialog = value was resolved

  await page.waitForTimeout(2000);
  const dialogLayer = page.locator('#DhtmlZOrderManagerLayerContainer');
  const resultRows = dialogLayer.locator('[_afrrk]');
  const rowCount = await resultRows.count();

  if (rowCount > 0) {
    if (matchText && rowCount > 1) {
      const matchRow = resultRows.filter({ hasText: matchText }).first();
      const matchVisible = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);
      if (matchVisible) {
        await matchRow.click({ force: true });
      } else {
        await resultRows.first().click({ force: true });
      }
    } else {
      await resultRows.first().click({ force: true });
    }
    await page.waitForTimeout(1000);
  }

  // Click OK
  const okButton = dialogLayer.getByRole('button', { name: 'OK' }).first();
  const okVisible = await okButton.isVisible({ timeout: 3000 }).catch(() => false);
  if (okVisible) {
    await okButton.click({ force: true });
  } else {
    // Try Cancel
    const cancelBtn = dialogLayer.getByRole('button', { name: 'Cancel' }).first();
    await cancelBtn.click({ force: true }).catch(() => {});
  }

  await page.waitForTimeout(2000);
  await clearGlassPane(page);
  await waitForJET(page);
  return rowCount > 0;
}

/**
 * Fill a LOV (autocomplete) field by typing then selecting from dropdown or pressing Tab.
 * Handles the "Search and Select" dialog if it appears.
 */
async function fillLovField(
  page: Page,
  selector: string,
  value: string,
  matchText?: string,
): Promise<void> {
  const field = page.locator(selector).first();
  await field.waitFor({ state: 'visible', timeout: 10_000 });

  // Type the value character by character to trigger ADF autocomplete
  await field.click({ force: true });
  await field.clear();
  await field.pressSequentially(value, { delay: 50 });
  await page.waitForTimeout(2000);

  // Check for autocomplete suggestions
  const autocompleteSelectors = [
    `li:has-text("${matchText || value}")`,
    `[role="option"]:has-text("${matchText || value}")`,
    `[role="listbox"] li:has-text("${matchText || value}")`,
  ];
  for (const sel of autocompleteSelectors) {
    const item = page.locator(sel).first();
    const visible = await item.isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) {
      await item.click();
      await page.waitForTimeout(1000);
      await waitForJET(page);
      return;
    }
  }

  // No autocomplete match — press Tab to trigger LOV resolution
  await field.press('Tab');
  await page.waitForTimeout(2000);

  // Handle Search and Select dialog if it appeared
  const hasDialog = await page.locator('div.AFModalGlassPane').isVisible({ timeout: 2000 }).catch(() => false);
  if (hasDialog) {
    await handleLovDialog(page, matchText || value);
  }

  await waitForJET(page);
}

// ── Login ────────────────────────────────────────────────────────────

/** Enter TOTP code with retry logic for code reuse and rate limiting. */
async function enterTOTP(page: Page, totp: TOTP, mfaInput: ReturnType<Page['locator']>): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const rateLimitAlert = page.getByText('Too many attempts', { exact: false });
    const isRateLimited = await rateLimitAlert.isVisible({ timeout: 2000 }).catch(() => false);
    if (isRateLimited) {
      const waitSecs = 30 + attempt * 15;
      console.log(`[Login] Okta rate limited, waiting ${waitSecs}s (attempt ${attempt})...`);
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

    // Check if we landed on a second-factor selection page (success for TOTP step)
    const secondFactorPage = await page.locator('a[aria-label="Select Password."]').isVisible({ timeout: 2000 }).catch(() => false);
    if (secondFactorPage) return;

    const errorMsg = page.locator('.o-form-has-errors, [data-se="o-form-error-container"]');
    const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasError && attempt < 5) {
      console.log(`[Login] TOTP attempt ${attempt} failed, waiting for next period...`);
      const now = Math.floor(Date.now() / 1000);
      const secondsUntilNext = 30 - (now % 30) + 1;
      await page.waitForTimeout(secondsUntilNext * 1000);
      continue;
    }

    if (attempt === 5 && !page.url().includes('fscmUI')) {
      await page.waitForURL('**/fscmUI/**', { timeout: 30_000 }).catch(() => {});
    }
  }
}

async function login(page: Page): Promise<void> {
  console.log('[Login] Starting Okta SSO + TOTP MFA...');
  await page.goto(env.oracle.url);
  await page.waitForLoadState('networkidle').catch(() => {});

  // If already on HCM page (session still valid), skip login
  if (page.url().includes('fscmUI')) {
    console.log('[Login] Already authenticated, skipping login');
    await waitForReady(page);
    await dismissPopups(page);
    return;
  }

  // Step 1: Click "Company Single Sign-On"
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 2: Okta — enter username
  await page.locator('input[name="identifier"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[name="identifier"]').fill(env.oracle.username);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3_000);

  // Step 3: Okta — detect flow (new: MFA-first, old: password-first)
  const totp = new TOTP({ secret: env.okta.totpSecret });
  const mfaInput = page.locator('input[name="credentials.passcode"]');
  const gaSelect = page.locator('a[aria-label="Select Google Authenticator."]');
  const gaSelectVisible = await gaSelect.isVisible({ timeout: 5_000 }).catch(() => false);

  if (gaSelectVisible) {
    // New flow: MFA selection first (passwordless)
    console.log('[Login] New Okta flow: MFA first');
    await gaSelect.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3_000);
    await mfaInput.waitFor({ state: 'visible', timeout: 15_000 });
    await enterTOTP(page, totp, mfaInput);

    // After TOTP, Okta may ask for password as second factor
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
    // Old flow: password first, then MFA
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
    await enterTOTP(page, totp, mfaInput);
  }

  // Ensure we're on the HCM page
  if (!page.url().includes('fscmUI')) {
    await page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
  }

  await waitForReady(page);
  await dismissPopups(page);
  console.log('[Login] Login successful');
}

// ── Navigation ───────────────────────────────────────────────────────

/** Navigate to the New Person task page via the Navigator menu. */
async function navigateToNewPerson(page: Page): Promise<void> {
  console.log('[Nav] Navigating to New Person...');
  await dismissPopups(page);

  // Open Navigator
  const navigator = page.locator('a[title="Navigator"]');
  const navVisible = await navigator.isVisible({ timeout: 5000 }).catch(() => false);
  if (!navVisible) {
    // Session may have expired — go to home first
    console.log('[Nav] Navigator not visible, going to home page...');
    await page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await waitForReady(page);
    await dismissPopups(page);
  }

  await navigator.click({ force: true });
  await page.waitForTimeout(2000);

  // Expand "Show More" if available
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Click "New Person" link — use the Workforce Management one specifically
  const newPersonLink = page.locator('a[id*="nv_itemNode_workforce_management_new_person"]').first();
  if (await newPersonLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newPersonLink.click({ force: true });
  } else {
    // Fallback: first "New Person" link
    await page.locator('a[title="New Person"]').first().click({ force: true });
  }

  // Wait for the New Person page to load
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await waitForJET(page);

  console.log('[Nav] New Person page loaded');
}

/**
 * Click "Hire an Employee" on the New Person page.
 * Uses AdfActionEvent via the task list link.
 */
async function clickHireAnEmployee(page: Page): Promise<void> {
  console.log('[Nav] Clicking "Hire an Employee"...');

  // Try ADF task link first (index 1 = Hire an Employee)
  const TASK_LINK_PREFIX =
    '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:';
  const linkId = `${TASK_LINK_PREFIX}cl01Lv:1:cl01Pse:cl01Cl`;

  const adfClicked = await page
    .evaluate((id: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return false;
      const comp = adfPage.findComponentByAbsoluteId(id);
      if (!comp) return false;
      const evt = new (window as any).AdfActionEvent(comp);
      evt.queue();
      return true;
    }, linkId)
    .catch(() => false);

  if (!adfClicked) {
    // Fallback: click by visible text
    console.log('[Nav] ADF link not found, trying text click...');
    const hireLink = page.locator('a:has-text("Hire an Employee")').first();
    const linkVisible = await hireLink.isVisible({ timeout: 5_000 }).catch(() => false);

    if (linkVisible) {
      await hireLink.click({ force: true });
    } else {
      // Link not found — navigate to New Person page first, then retry
      console.log('[Nav] "Hire an Employee" link not visible, navigating to New Person page...');
      await navigateToNewPerson(page);
      await page.waitForTimeout(3000);

      // Retry ADF link
      const adfRetry = await page
        .evaluate((id: string) => {
          const adfPage = (window as any).AdfPage?.PAGE;
          if (!adfPage) return false;
          const comp = adfPage.findComponentByAbsoluteId(id);
          if (!comp) return false;
          const evt = new (window as any).AdfActionEvent(comp);
          evt.queue();
          return true;
        }, linkId)
        .catch(() => false);

      if (!adfRetry) {
        // Final fallback: text click after navigation
        const retryLink = page.locator('a:has-text("Hire an Employee")').first();
        await retryLink.waitFor({ state: 'visible', timeout: 15_000 });
        await retryLink.click({ force: true });
      }
    }
  }

  // ADF forms take significant time to render
  await page.waitForTimeout(10_000);
  await waitForJET(page);
  console.log('[Nav] Hire wizard loaded');
}

// ── Hire Wizard Steps ────────────────────────────────────────────────

/**
 * Step 1: Identification
 * Sets Hire Date, Legal Employer, Last Name, First Name, Gender, DOB.
 *
 * IMPORTANT: After Legal Employer is set, ADF re-renders the Personal Details
 * section and all component IDs shift. We must re-find elements after this.
 */
async function step1Identification(page: Page, user: BotUser): Promise<void> {
  console.log('[Step 1] Identification');

  // ── Hire Date ──
  // The hire date is an ADF inputDate; triple-click to select, then type.
  const hireDateSelector = 'input[id*="inputDate1"][id$="::content"]';
  let hireDateField = page.locator(hireDateSelector).first();
  // Also try aria-label fallback
  if (!(await hireDateField.isVisible({ timeout: 3000 }).catch(() => false))) {
    hireDateField = page.locator('input[aria-label="Hire Date"]').first();
  }
  await hireDateField.waitFor({ state: 'visible', timeout: 15_000 });
  await hireDateField.click({ clickCount: 3 });
  await page.waitForTimeout(300);
  await hireDateField.pressSequentially(user.hire_date, { delay: 30 });
  await hireDateField.press('Tab');
  await page.waitForTimeout(1000);
  await waitForJET(page);
  console.log(`[Step 1]   Hire Date: ${user.hire_date}`);

  // ── Hire Action (Hire Reason) ──
  // Set "NEWHIRE" reason via ADF dropdown if available
  if (user.hire_reason) {
    const reasonSet = await setAdfSelectOneChoice(page, 'selectOneChoice4', user.hire_reason);
    if (reasonSet) console.log(`[Step 1]   Hire Reason: ${user.hire_reason}`);
  }

  // ── Legal Employer ──
  // This is a readonly ADF selectOneChoice or an LOV field.
  // First, try the LOV icon approach (most reliable)
  console.log('[Step 1]   Setting Legal Employer...');
  const leLovIcon = page.locator('a[id*="selectOneChoice3"][id$="::lovIconId"]').first();
  const leIconVisible = await leLovIcon.isVisible({ timeout: 3000 }).catch(() => false);

  if (leIconVisible) {
    // Click the LOV icon to open the dropdown
    await leLovIcon.click({ force: true });
    await page.waitForTimeout(2000);

    // Find and click "Campus Crusade for Christ, Inc." in the popup
    const ccfOption = page
      .locator('li:has-text("Campus Crusade for Christ")')
      .first();
    const optionVisible = await ccfOption.isVisible({ timeout: 5000 }).catch(() => false);
    if (optionVisible) {
      await ccfOption.click({ force: true });
    } else {
      // Fallback: try ADF API on the selectOneChoice
      await setAdfSelectOneChoice(page, 'selectOneChoice3', user.legal_employer);
    }
  } else {
    // Try aria-label based input
    const leField = page.locator('input[aria-label="Legal Employer"]').first();
    if (await leField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fillLovField(page, 'input[aria-label="Legal Employer"]', 'Campus Crusade', 'Campus Crusade for Christ');
    } else {
      // Last resort: set via ADF selectOneChoice
      await setAdfSelectOneChoice(page, 'selectOneChoice3', user.legal_employer);
    }
  }

  // Wait for ADF to re-render after Legal Employer selection.
  // This causes ALL component IDs in the Personal Details section to shift.
  await page.waitForTimeout(3000);
  await waitForJET(page);
  console.log(`[Step 1]   Legal Employer: ${user.legal_employer}`);

  // ── Last Name ──
  // After LE re-render, find by partial ID or aria-label
  const lastNameSet = await setAdfInputByLabelOrPartialId(
    page,
    'Last Name',
    'it20',
    user.last_name,
  );
  console.log(`[Step 1]   Last Name: ${user.last_name} (set=${lastNameSet})`);

  // ── First Name ──
  const firstNameSet = await setAdfInputByLabelOrPartialId(
    page,
    'First Name',
    'it60',
    user.first_name,
  );
  console.log(`[Step 1]   First Name: ${user.first_name} (set=${firstNameSet})`);

  // ── Gender ──
  // ADF readonly selectOneChoice — use ADF API
  const genderVal = user.gender === 'Male' ? 'M' : user.gender === 'Female' ? 'F' : user.gender;
  const genderSet = await setAdfSelectOneChoice(page, 'soc3', genderVal);
  if (!genderSet) {
    // Fallback: try aria-label
    const genderField = page.locator('select[aria-label="Gender"], input[aria-label="Gender"]').first();
    if (await genderField.isVisible({ timeout: 2000 }).catch(() => false)) {
      const tag = await genderField.evaluate((el) => el.tagName.toLowerCase());
      if (tag === 'select') {
        await genderField.selectOption({ label: user.gender });
      }
    }
  }
  await page.waitForTimeout(500);
  await waitForJET(page);
  console.log(`[Step 1]   Gender: ${user.gender}`);

  // ── Date of Birth ──
  // Find the DOB date input (has NewPe1 in ID, different from Hire Date)
  const dobSet = await setDobField(page, user.dob);
  console.log(`[Step 1]   DOB: ${user.dob} (set=${dobSet})`);

  // ── National Identifiers (NID) ──
  if (user.nid) {
    await addNationalIdentifier(page, user.nid);
  }

  // ── Click Next → Step 2 ──
  console.log('[Step 1] Clicking Next...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(2000);
  await waitForJET(page);

  // Handle "Matching Person Records" dialog if it appears
  // This shows up when Oracle finds an existing person with the same name
  await dismissMatchingPersonDialog(page);
}

/** Dismiss the "Matching Person Records" dialog by clicking Continue. */
async function dismissMatchingPersonDialog(page: Page): Promise<void> {
  const matchingRecords = page.getByText('Matching Person Records', { exact: false }).first();
  const hasDialog = await matchingRecords.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasDialog) {
    console.log('[Step 1]   Matching Person Records dialog detected, clicking Continue...');
    const continueBtn = page.locator('button:has-text("Continue"), a:has-text("Continue")').first();
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click({ force: true });
      await page.waitForTimeout(3000);
      await waitForJET(page);
    }
  }
}

/**
 * Set an ADF input field by trying aria-label first, then partial ID.
 * Returns true if the field was found and set.
 */
async function setAdfInputByLabelOrPartialId(
  page: Page,
  ariaLabel: string,
  partialId: string,
  value: string,
): Promise<boolean> {
  // Try aria-label first (works if field is visible and not re-rendered)
  const byLabel = page.locator(`input[aria-label="${ariaLabel}"]`).first();
  if (await byLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await byLabel.fill(value);
    await byLabel.press('Tab');
    await page.waitForTimeout(300);
    return true;
  }

  // Try ADF API with partial ID
  const adfSet = await setAdfInputValue(page, partialId, value);
  if (adfSet) {
    return true;
  }

  // Try finding by partial ID and filling directly
  const fullId = await findAdfInputByPartialId(page, partialId);
  if (fullId) {
    const field = page.locator(`#${CSS.escape(fullId)}`);
    await field.fill(value);
    await field.press('Tab');
    await page.waitForTimeout(300);
    return true;
  }

  console.log(`[WARN] Could not find field: ${ariaLabel} / ${partialId}`);
  return false;
}

/** Set the Date of Birth field, which may have shifted after LE re-render. */
async function setDobField(page: Page, dob: string): Promise<boolean> {
  // Try aria-label
  const byLabel = page.locator('input[aria-label="Date of Birth"]').first();
  if (await byLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await byLabel.click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await byLabel.pressSequentially(dob, { delay: 30 });
    await byLabel.press('Tab');
    await page.waitForTimeout(500);
    await waitForJET(page);
    return true;
  }

  // Try finding the second date input (DOB is the second inputDate on the page)
  // The first one is Hire Date, the second is DOB
  const dateInputs = page.locator('input[id*="inputDate"][id$="::content"]');
  const count = await dateInputs.count();
  if (count >= 2) {
    const dobInput = dateInputs.nth(1);
    await dobInput.click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await dobInput.pressSequentially(dob, { delay: 30 });
    await dobInput.press('Tab');
    await page.waitForTimeout(500);
    await waitForJET(page);
    return true;
  }

  // Try partial ID (NewPe1 prefix for DOB field)
  const fullId = await findAdfInputByPartialId(page, 'NewPe1');
  if (fullId && fullId.includes('inputDate')) {
    const field = page.locator(`#${CSS.escape(fullId)}`);
    await field.click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await field.pressSequentially(dob, { delay: 30 });
    await field.press('Tab');
    await page.waitForTimeout(500);
    return true;
  }

  return false;
}

/** Add a National Identifier (SSN) row and fill it. */
async function addNationalIdentifier(page: Page, nid: string): Promise<void> {
  console.log(`[Step 1]   Adding NID: ${nid}`);

  // Scroll down to make the National Identifiers section visible
  const nidHeader = page.getByText('National Identifiers').first();
  if (await nidHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nidHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }

  // Click the "+" (Add Row) button near the National Identifiers table.
  // ADF renders this as a commandToolbarButton with various ID patterns.
  const addBtnSelectors = [
    // ADF toolbar add button (most common pattern)
    'a[id*="table2"][id*="::add"]',
    'a[id*="commandToolbarButton"][id*="table2"]',
    // Generic add button near NID table
    'img[id*="table2"][id*="::addIcon"]',
    // Broader: any add-row icon
    'a[title="Add Row"]',
    'a[title="Create"]',
  ];

  let addClicked = false;
  for (const sel of addBtnSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ force: true });
      addClicked = true;
      console.log(`[Step 1]   Clicked NID Add Row via: ${sel}`);
      break;
    }
  }

  if (!addClicked) {
    // Try ADF approach: find the table's toolbar and click the add command
    const addViaAdf = await page.evaluate(() => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return false;
      // Scan for toolbar buttons that are "add" actions
      const toolbars = document.querySelectorAll('a[id*="table2"]');
      for (const el of Array.from(toolbars)) {
        const id = el.id;
        if (id.includes('ATt') || id.includes('add') || id.includes('commandToolbarButton')) {
          const cid = id.replace(/::.*$/, '');
          const comp = adfPage.findComponentByAbsoluteId(cid);
          if (comp) {
            const evt = new (window as any).AdfActionEvent(comp);
            evt.queue();
            return true;
          }
        }
      }
      return false;
    }).catch(() => false);
    if (addViaAdf) {
      addClicked = true;
      console.log('[Step 1]   Clicked NID Add Row via ADF component scan');
    }
  }

  if (!addClicked) {
    // Last resort: find the "+" icon by looking at toolbar buttons in the NID section
    // The NID section has a toolbar with View, Format, +, x buttons
    const plusBtns = page.locator('a[id*="table2"] img[src*="add"], a[id*="table2"][class*="xp9"]');
    if (await plusBtns.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await plusBtns.first().click({ force: true });
      addClicked = true;
    }
  }

  if (!addClicked) {
    console.log('[Step 1]   Could not find NID Add Row button, skipping NID');
    return;
  }

  await page.waitForTimeout(2000);
  await waitForJET(page);

  // Set NID Type to SSN (selectOneChoice in the new row)
  // ADF component: table2:0:soc2, setValue('1') = Social Security Number
  const nidTypeSet = await setAdfSelectOneChoice(page, 'table2:0:soc2', '1');
  if (!nidTypeSet) {
    // Try broader search
    await setAdfSelectOneChoice(page, 'soc2', 'Social Security Number');
  }
  await page.waitForTimeout(500);
  await waitForJET(page);

  // Set NID value
  // ADF component: table2:0:it1
  const nidSet = await setAdfInputValue(page, 'table2:0:it1', nid);
  if (!nidSet) {
    // Fallback: find input in NID table row and type
    const nidInput = page.locator('input[id*="table2:0:it1"]').first();
    if (await nidInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nidInput.fill(nid);
      await nidInput.press('Tab');
    } else {
      console.log('[Step 1]   Could not find NID value field');
    }
  }

  await page.waitForTimeout(500);
  await waitForJET(page);
  console.log(`[Step 1]   NID set: ${nid}`);
}

/**
 * Step 2: Person Information
 * Skip — just click Next. No fields need filling for bot users.
 */
async function step2PersonInformation(page: Page): Promise<void> {
  console.log('[Step 2] Person Information (skip)');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(2000);
  await waitForJET(page);
}

/**
 * Step 3: Employment Information
 * Sets Business Unit (and optionally Department, Location).
 */
async function step3EmploymentInfo(page: Page, user: BotUser): Promise<void> {
  console.log('[Step 3] Employment Information');

  // ── Business Unit ──
  // This is an LOV autocomplete field. Type "Cru" and Tab to trigger resolution.
  const buField = page.locator('input[aria-label*="Business Unit"]').first();
  if (await buField.isVisible({ timeout: 5000 }).catch(() => false)) {
    await buField.click({ force: true });
    await buField.clear();
    await buField.pressSequentially(user.business_unit, { delay: 50 });
    await page.waitForTimeout(2000);

    // Try autocomplete
    const buOption = page.locator(`li:has-text("${user.business_unit}")`).first();
    if (await buOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await buOption.click();
    } else {
      await buField.press('Tab');
      await page.waitForTimeout(2000);
      // Handle LOV dialog if it appears
      const hasDialog = await page
        .locator('div.AFModalGlassPane')
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (hasDialog) {
        await handleLovDialog(page, user.business_unit);
      }
    }
    await waitForJET(page);
    console.log(`[Step 3]   Business Unit: ${user.business_unit}`);
  } else {
    // Try partial ID search for business unit field
    const buInput = page.locator('input[id*="businessUnitId"]').first();
    if (await buInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await buInput.click({ force: true });
      await buInput.clear();
      await buInput.pressSequentially(user.business_unit, { delay: 50 });
      await page.waitForTimeout(1500);
      await buInput.press('Tab');
      await page.waitForTimeout(2000);
      await waitForJET(page);
      console.log(`[Step 3]   Business Unit: ${user.business_unit}`);
    } else {
      console.log('[Step 3]   Business Unit field not found, skipping');
    }
  }

  // ── Department (optional) ──
  if (user.department && user.department !== 'US Technology') {
    // Only set if different from default — US Technology may auto-fill
    try {
      await fillLovField(
        page,
        'input[aria-label*="Department"]',
        user.department,
      );
      console.log(`[Step 3]   Department: ${user.department}`);
    } catch {
      console.log('[Step 3]   Department field not accessible, skipping');
    }
  }

  // ── Location (optional) ──
  const locationValue =
    user.location === 'CRU_HQ' ? 'Cru World Headquarters' : user.location;
  if (locationValue) {
    try {
      await fillLovField(
        page,
        'input[aria-label*="Location"]',
        locationValue,
      );
      console.log(`[Step 3]   Location: ${locationValue}`);
    } catch {
      console.log('[Step 3]   Location field not accessible, skipping');
    }
  }

  // ── Click Next → Step 4 ──
  console.log('[Step 3] Clicking Next...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(2000);
  await waitForJET(page);
}

/**
 * Step 4: Compensation and Other Information
 * Skip — just click Next.
 */
async function step4Compensation(page: Page): Promise<void> {
  console.log('[Step 4] Compensation (skip)');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(2000);
  await waitForJET(page);
}

/**
 * Step 5: Review and Submit
 * Clicks Submit, confirms the dialog, extracts person number.
 */
async function step5ReviewSubmit(page: Page, user: BotUser): Promise<string> {
  console.log('[Step 5] Review & Submit');

  // Take a pre-submit screenshot for debugging
  await page
    .screenshot({
      path: path.join(SCREENSHOT_DIR, `${user.bot_name}-review.png`),
      fullPage: true,
    })
    .catch(() => {});

  // Click Submit — use regular Playwright click (not ADF action) for more reliability
  console.log('[Step 5]   Clicking Submit...');
  const submitBtn = page.locator('a:has-text("Submit"), button:has-text("Submit")').first();
  await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await submitBtn.click({ force: true });

  // Wait for the "Do you want to continue?" dialog to appear
  // The dialog has Yes/No buttons — wait for the Yes button to be visible
  console.log('[Step 5]   Waiting for confirmation dialog...');
  await page.waitForTimeout(5000); // ADF dialog can take a while to render

  // Try to find and click Yes button using multiple strategies
  const yesBtnStrategies = [
    // Standard button element
    () => page.locator('button:text-is("Yes")').first(),
    // Role-based
    () => page.getByRole('button', { name: 'Yes', exact: true }),
    // ADF dialog button inside glass pane overlay
    () => page.locator('.AFModalGlassPane ~ div button:has-text("Yes")').first(),
    // Any visible Yes button
    () => page.locator('button').filter({ hasText: /^Yes$/ }).first(),
  ];

  let yesClicked = false;
  for (const getBtn of yesBtnStrategies) {
    const btn = getBtn();
    const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      console.log('[Step 5]   Found Yes button, clicking...');
      await btn.click({ force: true });
      yesClicked = true;
      break;
    }
  }

  if (!yesClicked) {
    // Try JS click on any button with text "Yes"
    console.log('[Step 5]   Trying JS click for Yes button...');
    yesClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of Array.from(buttons)) {
        if (btn.textContent?.trim() === 'Yes' && btn.offsetWidth > 0) {
          btn.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);
    if (yesClicked) console.log('[Step 5]   Clicked Yes via JS');
  }

  if (!yesClicked) {
    console.log('[Step 5]   WARNING: Could not click Yes, trying Enter key...');
    await page.keyboard.press('Enter');
  }

  console.log('[Step 5]   Waiting for submission to complete...');
  await page.waitForTimeout(10000);
  await waitForJET(page).catch(() => {});

  // Extract person number from the page - it's in the header "Person Number XXXXXXXX"
  // This is visible on both the Review page and the success confirmation
  let personNumber = 'unknown';
  const bodyText = await page.locator('body').textContent().catch(() => '');
  const personNumMatch = bodyText?.match(/Person\s*Number\s*[:\s]*(\d{7,})/i);
  if (personNumMatch) {
    personNumber = personNumMatch[1];
    console.log(`[Step 5]   Found person number on page: ${personNumber}`);
  }

  // Wait for the success confirmation "The request was submitted."
  // Or detect the OK button on the confirmation dialog
  const successMsg = page.getByText('request was submitted', { exact: false }).first();
  let isSuccess = await successMsg.isVisible({ timeout: 15_000 }).catch(() => false);

  // Also check for the OK button (appears on the success confirmation)
  const okBtn = page.locator('button:text-is("OK")').first();
  const hasOk = await okBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasOk) {
    isSuccess = true;
    // Re-extract person number if needed
    if (personNumber === 'unknown') {
      const bodyText2 = await page.locator('body').textContent().catch(() => '');
      const match2 = bodyText2?.match(/Person\s*Number\s*[:\s]*(\d{7,})/i);
      if (match2) personNumber = match2[1];
    }
  }

  // Take a post-submit screenshot
  await page
    .screenshot({
      path: path.join(SCREENSHOT_DIR, `${user.bot_name}-submitted.png`),
      fullPage: true,
    })
    .catch(() => {});

  // Click OK to dismiss the success dialog
  if (hasOk) {
    await okBtn.click({ force: true });
    await page.waitForTimeout(3000);
    await clearGlassPane(page);
    await waitForJET(page).catch(() => {});
  }

  // If we have a person number from the Review page but didn't detect
  // the success message, still count it as success (the user was created)
  if (!isSuccess && personNumber !== 'unknown') {
    console.log(`[Step 5]   No success message but found PersonNumber ${personNumber}, treating as success`);
    isSuccess = true;
  }

  if (!isSuccess) {
    // Check for error messages
    const errorText = await page
      .locator('.af_message_body, .AFNoteWindow, [id*="msgDlg"]')
      .textContent()
      .catch(() => '');
    throw new Error(`Submit did not show success message. Error: ${errorText || 'unknown'}`);
  }

  console.log(`[Step 5] SUCCESS: ${user.bot_name} -> PersonNumber: ${personNumber}`);
  return personNumber;
}

// ── Full Wizard Orchestration ────────────────────────────────────────

/**
 * Run the full Hire an Employee wizard for a single user.
 * Returns the new person number on success.
 */
async function hireEmployee(page: Page, user: BotUser): Promise<string> {
  console.log(`\n========================================`);
  console.log(`  Hiring: ${user.bot_name} (${user.first_name} ${user.last_name})`);
  console.log(`========================================`);

  await clickHireAnEmployee(page);
  await step1Identification(page, user);
  await step2PersonInformation(page);
  await step3EmploymentInfo(page, user);
  await step4Compensation(page);
  const personNumber = await step5ReviewSubmit(page, user);
  return personNumber;
}

// ── Progress Management ──────────────────────────────────────────────

function loadProgress(): ProgressFile {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { created: [], remaining: [] };
}

function saveProgress(progress: ProgressFile): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadResults(): CreationResult[] {
  if (fs.existsSync(RESULTS_FILE)) {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  }
  return [];
}

function saveResults(results: CreationResult[]): void {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// ── Post-Hire Account Registration ───────────────────────────────────

const CREDENTIALS_FILE = path.resolve(process.cwd(), '.config', 'bot-credentials.json');
const BOT_PASSWORD = 'WinBuildSend!1951@cru';

function loadBotCredentials(): Record<string, { username: string; password: string }> {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  }
  return {};
}

function saveBotCredentials(creds: Record<string, { username: string; password: string }>): void {
  const dir = path.dirname(CREDENTIALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n');
}

/**
 * After hiring, verify the worker exists via REST API and save credentials.
 * User account creation + role assignment must be done separately via:
 *   npx tsx scripts/provision-bot-accounts.ts <botName>
 *
 * NOTE: Oracle HCM userAccounts REST API returns 403 (needs IT Security Manager role).
 * Account provisioning is done via Security Console UI automation in provision-bot-accounts.ts.
 */
async function provisionUserAccount(
  page: Page,
  botName: string,
  personNumber: string,
): Promise<{ username: string } | null> {
  const username = `uat.${botName}`;
  const baseUrl = env.oracle.url.replace(/\/$/, '');

  console.log(`[Provision] Verifying worker record for ${botName}...`);

  // Verify the person record exists via REST API (Basic Auth)
  let worker = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    worker = await lookupPersonId(page, baseUrl, personNumber).catch(() => null);
    if (worker) break;
    console.log(`[Provision]   Waiting for person record (attempt ${attempt}/10)...`);
    await page.waitForTimeout(5000);
  }

  if (!worker) {
    console.log(`[Provision]   Worker ${personNumber} not found via REST API after 10 attempts`);
    console.log(`[Provision]   The worker may still be provisioning. Try again later.`);
    return null;
  }

  console.log(`[Provision]   PersonId: ${worker.PersonId} (${worker.DisplayName})`);

  // Save credentials (account creation + roles must be done via provision-bot-accounts.ts)
  const creds = loadBotCredentials();
  creds[botName] = { username, password: BOT_PASSWORD };
  saveBotCredentials(creds);
  console.log(`[Provision]   Credentials saved to ${CREDENTIALS_FILE}`);
  console.log(`[Provision]   To create account + assign roles, run:`);
  console.log(`[Provision]     npx tsx scripts/provision-bot-accounts.ts ${botName}`);

  return { username };
}

// ── Direct Login (for parallel mode — bot users, no SSO) ─────────────

/**
 * Login directly to Oracle HCM using native User ID/Password form (no SSO/Okta/MFA).
 * Used in parallel mode where each browser logs in as a base bot to hire its clones.
 */
async function directLogin(page: Page, username: string, password: string): Promise<void> {
  console.log(`[Login] Direct Oracle login as ${username}...`);
  await page.goto(env.oracle.url);
  await page.waitForLoadState('networkidle');

  if (page.url().includes('fscmUI')) {
    console.log('[Login] Already authenticated');
    return;
  }

  const userIdField = page.getByRole('textbox', { name: 'User ID' });
  await userIdField.waitFor({ state: 'visible', timeout: 15_000 });
  await userIdField.fill(username);

  const passwordField = page.getByRole('textbox', { name: 'Password' });
  await passwordField.fill(password);

  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60_000 });
  await waitForReady(page);
  await dismissPopups(page);
  console.log('[Login] Login successful');
}

// ── Parallel Hiring ─────────────────────────────────────────────────

/**
 * Run parallel hiring: spawn one browser per base bot, each hiring its assigned clones.
 * Up to maxConcurrent browsers run simultaneously.
 */
async function runParallelHiring(
  allClones: BotUser[],
  maxConcurrent: number,
): Promise<void> {
  // Group clones by their base bot (strip trailing _N suffix)
  const groups = new Map<string, BotUser[]>();
  for (const clone of allClones) {
    const baseName = clone.bot_name.replace(/_\d+$/, '');
    const list = groups.get(baseName) || [];
    list.push(clone);
    groups.set(baseName, list);
  }

  console.log(`\n=== Parallel Hiring: ${allClones.length} clones across ${groups.size} base bots (max ${maxConcurrent} concurrent) ===\n`);
  for (const [baseName, clones] of groups) {
    console.log(`  ${baseName.padEnd(30)} ${clones.length} clones`);
  }
  console.log('');

  const progress = loadProgress();
  const results = loadResults();
  const createdNames = new Set(progress.created.map(c => c.bot_name));

  // Build work items: { baseBotName, clones[] }
  const workItems = [...groups.entries()]
    .map(([baseName, clones]) => ({
      baseName,
      clones: clones.filter(c => !createdNames.has(c.bot_name)),
    }))
    .filter(w => w.clones.length > 0);

  if (workItems.length === 0) {
    console.log('All clones already created!');
    return;
  }

  // Semaphore for limiting concurrent browsers
  let active = 0;
  const queue = [...workItems];
  const allPromises: Promise<void>[] = [];

  function runNext(): Promise<void> | null {
    if (queue.length === 0) return null;
    const item = queue.shift()!;
    active++;

    const promise = (async () => {
      const creds = getBotCredentials(item.baseName);
      if (!creds) {
        console.log(`[${item.baseName}] No credentials found, skipping ${item.clones.length} clones`);
        active--;
        return;
      }

      console.log(`[${item.baseName}] Starting browser (${item.clones.length} clones to hire)...`);
      const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(60_000);

      try {
        await directLogin(page, creds.username, creds.password);
        await navigateToNewPerson(page);

        for (let i = 0; i < item.clones.length; i++) {
          const clone = item.clones[i];
          console.log(`[${item.baseName}] Hiring ${clone.bot_name} (${i + 1}/${item.clones.length})...`);

          try {
            const personNumber = await hireEmployee(page, clone);

            progress.created.push({
              index: 0,
              bot_name: clone.bot_name,
              person_number: personNumber,
            });
            saveProgress(progress);

            results.push({
              bot_name: clone.bot_name,
              status: 'created',
              person_number: personNumber,
              timestamp: new Date().toISOString(),
            });
            saveResults(results);

            if (personNumber !== 'unknown') {
              await provisionUserAccount(page, clone.bot_name, personNumber);
            }

            // Navigate back for next clone
            if (i < item.clones.length - 1) {
              await page.waitForTimeout(3000);
              await dismissPopups(page);
              await navigateToNewPerson(page);
              await page.waitForTimeout(3000);
              await waitForReady(page);
              await dismissPopups(page);
            }
          } catch (err: any) {
            console.error(`[${item.baseName}] FAIL ${clone.bot_name}: ${err.message}`);
            await page.screenshot({
              path: path.join(SCREENSHOT_DIR, `${clone.bot_name}-error.png`),
              fullPage: true,
            }).catch(() => {});

            results.push({
              bot_name: clone.bot_name,
              status: 'failed',
              error: err.message,
              timestamp: new Date().toISOString(),
            });
            saveResults(results);

            // Try to recover
            try {
              await page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
              await page.waitForTimeout(5000);
              await waitForReady(page);
              await dismissPopups(page);
              await navigateToNewPerson(page);
            } catch {
              console.error(`[${item.baseName}] Recovery failed, stopping this bot's session`);
              break;
            }
          }
        }
      } catch (err: any) {
        console.error(`[${item.baseName}] Session error: ${err.message}`);
      } finally {
        await browser.close();
        active--;
        console.log(`[${item.baseName}] Session complete (${active} still active)`);

        // Start next queued item
        const next = runNext();
        if (next) allPromises.push(next);
      }
    })();

    return promise;
  }

  // Start initial batch
  for (let i = 0; i < Math.min(maxConcurrent, workItems.length); i++) {
    const p = runNext();
    if (p) allPromises.push(p);
  }

  await Promise.all(allPromises);

  // Print summary
  printSummary(progress);
  const created = results.filter(r => r.status === 'created');
  const failed = results.filter(r => r.status === 'failed');
  console.log(`\n=== Parallel Session Results ===`);
  console.log(`Created: ${created.length}`);
  console.log(`Failed:  ${failed.length}`);
  for (const r of failed) {
    console.log(`  FAIL: ${r.bot_name} -> ${r.error?.slice(0, 120)}`);
  }
}

// ── Clone Generation ─────────────────────────────────────────────────

/**
 * Generate unique SSN for clone users.
 * Format: AAA-BB-CCCC where each is a random digit group.
 */
function generateUniqueSSN(existingSSNs: Set<string>): string {
  let ssn: string;
  do {
    const area = String(Math.floor(Math.random() * 899) + 100);
    const group = String(Math.floor(Math.random() * 89) + 10);
    const serial = String(Math.floor(Math.random() * 8999) + 1000);
    ssn = `${area}-${group}-${serial}`;
  } while (existingSSNs.has(ssn));
  existingSSNs.add(ssn);
  return ssn;
}

/**
 * Create clone users from the base user list.
 * Each base user gets N clones with names like bot_hr_admin_1, bot_hr_admin_2, etc.
 */
function generateClones(baseUsers: BotUser[], cloneCount: number): BotUser[] {
  const existingSSNs = new Set(baseUsers.map((u) => u.nid));
  const clones: BotUser[] = [];

  for (const baseUser of baseUsers) {
    for (let i = 1; i <= cloneCount; i++) {
      const cloneName = `${baseUser.bot_name}_${i}`;
      const clone: BotUser = {
        ...baseUser,
        bot_name: cloneName,
        last_name: cloneName,
        email: `uat.${cloneName}@cru.org`,
        nid: generateUniqueSSN(existingSSNs),
      };
      clones.push(clone);
    }
  }

  return clones;
}

// ── CLI Argument Parsing ─────────────────────────────────────────────

interface CliArgs {
  targetUser?: string;
  clones?: number;
  parallel?: boolean;
  maxConcurrent?: number;
  reset?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clones' && args[i + 1]) {
      result.clones = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--parallel') {
      result.parallel = true;
    } else if (args[i] === '--max-concurrent' && args[i + 1]) {
      result.maxConcurrent = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--reset') {
      result.reset = true;
    } else if (!args[i].startsWith('--')) {
      result.targetUser = args[i];
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Reset progress if requested
  if (cliArgs.reset) {
    console.log('[Main] Resetting progress...');
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    if (fs.existsSync(RESULTS_FILE)) fs.unlinkSync(RESULTS_FILE);
  }

  // Load bot users from input file
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('Create it with the bot user data array.');
    process.exit(1);
  }
  const allUsers: BotUser[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`[Main] Loaded ${allUsers.length} base users from ${INPUT_FILE}`);

  // Generate clone users if --clones flag is specified
  let usersToProcess: BotUser[];
  if (cliArgs.clones && cliArgs.clones > 0) {
    usersToProcess = generateClones(allUsers, cliArgs.clones);
    console.log(
      `[Main] Generated ${usersToProcess.length} clone users (${cliArgs.clones} per role)`,
    );

    // Parallel mode: each base bot hires its own clones in separate browsers
    if (cliArgs.parallel) {
      await runParallelHiring(usersToProcess, cliArgs.maxConcurrent || 10);
      return;
    }
  } else {
    usersToProcess = allUsers;
  }

  // Filter to specific user if name provided
  if (cliArgs.targetUser) {
    usersToProcess = usersToProcess.filter((u) => u.bot_name === cliArgs.targetUser);
    if (usersToProcess.length === 0) {
      console.error(`User "${cliArgs.targetUser}" not found in user list`);
      process.exit(1);
    }
    console.log(`[Main] Filtered to target user: ${cliArgs.targetUser}`);
  }

  // Load progress to skip already-created users
  const progress = loadProgress();
  const createdNames = new Set(progress.created.map((c) => c.bot_name));
  const remaining = usersToProcess.filter((u) => !createdNames.has(u.bot_name));

  console.log(
    `\n=== Bot User Creation: ${remaining.length} remaining (${createdNames.size} already created) ===\n`,
  );

  if (remaining.length === 0) {
    console.log('All users already created!');
    printSummary(progress);
    return;
  }

  // Load previous results
  let results = loadResults();

  // Launch browser
  const headless = HEADLESS;
  console.log(`[Main] Launching browser (headless=${headless}, slowMo=${SLOW_MO})...`);
  const browser = await chromium.launch({
    headless,
    slowMo: SLOW_MO,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  try {
    // Login once
    await login(page);
    await page.waitForTimeout(3000);
    await waitForReady(page);

    // Navigate to New Person page
    await navigateToNewPerson(page);

    // Process each user
    for (let i = 0; i < remaining.length; i++) {
      const user = remaining[i];
      const idx = usersToProcess.indexOf(user);
      console.log(
        `\n--- [${i + 1}/${remaining.length}] ${user.bot_name} ---`,
      );

      try {
        const personNumber = await hireEmployee(page, user);

        // Update progress
        progress.created.push({
          index: idx,
          bot_name: user.bot_name,
          person_number: personNumber,
        });
        progress.remaining = progress.remaining.filter((r) => r !== idx);
        saveProgress(progress);

        // Update results
        results.push({
          bot_name: user.bot_name,
          status: 'created',
          person_number: personNumber,
          timestamp: new Date().toISOString(),
        });
        saveResults(results);

        console.log(
          `[Main] Saved progress: ${progress.created.length} created`,
        );

        // Provision user account (create account + set password + assign roles)
        if (personNumber !== 'unknown') {
          await provisionUserAccount(page, user.bot_name, personNumber);
        }

        // After successful submission, navigate back to New Person page for next user.
        // Don't rely on the page auto-returning — explicitly navigate.
        console.log('[Main] Navigating back to New Person for next user...');
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        await navigateToNewPerson(page);
        await page.waitForTimeout(3000);
        await waitForReady(page);
        await dismissPopups(page);
      } catch (err: any) {
        console.error(`[FAIL] ${user.bot_name}: ${err.message}`);

        // Screenshot on failure
        await page
          .screenshot({
            path: path.join(SCREENSHOT_DIR, `${user.bot_name}-error.png`),
            fullPage: true,
          })
          .catch(() => {});

        results.push({
          bot_name: user.bot_name,
          status: 'failed',
          error: err.message,
          timestamp: new Date().toISOString(),
        });
        saveResults(results);

        // Try to recover for next user
        try {
          console.log('[Main] Attempting recovery...');
          // Try going to home page first
          await page
            .goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 })
            .catch(() => {});
          await page.waitForTimeout(5000);
          await waitForReady(page);
          await dismissPopups(page);
          await navigateToNewPerson(page);
          console.log('[Main] Recovery successful');
        } catch (recoverErr: any) {
          console.error(`[Main] Recovery failed: ${recoverErr.message}`);
          // If recovery fails, try re-login
          try {
            console.log('[Main] Attempting re-login...');
            await login(page);
            await navigateToNewPerson(page);
          } catch {
            console.error('[Main] Re-login also failed, stopping.');
            break;
          }
        }
      }
    }
  } finally {
    // Print summary
    printSummary(progress);

    const created = results.filter((r) => r.status === 'created');
    const failed = results.filter((r) => r.status === 'failed');
    console.log(`\n=== Session Results ===`);
    console.log(`Created this session: ${created.length}`);
    console.log(`Failed this session:  ${failed.length}`);
    for (const r of failed) {
      console.log(`  FAIL: ${r.bot_name} -> ${r.error?.slice(0, 120)}`);
    }

    console.log(`\nResults:  ${RESULTS_FILE}`);
    console.log(`Progress: ${PROGRESS_FILE}`);
    console.log(`Screenshots: ${SCREENSHOT_DIR}/`);

    await browser.close();
  }
}

function printSummary(progress: ProgressFile): void {
  console.log(`\n=== Overall Progress ===`);
  console.log(`Total created: ${progress.created.length}`);
  for (const entry of progress.created) {
    console.log(`  ${entry.bot_name} -> PersonNumber: ${entry.person_number}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
