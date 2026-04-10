/**
 * Assign security roles to all bot users via Security Console.
 *
 * Strategy: Give each bot user the roles needed for their test function.
 * Most HR bots get the same HR Specialist roles as Josh Starcher.
 * Specialized bots get additional module-specific roles.
 *
 * Usage:
 *   npx tsx scripts/inspect/assign-roles.ts              # All bots
 *   npx tsx scripts/inspect/assign-roles.ts bot_hr_admin  # Single bot
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';

const HEADLESS = process.env.HEADLESS !== 'false';
const SINGLE_BOT = process.argv[2]; // optional: run for one bot only

// ── Role Definitions ──
// All bots get comprehensive roles so any tester can map to any bot.

/** Full set of roles every bot should have */
const ALL_ROLES = [
  'Human Resource Specialist',                  // ORA_PER_HUMAN_RESOURCE_SPECIALIST_JOB
  'CRU Human Resource Specialist View All',     // CRU_HUMAN_RESOURCE_SPECIALIST_VIEW_ALL_DATA
  'CRU Human Resource Analyst View All',        // CRU_HUMAN_RESOURCE_ANALYST_VIEW_ALL_001_DATA
  'Payroll Administrator',                      // ORA_PAY_PAYROLL_ADMINISTRATOR_JOB
  'Benefits Administrator',                     // ORA_BEN_BENEFITS_ADMINISTRATOR_JOB
  'Compensation Specialist',                    // ORA_CMP_COMPENSATION_SPECIALIST_JOB
  'Line Manager',                               // ORA_PER_LINE_MANAGER_JOB
];

/** Time and Labor roles for T&L admin tests. */
const TIME_LABOR_ROLES = [
  'Time and Labor Administrator',               // ORA_HXT_TIME_AND_LABOR_ADMINISTRATOR_JOB
  'CRU Time and Labor Administrator View All',  // CRU_TIME_AND_LABOR_ADMINISTRATOR_VIEW_ALL_DATA
  'Time and Labor Manager',                     // ORA_HXT_TIME_AND_LABOR_MANAGER_JOB
  'CRU Time and Labor Manager View All',        // CRU_TIME_AND_LABOR_MANAGER_VIEW_ALL_DATA
];

/** Map: botName → roles to ADD. All bots get the same comprehensive set. */
const BOT_ROLE_MAP: Record<string, string[]> = {
  bot_hr_admin:                 [...ALL_ROLES, ...TIME_LABOR_ROLES],
  bot_hr_generalist_no_nid:     [...ALL_ROLES, 'RJM HR Specialist No Crisis and NID role Custom'],
  bot_hr_generalist:            [...ALL_ROLES, ...TIME_LABOR_ROLES],
  bot_hr_local_usops:           ALL_ROLES,
  bot_hr_local_campus:          ALL_ROLES,
  bot_hr_local_global:          ALL_ROLES,
  bot_hr_local_global_crisis:   ALL_ROLES,
  bot_hr_local_familylife:      ALL_ROLES,
  bot_local_campus:             ALL_ROLES,
  bot_local_us_capacity:        ALL_ROLES,
  bot_hr_crisis:                ALL_ROLES,
  bot_payroll_admin:            [...ALL_ROLES, ...TIME_LABOR_ROLES],
  bot_benefit_admin:            ALL_ROLES,
  bot_comp_spec:                ALL_ROLES,
  bot_line_manager:             [...ALL_ROLES, ...TIME_LABOR_ROLES],
  bot_vp_approver:              ALL_ROLES,
  bot_div_approver:             ALL_ROLES,
};

// ── Helpers ──

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

/**
 * Add roles to a single bot user via the Security Console "Add Role Membership from Role" dialog.
 *
 * Flow:
 * 1. Search for user → click account → click Edit
 * 2. Click "Add Role" → dialog opens
 * 3. For each role: search → select from results → click "Add Role Membership"
 * 4. Click "Done" to close dialog
 * 5. Click "Save and Close"
 * 6. Click "Done" to return to user list
 */
async function addRolesToUser(
  page: Page,
  botName: string,
  roles: string[],
): Promise<{ success: boolean; added: string[]; skipped: string[]; errors: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // ── Step 1: Search for the user account ──
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  await searchInput.fill(`uat.${botName}`);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  // Check for no results
  const noData = page.getByText('No data to display');
  if (await noData.isVisible({ timeout: 2000 }).catch(() => false)) {
    return { success: false, added: [], skipped: [], errors: [`Account uat.${botName} not found`] };
  }

  // Click the account link
  const accountLink = page.locator(`a:has-text("${botName}")`).first();
  if (!await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    return { success: false, added: [], skipped: [], errors: [`Account link for ${botName} not visible`] };
  }
  await accountLink.click();
  await page.waitForTimeout(5000);

  // ── Step 2: Check existing roles ──
  // The Roles table has columns: Role, Role Code, Assignable, Auto-Provisioned
  // Only grab the first cell of each row in the roles table (which follows the "Roles" heading)
  const existingRoles = await page.evaluate(() => {
    const roles: string[] = [];
    // Find the table that contains roles by looking for "Role Code" header
    const tables = document.querySelectorAll('table');
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

  // Filter out roles the user already has
  const rolesToAdd = roles.filter(r => !existingRoles.includes(r));
  const alreadyHas = roles.filter(r => existingRoles.includes(r));
  if (alreadyHas.length > 0) {
    for (const r of alreadyHas) skipped.push(r);
    console.log(`  Already has: ${alreadyHas.join(', ')}`);
  }

  if (rolesToAdd.length === 0) {
    console.log(`  All roles already assigned — skipping`);
    // Click Done to go back
    const doneBtn = page.getByRole('button', { name: 'Done' });
    if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(3000);
    }
    return { success: true, added: [], skipped, errors: [] };
  }

  // ── Step 3: Click Edit ──
  const editBtn = page.getByRole('button', { name: 'Edit' });
  if (!await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { success: false, added: [], skipped, errors: ['Edit button not found'] };
  }
  await editBtn.click();
  await page.waitForTimeout(3000);

  // ── Step 4: Click Add Role → opens "Add Role Membership from Role" dialog ──
  const addRoleBtn = page.getByRole('button', { name: 'Add Role' }).first();
  await addRoleBtn.click();
  await page.waitForTimeout(3000);

  // ── Step 5: For each role, search and add ──
  for (const roleName of rolesToAdd) {
    try {
      // Type into the search box
      const roleSearchBox = page.locator('input[placeholder*="3 or more characters to search"]').last();
      if (!await roleSearchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
        errors.push(`Search box not visible for ${roleName}`);
        break;
      }
      await roleSearchBox.clear();
      await roleSearchBox.fill(roleName);

      // Click the search icon (magnifying glass button next to search box)
      const searchIcon = page.locator('[id*="urSrcBx"] ~ a, button[title*="Search"], img[title*="Search"]').first();
      if (await searchIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchIcon.click();
      } else {
        // Fallback: press Enter
        await roleSearchBox.press('Enter');
      }
      await page.waitForTimeout(5000);

      // Check search result count
      const countText = await page.locator('text=Search Result Count').textContent().catch(() => '');
      console.log(`    Searching "${roleName}": ${countText}`);

      // Check for "No data to display" in results
      const noResults = page.locator('.AFDetectExpansion:visible, [id*="addRole"]').getByText('No data to display');
      if (await page.locator('text=Search Result Count : 0').isVisible({ timeout: 1000 }).catch(() => false)) {
        errors.push(`Role "${roleName}" not found in search`);
        continue;
      }

      // Select the role from search results.
      // Results appear as a table with checkboxes. Click the row with the exact role name.
      // Try clicking directly on the role name in the results table
      const roleRow = page.locator(`td:has-text("${roleName}")`).first();
      if (await roleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleRow.click();
        await page.waitForTimeout(1000);
      } else {
        // Fallback: try link
        const roleLink = page.locator(`a:has-text("${roleName}")`).last();
        if (await roleLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleLink.click();
          await page.waitForTimeout(1000);
        } else {
          await page.screenshot({ path: `/tmp/role-notfound-${botName}-${roleName.replace(/\s/g, '_')}.png` });
          errors.push(`Role "${roleName}" not visible in results`);
          continue;
        }
      }

      // Click "Add Role Membership" button
      const addMembershipBtn = page.getByRole('button', { name: 'Add Role Membership' });
      if (await addMembershipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addMembershipBtn.click();
        await page.waitForTimeout(3000);
        added.push(roleName);
        console.log(`    + Added: ${roleName}`);
      } else {
        errors.push(`"Add Role Membership" button not visible after selecting ${roleName}`);
      }
    } catch (err: any) {
      errors.push(`Error adding "${roleName}": ${err.message.slice(0, 80)}`);
      await page.screenshot({ path: `/tmp/role-error-${botName}-${roleName.replace(/\s/g, '_')}.png` });
    }
  }

  // ── Step 6: Close the "Add Role Membership" dialog ──
  const dialogDoneBtn = page.getByRole('button', { name: 'Done' }).last();
  if (await dialogDoneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dialogDoneBtn.click();
    await page.waitForTimeout(2000);
  }

  // ── Step 7: Leave edit page ──
  // Role memberships are persisted immediately by the dialog — no "Save" needed.
  // "Save and Close" only saves user info changes (which we didn't make), so it stays disabled.
  // Click "Cancel" to exit edit mode, or "Save and Close" if it's enabled.
  const saveBtn = page.getByRole('button', { name: 'Save and Close' });
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isDisabled = await saveBtn.getAttribute('aria-disabled');
    if (isDisabled === 'true') {
      // Save is disabled — roles already persisted, click Cancel
      await cancelBtn.click();
      await page.waitForTimeout(3000);
    } else {
      await saveBtn.click();
      await page.waitForTimeout(5000);
    }
  } else if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(3000);
  }

  // Dismiss any confirmation/warning
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  // ── Step 8: Click Done to return to user list ──
  const backDoneBtn = page.getByRole('button', { name: 'Done' });
  if (await backDoneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await backDoneBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: errors.length === 0, added, skipped, errors };
}

// ── Main ──

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.fullLogin();
  console.log('Logged in successfully\n');

  // Navigate to Security Console
  await page.locator('a[title="Navigator"]').first().click({ force: true });
  await page.waitForTimeout(3000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  await page.getByRole('link', { name: 'Security Console' }).first().click();
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
  console.log('On User Accounts page\n');

  // Determine which bots to process
  const botsToProcess = SINGLE_BOT
    ? { [SINGLE_BOT]: BOT_ROLE_MAP[SINGLE_BOT] || ALL_ROLES }
    : BOT_ROLE_MAP;

  const results: { bot: string; result: Awaited<ReturnType<typeof addRolesToUser>> }[] = [];

  for (const [botName, roles] of Object.entries(botsToProcess)) {

    console.log(`\n[${botName}] Assigning ${roles.length} roles...`);
    const result = await addRolesToUser(page, botName, roles);
    results.push({ bot: botName, result });

    if (result.success) {
      console.log(`  ✓ Success (added: ${result.added.length}, skipped: ${result.skipped.length})`);
    } else {
      console.log(`  ✗ Errors: ${result.errors.join('; ')}`);
    }
  }

  // ── Summary ──
  console.log('\n\n=== SUMMARY ===\n');
  let totalAdded = 0, totalSkipped = 0, totalErrors = 0;
  for (const { bot, result } of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${bot}: +${result.added.length} added, ${result.skipped.length} skipped, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      for (const e of result.errors) console.log(`    ERROR: ${e}`);
    }
    totalAdded += result.added.length;
    totalSkipped += result.skipped.length;
    totalErrors += result.errors.length;
  }
  console.log(`\nTotal: ${totalAdded} roles added, ${totalSkipped} already had, ${totalErrors} errors`);

  await browser.close();
}

main().catch(console.error);
