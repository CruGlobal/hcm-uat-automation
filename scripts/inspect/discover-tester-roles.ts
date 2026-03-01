/**
 * Discover what Oracle HCM pages a bot user can access, and what roles
 * the corresponding original tester needs based on UAT Plan analysis.
 *
 * Usage: npx tsx scripts/inspect/discover-tester-roles.ts <botName>
 *
 * Output: /tmp/tester-roles/<botName>.json
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BOT_NAME = process.argv[2];
if (!BOT_NAME) {
  console.error('Usage: npx tsx scripts/inspect/discover-tester-roles.ts <botName>');
  process.exit(1);
}

const HEADLESS = process.env.HEADLESS !== 'false';
const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const OUTPUT_DIR = '/tmp/tester-roles';

// Load bot credentials
const credsFile = path.resolve(process.cwd(), '.config', 'bot-credentials.json');
const allCreds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
// Case-insensitive credential lookup (bot-users.ts uses mixed case, credentials file uses lowercase)
const credsKey = Object.keys(allCreds).find(k => k.toLowerCase() === BOT_NAME.toLowerCase()) || BOT_NAME;
const creds = allCreds[credsKey];
if (!creds) {
  console.error(`No credentials found for ${BOT_NAME} (tried key: ${credsKey})`);
  process.exit(1);
}

// Bot → original tester mapping (primary only)
const BOT_TESTER_MAP: Record<string, string> = {
  bot_hr_generalist_no_nid: 'Angela Fairconeture',
  bot_comp_spec: 'Barb Beecher',
  bot_line_manager: 'Corey Park',
  bot_HR_Crisis: 'Crystal Dunaway',
  bot_payroll_admin: 'Grace George',
  bot_hr_admin: 'Greg Johnson',
  Bot_VP_approver: 'Michelle Kern',
  Bot_div_approver: 'Matt Griffith',
  bot_hr_local_Campus: 'Kelly Verge',
  bot_hr_local_Global_Crisis: 'Mark Kohman',
  bot_hr_local_Global: 'Regina Clark',
  bot_local_campus: 'Steve Clark',
  bot_hr_local_usOps: 'Kelly Murray',
  bot_hr_local_FamilyLife: 'Lauren Erquhart',
  bot_hr_Generalist: 'Phil Stump',
  bot_benefit_admin: 'Santi Torres',
  bot_local_Us_capacity: 'David Soncrant',
  bot_payroll_spec: 'Janet Vankirk',
  Bot_comp_comm_approver: 'Jim Bengston',
};

const testerName = BOT_TESTER_MAP[BOT_NAME] || 'Unknown';

// Pages to check for access — mix of deep links and Redwood springboard paths
const PAGES_TO_CHECK = [
  // Security Console
  { name: 'Security Console', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_security_console' },
  // Core HR (Navigator deep link + Redwood)
  { name: 'Person Management (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_person_management' },
  { name: 'New Person (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_new_person' },
  { name: 'Pending Workers (Redwood)', path: '/fscmUI/redwood/employment-pending-workers/view/dashboard' },
  // Payroll
  { name: 'Calculate QuickPay (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_calculate_quick_pay' },
  { name: 'Payroll Checklists (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_payroll_checklists' },
  { name: 'Element Entries (Deep Link)', path: '/fscmUI/faces/deeplink?objType=PAY_ELEMENT_ENTRY&action=NONE' },
  // Benefits
  { name: 'Benefits Admin (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_benefits_service_center' },
  { name: 'Me > Benefits (Redwood)', path: '/fscmUI/redwood/me-benefits' },
  // Time & Labor
  { name: 'Time Management (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_time_management' },
  { name: 'Time and Absences (Redwood ESS)', path: '/fscmUI/redwood/me-tna' },
  // Absence Management
  { name: 'Absence Management (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_absence_management' },
  // Compensation
  { name: 'Workforce Compensation (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_workforce_compensation' },
  { name: 'Individual Compensation (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_individual_compensation' },
  // Scheduled Processes
  { name: 'Scheduled Processes (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes' },
  // Me (ESS — should always work for any user)
  { name: 'Me > Personal Details (Redwood)', path: '/fscmUI/redwood/me-personal-details' },
  // Manager
  { name: 'My Team (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_team_team_performance' },
  // Journeys
  { name: 'Journeys (Navigator)', path: '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_my_client_groups_journeys' },
  // Directory / Org Chart
  { name: 'Directory (Redwood)', path: '/fscmUI/redwood/directory' },
];

async function waitForJET(page: any, timeout = 15_000): Promise<void> {
  try {
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
  } catch { /* timeout is OK */ }
}

async function main() {
  console.log(`\n=== Discovering access for ${BOT_NAME} (tester: ${testerName}) ===\n`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Step 1: Login as bot user (direct Oracle login — same as LoginPage.directLogin)
  console.log(`Logging in as ${creds.username}...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60_000 });

  // Use the native Oracle login form (User ID / Password / Sign In)
  const userIdField = page.getByRole('textbox', { name: 'User ID' });
  await userIdField.waitFor({ state: 'visible', timeout: 15_000 });
  await userIdField.fill(creds.username);
  await page.getByRole('textbox', { name: 'Password' }).fill(creds.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for login to complete
  try {
    await page.waitForURL('**/fscmUI/**', { timeout: 60_000 });
    console.log('Login successful!\n');
  } catch {
    // Take screenshot and capture any error messages
    await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-login-fail.png` }).catch(() => {});
    const errorText = await page.locator('.xpe, .x6w, [class*="error"], [class*="Error"], .login-error').textContent().catch(() => '');
    const bodySnippet = (await page.textContent('body').catch(() => ''))?.substring(0, 500);
    console.error(`Login failed — could not reach fscmUI`);
    console.error(`Current URL: ${page.url()}`);
    if (errorText) console.error(`Error text: ${errorText}`);
    console.error(`Page content: ${bodySnippet}`);
    await browser.close();
    process.exit(1);
  }
  await waitForJET(page);

  // Step 2: Check access to various pages
  const results: Record<string, { accessible: boolean; title?: string; url?: string; error?: string }> = {};

  for (const check of PAGES_TO_CHECK) {
    process.stdout.write(`  Checking: ${check.name.padEnd(40)}`);
    try {
      const fullUrl = check.path.startsWith('http') ? check.path : `${BASE_URL}${check.path}`;
      const response = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForJET(page, 10_000);

      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => '');

      // Check for access denied indicators
      const denied = await page.locator('text=/Access Denied|Unauthorized|Forbidden|not authorized|no access/i').first().isVisible({ timeout: 3_000 }).catch(() => false);
      const errorPage = await page.locator('text=/Error|Page Not Found|404/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
      // Check if redirected to home (access denied often redirects)
      const redirectedHome = (currentUrl.includes('AtkHomePageWelcome') || currentUrl.includes('homePage')) && !check.path.includes('AtkHomePageWelcome');
      // Check for "Good evening" / "Good morning" (home page indicator when expecting a specific page)
      const landedOnHome = !check.path.includes('AtkHomePageWelcome') && await page.locator('text=/Good (evening|morning|afternoon)/i').first().isVisible({ timeout: 2_000 }).catch(() => false);

      const status = response?.status() || 0;
      const accessible = !denied && !errorPage && !redirectedHome && !landedOnHome && status < 400;

      results[check.name] = {
        accessible,
        title: pageTitle.substring(0, 100),
        url: currentUrl.substring(0, 200),
        ...(denied ? { error: 'Access Denied' } : {}),
        ...(redirectedHome ? { error: 'Redirected to home' } : {}),
        ...(landedOnHome ? { error: 'Redirected to home' } : {}),
        ...(errorPage ? { error: 'Error page' } : {}),
      };

      console.log(accessible ? 'YES' : `NO  (${results[check.name].error || `HTTP ${status}`})`);
    } catch (e: any) {
      results[check.name] = { accessible: false, error: e.message?.substring(0, 100) };
      console.log(`NO  (${e.message?.substring(0, 60)})`);
    }
  }

  // Step 3: If Security Console is accessible, look up original tester's roles
  let testerRoles: { name: string; code: string }[] = [];
  if (results['Security Console']?.accessible) {
    console.log(`\n  Security Console accessible! Looking up roles for ${testerName}...`);
    try {
      // Re-navigate to Security Console
      await page.goto(`${BASE_URL}/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_security_console`, {
        waitUntil: 'domcontentloaded', timeout: 30_000,
      });
      await waitForJET(page);
      await page.waitForTimeout(5_000);

      // Dismiss any warning dialog
      const okBtn = page.getByRole('button', { name: 'OK' });
      if (await okBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await okBtn.click();
        await page.waitForTimeout(2_000);
      }

      // Click "Users" in the sidebar (uses TreeWalker to find sidebar link)
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
      await page.waitForTimeout(3_000);

      // Search for the original tester by name
      // Wait for search input — try multiple selectors since placeholder varies
      await page.waitForTimeout(3_000);
      await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-users-tab.png` }).catch(() => {});
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.waitFor({ state: 'visible', timeout: 10_000 });
      const searchTerm = testerName.split(' ').pop() || testerName; // Last name
      console.log(`  Searching for "${searchTerm}"...`);
      await searchInput.fill(searchTerm);
      await searchInput.press('Enter');
      await page.waitForTimeout(5_000);

      // Take screenshot of search results
      await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-search.png` }).catch(() => {});

      // Click on the tester's user account link
      // Try full name first, then first+last combo, then just last name
      const nameVariants = [
        testerName,
        testerName.split(' ').reverse().join(', '), // "Johnson, Greg"
        searchTerm,
      ];
      let clicked = false;
      for (const variant of nameVariants) {
        const link = page.locator(`a:has-text("${variant}")`).first();
        if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await link.click();
          await page.waitForTimeout(5_000);
          clicked = true;
          break;
        }
      }

      if (clicked) {
        // Take screenshot of user details (shows roles)
        await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-roles.png` }).catch(() => {});

        // Extract roles from the table
        testerRoles = await page.evaluate(() => {
          const items: { name: string; code: string }[] = [];
          const rows = document.querySelectorAll('table tbody tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const roleName = cells[0]?.textContent?.trim() || '';
              const roleCode = cells[1]?.textContent?.trim() || '';
              if (roleName && roleName !== 'Role' && roleName.length > 2) {
                items.push({ name: roleName, code: roleCode });
              }
            }
          }
          return items;
        });

        if (testerRoles.length > 0) {
          console.log(`  Found ${testerRoles.length} roles for ${testerName}:`);
          for (const role of testerRoles) {
            console.log(`    - ${role.name}${role.code ? ` (${role.code})` : ''}`);
          }
        } else {
          console.log('  User details page loaded but no roles extracted from table.');
          // Try alternative extraction — look for role text in the page
          const pageText = await page.textContent('body').catch(() => '');
          const roleMatches = pageText?.match(/(?:Human Resource|Payroll|Benefits|Compensation|Line Manager|CRU|Cru|IT Security|Employee)[^\n]*/gi);
          if (roleMatches) {
            console.log('  Possible role text found on page:');
            for (const m of [...new Set(roleMatches)].slice(0, 20)) {
              console.log(`    ? ${m.trim().substring(0, 100)}`);
            }
          }
        }

        // Also look up the bot's own roles for comparison
        console.log(`\n  Now looking up ${BOT_NAME}'s own roles for comparison...`);
        // Click Done or navigate back
        const doneBtn = page.getByRole('button', { name: 'Done' });
        if (await doneBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await doneBtn.click();
          await page.waitForTimeout(3_000);
        }

        // Search for the bot user
        const botSearch = page.locator('input[placeholder*="3 or more"]').first();
        await botSearch.clear();
        await botSearch.fill(`uat.${BOT_NAME.toLowerCase()}`);
        await botSearch.press('Enter');
        await page.waitForTimeout(5_000);

        const botLink = page.locator(`a:has-text("${BOT_NAME}")`).first();
        if (await botLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await botLink.click();
          await page.waitForTimeout(5_000);

          const botRoles = await page.evaluate(() => {
            const items: { name: string; code: string }[] = [];
            const rows = document.querySelectorAll('table tbody tr');
            for (const row of rows) {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const roleName = cells[0]?.textContent?.trim() || '';
                const roleCode = cells[1]?.textContent?.trim() || '';
                if (roleName && roleName !== 'Role' && roleName.length > 2) {
                  items.push({ name: roleName, code: roleCode });
                }
              }
            }
            return items;
          });

          console.log(`  ${BOT_NAME} current roles (${botRoles.length}):`);
          for (const role of botRoles) {
            console.log(`    - ${role.name}${role.code ? ` (${role.code})` : ''}`);
          }
        }
      } else {
        console.log(`  Could not find user account for "${testerName}" in Security Console.`);
        // Take screenshot
        await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-notfound.png` }).catch(() => {});
      }
    } catch (e: any) {
      console.log(`  Security Console lookup error: ${e.message?.substring(0, 100)}`);
      await page.screenshot({ path: `/tmp/tester-roles/${BOT_NAME}-error.png` }).catch(() => {});
    }
  }

  await browser.close();

  // Step 4: Save results
  const output = {
    botName: BOT_NAME,
    testerName,
    username: creds.username,
    timestamp: new Date().toISOString(),
    pageAccess: results,
    testerRoles: testerRoles.length > 0 ? testerRoles : undefined,
    summary: {
      accessible: Object.entries(results).filter(([, v]) => v.accessible).map(([k]) => k),
      denied: Object.entries(results).filter(([, v]) => !v.accessible).map(([k]) => k),
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(OUTPUT_DIR, `${BOT_NAME}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${outFile}`);
  console.log(`\nSummary for ${BOT_NAME} (${testerName}):`);
  console.log(`  Accessible (${output.summary.accessible.length}): ${output.summary.accessible.join(', ')}`);
  console.log(`  Denied (${output.summary.denied.length}): ${output.summary.denied.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
