/**
 * Swap "Cru HR Specialist No Crisis and NID Data" → "RJM HR Specialist No Crisis and NID role Custom"
 * for bot_hr_generalist_no_nid via Security Console UI.
 *
 * Usage: npx tsx scripts/inspect/swap-no-nid-role.ts
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';

const HEADLESS = process.env.HEADLESS !== 'false';
const OLD_ROLE = 'Cru HR Specialist No Crisis and NID Data';
const NEW_ROLE = 'RJM HR Specialist No Crisis and NID role Custom';
const BOT_NAME = 'bot_hr_generalist_no_nid';

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

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Login as SSO admin (Security Console requires admin access)
  const loginPage = new LoginPage(page);
  await loginPage.fullLogin();
  console.log('Logged in\n');

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

  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  await clickSidebarUsers(page);
  console.log('On User Accounts page\n');

  // Search for the bot user
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  await searchInput.fill(`uat.${BOT_NAME}`);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  const accountLink = page.locator(`a:has-text("${BOT_NAME}")`).first();
  if (!await accountLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error(`Could not find account for uat.${BOT_NAME}`);
    await browser.close();
    process.exit(1);
  }
  await accountLink.click();
  await page.waitForTimeout(5000);

  // Read current roles
  const existingRoles: string[] = await page.evaluate(() => {
    const roles: string[] = [];
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
      if (headerTexts.includes('Role Code')) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const name = row.querySelector('td')?.textContent?.trim();
          if (name) roles.push(name);
        }
        break;
      }
    }
    return roles;
  });
  console.log(`Current roles (${existingRoles.length}):`);
  existingRoles.forEach(r => console.log(`  - ${r}`));

  const hasOld = existingRoles.includes(OLD_ROLE);
  const hasNew = existingRoles.includes(NEW_ROLE);
  console.log(`\nOld role present: ${hasOld}`);
  console.log(`New role present: ${hasNew}`);

  if (!hasOld && hasNew) {
    console.log('\nAlready swapped — nothing to do.');
    await browser.close();
    return;
  }

  // Click Edit
  const editBtn = page.getByRole('button', { name: 'Edit' });
  if (!await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error('Edit button not found');
    await browser.close();
    process.exit(1);
  }
  await editBtn.click();
  await page.waitForTimeout(3000);

  // ── Step 1: Remove old role ──
  if (hasOld) {
    console.log(`\nRemoving: ${OLD_ROLE}`);
    // Find the row with the old role and click its delete/remove icon
    const removed = await page.evaluate((roleName: string) => {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
        if (headerTexts.includes('Role Code')) {
          const rows = table.querySelectorAll('tbody tr');
          for (const row of rows) {
            const firstCell = row.querySelector('td');
            if (firstCell?.textContent?.trim() === roleName) {
              // Look for a delete icon/button in the row
              const deleteBtn = row.querySelector('button[title*="Delete"], button[title*="Remove"], a[title*="Delete"], a[title*="Remove"], img[title*="Delete"]') as HTMLElement | null;
              if (deleteBtn) { deleteBtn.click(); return true; }
              // Try clicking any icon in the last cell
              const lastCell = row.querySelector('td:last-child');
              const icon = lastCell?.querySelector('a, button, img') as HTMLElement | null;
              if (icon) { icon.click(); return true; }
            }
          }
        }
      }
      return false;
    }, OLD_ROLE);

    if (removed) {
      console.log(`  Clicked delete for ${OLD_ROLE}`);
      await page.waitForTimeout(3000);
      // Confirm deletion if a dialog appears
      const confirmOk = page.getByRole('button', { name: /OK|Yes|Confirm/i });
      if (await confirmOk.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmOk.click();
        await page.waitForTimeout(2000);
      }
    } else {
      console.log(`  Could not find delete button for ${OLD_ROLE} — may need manual removal`);
    }
  }

  // ── Step 2: Add new role ──
  if (!hasNew) {
    console.log(`\nAdding: ${NEW_ROLE}`);
    const addRoleBtn = page.getByRole('button', { name: 'Add Role' }).first();
    if (!await addRoleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.error('Add Role button not found');
    } else {
      await addRoleBtn.click();
      await page.waitForTimeout(3000);

      const roleSearchBox = page.locator('input[placeholder*="3 or more characters to search"]').last();
      await roleSearchBox.clear();
      await roleSearchBox.fill(NEW_ROLE);

      const searchIcon = page.locator('[id*="urSrcBx"] ~ a, button[title*="Search"], img[title*="Search"]').first();
      if (await searchIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchIcon.click();
      } else {
        await roleSearchBox.press('Enter');
      }
      await page.waitForTimeout(5000);

      if (await page.locator('text=Search Result Count : 0').isVisible({ timeout: 1000 }).catch(() => false)) {
        console.error(`  Role "${NEW_ROLE}" not found in search — check the exact role name`);
      } else {
        const roleRow = page.locator(`td:has-text("${NEW_ROLE}")`).first();
        if (await roleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
          await roleRow.click();
          await page.waitForTimeout(1000);
        }
        const addMembershipBtn = page.getByRole('button', { name: 'Add Role Membership' });
        if (await addMembershipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addMembershipBtn.click();
          await page.waitForTimeout(3000);
          console.log(`  Added: ${NEW_ROLE}`);
        }
      }

      // Close dialog
      const dialogDone = page.getByRole('button', { name: 'Done' }).last();
      if (await dialogDone.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dialogDone.click();
        await page.waitForTimeout(2000);
      }
    }
  }

  // ── Step 3: Save ──
  const saveBtn = page.getByRole('button', { name: 'Save and Close' });
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const isDisabled = await saveBtn.getAttribute('aria-disabled');
    if (isDisabled === 'true') {
      await cancelBtn.click();
    } else {
      await saveBtn.click();
      await page.waitForTimeout(5000);
    }
  } else if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(3000);
  }

  const okBtn2 = page.getByRole('button', { name: 'OK' });
  if (await okBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn2.click();
    await page.waitForTimeout(2000);
  }

  const backDone = page.getByRole('button', { name: 'Done' });
  if (await backDone.isVisible({ timeout: 5000 }).catch(() => false)) {
    await backDone.click();
    await page.waitForTimeout(3000);
  }

  console.log('\nDone. Role swap complete for bot_hr_generalist_no_nid.');
  console.log('Next: run tests assigned to this bot to check for new access errors.');
  await browser.close();
}

main().catch(console.error);
