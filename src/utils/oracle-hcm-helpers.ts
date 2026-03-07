import { type Page, type Locator } from '@playwright/test';

/**
 * Wait for Oracle JET framework to finish loading.
 * Oracle JET uses a busy context — we wait until no busy states remain.
 */
export async function waitForOracleJET(page: Page, timeout = 30_000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        // Oracle JET busy context check
        const jet = (window as any).oj;
        if (jet?.Context) {
          const busyContext = jet.Context.getPageContext().getBusyContext();
          return !busyContext.isReady || busyContext.isReady();
        }
        // If JET isn't loaded yet, check for common loading indicators
        return !document.querySelector('.oj-progress-bar, .oj-loading');
      },
      { timeout }
    );
  } catch (err) {
    // JET busy context can get stuck (e.g., background polling, dialog blocking).
    // Log warning and continue — the page may actually be ready.
    console.warn(`[waitForOracleJET] Timeout after ${timeout}ms — continuing anyway (page may be ready)`);
  }
}

/** Wait for Oracle HCM page to fully load (JET + network idle). */
export async function waitForPageReady(page: Page): Promise<void> {
  // Cap networkidle at 30s — Oracle HCM has background polling that can prevent
  // networkidle from ever firing if given unlimited time.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await waitForOracleJET(page);
}

/** Dismiss any Oracle HCM notification popups or walkme guides. */
export async function dismissPopups(page: Page): Promise<void> {
  // Handle "You have a new home page!" / feature tour / welcome dialogs first
  // These use "Got It", "OK, Got It", "Dismiss", or similar buttons
  const welcomeButtons = page.getByRole('button', { name: /Got It|Dismiss|OK, Got It|Take a Tour/i }).first();
  if (await welcomeButtons.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[Popups] Dismissing welcome/feature tour dialog');
    await welcomeButtons.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

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
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click().catch(() => {});
    }
  }
}

/** Search and select a person in Oracle HCM person search. */
export async function searchPerson(page: Page, personName: string): Promise<void> {
  // Person Management search uses ADF form with q1:value00 (Name) and q1::search (Search button)
  const searchInput = page.locator('[id$="q1:value00::content"], input[placeholder*="Search"], input[aria-label*="Person"]').first();
  await searchInput.fill(personName);
  await searchInput.press('Enter');
  await waitForOracleJET(page);

  // Click the matching result
  await page.locator(`text="${personName}"`).first().click();
  await waitForOracleJET(page);
}

/** Select a value from an Oracle JET select/combobox. */
export async function selectOJValue(locator: Locator, value: string): Promise<void> {
  await locator.click();
  const page = locator.page();
  await page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
  await waitForOracleJET(page);
}

/** Click a button and wait for JET to settle. */
export async function clickAndWait(page: Page, selector: string): Promise<void> {
  await page.locator(selector).click();
  await waitForOracleJET(page);
}

/**
 * Convert an Excel serial date number to MM/DD/YYYY string.
 * Google Sheets stores dates as serial numbers (days since 1899-12-30).
 * Returns the original string if not a valid serial number.
 */
export function excelSerialToDate(serial: string): string {
  // Handle "todays date" placeholder — return today's date in MM/DD/YYYY format
  if (/today/i.test(serial)) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  const num = Number(serial);
  if (!Number.isFinite(num) || num < 1) return serial;
  // Excel epoch: 1899-12-30 (accounting for the Lotus 1-2-3 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + num * 86400000);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
