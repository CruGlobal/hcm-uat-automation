/**
 * Look up bot user Oracle HCM usernames via the UI.
 * Navigates to Person Management, searches by person number,
 * clicks into the person record, and looks for User Account info.
 */
import { chromium, type Page } from 'playwright';
import { env } from '../../src/config/environment';
import { getAllBotUsers } from '../../src/config/bot-users';
import { TOTP } from 'otpauth';

const HEADLESS = process.env.HEADLESS !== 'false';

async function waitForJET(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        const oj = (window as any).oj;
        if (!oj?.Context) return true;
        const bc = oj.Context.getPageContext().getBusyContext();
        return !bc.isReady || bc.isReady();
      } catch {
        return true;
      }
    },
    { timeout },
  );
}

async function ssoLogin(page: Page): Promise<void> {
  await page.goto(env.oracle.url);
  await page.waitForLoadState('networkidle');

  // Click SSO button
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle');

  // Okta username
  await page.locator('input[name="identifier"]').fill(env.oracle.username);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  // Okta password
  const pwd = page.locator('input[name="credentials.passcode"]');
  await pwd.waitFor({ state: 'visible', timeout: 15_000 });
  await pwd.fill(env.oracle.password);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  // MFA
  const mfaSelect = page.locator('a[aria-label="Select Google Authenticator."]');
  await mfaSelect.waitFor({ state: 'visible', timeout: 15_000 });
  await mfaSelect.click();
  await page.waitForLoadState('networkidle');

  const totp = new TOTP({ secret: env.okta.totpSecret });
  const mfaInput = page.locator('input[name="credentials.passcode"]');
  await mfaInput.waitFor({ state: 'visible', timeout: 15_000 });

  for (let attempt = 1; attempt <= 5; attempt++) {
    const code = totp.generate();
    await mfaInput.fill(code);
    await page.locator('input[type="submit"]').click();
    const ok = await page.waitForURL('**/fscmUI/**', { timeout: 10_000 }).then(() => true).catch(() => false);
    if (ok) break;
    if (attempt < 5) {
      const now = Math.floor(Date.now() / 1000);
      const wait = 30 - (now % 30) + 1;
      await page.waitForTimeout(wait * 1000);
    }
  }

  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  console.log('Logged in successfully\n');
}

async function navigateToPersonManagement(page: Page): Promise<void> {
  const baseUrl = env.oracle.url.replace(/\/$/, '');
  await page.goto(`${baseUrl}/fscmUI/faces/deeplink?objType=PERSON_MANAGEMENT&action=NONE`, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  await page.waitForTimeout(3000);
}

async function searchByPersonNumber(page: Page, personNumber: string): Promise<void> {
  // Clear name field first
  const nameField = page.locator('input[id*="value00"]').first();
  if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameField.clear();
  }

  // Fill person number
  const personNumField = page.locator('input[id*="value10"]').first();
  await personNumField.waitFor({ state: 'visible', timeout: 10_000 });
  await personNumField.clear();
  await personNumField.fill(personNumber);

  // Click Search button
  const searchBtn = page.locator('button[id*="::search"]').first();
  await searchBtn.click();
  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  await page.waitForTimeout(3000);
}

async function tryRestApiLookup(page: Page, personNumber: string): Promise<string | null> {
  const baseUrl = env.oracle.url.replace(/\/$/, '');
  try {
    const result = await page.evaluate(async (args) => {
      const { baseUrl, personNumber } = args;
      // Try multiple REST APIs
      const endpoints = [
        `/hcmRestApi/resources/11.13.18.05/userAccounts?q=PersonNumber=${personNumber}&fields=Username,PersonNumber`,
        `/hcmRestApi/resources/11.13.18.05/workers?q=PersonNumber=${personNumber}&fields=UserName,PersonNumber`,
      ];
      for (const ep of endpoints) {
        try {
          const resp = await fetch(`${baseUrl}${ep}`, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json();
            return JSON.stringify(data);
          }
        } catch { /* ignore */ }
      }
      return null;
    }, { baseUrl, personNumber });
    if (result) {
      const data = JSON.parse(result);
      if (data.items?.length > 0) {
        return data.items[0].Username || data.items[0].UserName || null;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function lookupUsername(page: Page, botName: string, personNumber: string): Promise<string | null> {
  console.log(`\n--- Looking up ${botName} (#${personNumber}) ---`);

  // First try REST API (fastest if it works)
  const restUsername = await tryRestApiLookup(page, personNumber);
  if (restUsername) {
    console.log(`  REST API found username: ${restUsername}`);
    return restUsername;
  }

  // Navigate to person management and search
  await navigateToPersonManagement(page);
  await searchByPersonNumber(page, personNumber);

  // Look for the person link in results table (name column is first)
  const resultLink = page.locator('table[id*="ATp"] tbody tr a').first();
  if (!await resultLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  No search results found`);
    return null;
  }

  const linkText = await resultLink.textContent();
  console.log(`  Found person: ${linkText}`);

  // Click into the person record
  await resultLink.click();
  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  await page.waitForTimeout(5000);

  // Take screenshot of person detail page
  await page.screenshot({ path: `/tmp/bot-detail-${botName}.png` });

  // Look for User Account / Username info on the page
  const pageText = await page.textContent('body') || '';

  // Try to find username-like patterns in the page text
  const patterns = [
    /User\s*(?:Name|Account|ID)\s*[:\s]+([A-Z0-9_.@]+)/gi,
    /Username\s*[:\s]+([A-Z0-9_.@]+)/gi,
  ];
  for (const pat of patterns) {
    const match = pat.exec(pageText);
    if (match) {
      console.log(`  Found username pattern: ${match[1]}`);
      return match[1];
    }
  }

  // Try to navigate to "Manage User Account" section
  // In Oracle HCM, the person detail page might have tabs or links for User Account
  const userAccountLink = page.locator('a:has-text("User Account"), a:has-text("Manage User")').first();
  if (await userAccountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userAccountLink.click();
    await page.waitForLoadState('networkidle');
    await waitForJET(page);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `/tmp/bot-useraccount-${botName}.png` });

    const userPageText = await page.textContent('body') || '';
    for (const pat of patterns) {
      const match = pat.exec(userPageText);
      if (match) {
        console.log(`  Found username in User Account page: ${match[1]}`);
        return match[1];
      }
    }
  }

  console.log(`  Username not found via UI`);
  return null;
}

async function main() {
  const bots = getAllBotUsers();

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  await ssoLogin(page);

  // First: try a batch REST API call for ALL users at once
  const baseUrl = env.oracle.url.replace(/\/$/, '');
  console.log('=== Trying batch REST API lookup ===');
  try {
    const batchResult = await page.evaluate(async (args) => {
      const { baseUrl } = args;
      const endpoints = [
        `/hcmRestApi/resources/11.13.18.05/userAccounts?limit=500&fields=Username,PersonNumber,PersonId`,
        `/hcmRestApi/resources/latest/userAccounts?limit=500&fields=Username,PersonNumber,PersonId`,
        `/hcmRestApi/resources/11.13.18.05/workers?limit=500&fields=UserName,PersonNumber,PersonId&q=PersonNumber LIKE '1081%'`,
      ];
      const results: any[] = [];
      for (const ep of endpoints) {
        try {
          const resp = await fetch(`${baseUrl}${ep}`, { credentials: 'include' });
          results.push({ endpoint: ep, status: resp.status, statusText: resp.statusText });
          if (resp.ok) {
            const data = await resp.json();
            results.push({ endpoint: ep, data });
          }
        } catch (err: any) {
          results.push({ endpoint: ep, error: err.message });
        }
      }
      return JSON.stringify(results, null, 2);
    }, { baseUrl });
    console.log(batchResult);
  } catch (err) {
    console.log(`  Batch REST failed: ${err}`);
  }

  // Navigate to person management and look up each user
  console.log('\n=== Looking up usernames via Person Management ===');

  // Only look up first 3 for speed, then decide approach
  const sample = bots.slice(0, 3);
  const results: Record<string, string | null> = {};

  for (const bot of sample) {
    const username = await lookupUsername(page, bot.botName, bot.personNumber);
    results[bot.botName] = username;
  }

  console.log('\n=== Results ===');
  for (const [name, username] of Object.entries(results)) {
    console.log(`  ${name}: ${username || 'NOT FOUND'}`);
  }

  await browser.close();
}

main().catch(console.error);
