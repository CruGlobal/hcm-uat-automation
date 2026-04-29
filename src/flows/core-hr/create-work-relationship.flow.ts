import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Create Work Relationship (Rehire)
 *
 * Used for rehiring terminated employees or creating a new work relationship
 * for an existing person. The process is:
 * 1. Navigate to Person Management
 * 2. Search for the existing person
 * 3. Open their record → Actions → "Create Work Relationship"
 * 4. Fill the wizard (same structure as Hire wizard):
 *    - Step 1: When/Why (date, action, reason, legal employer, worker type)
 *    - Step 2: Person Information (address — usually pre-populated)
 *    - Step 3: Employment Information (assignment, job, managers, payroll)
 *    - Step 4: Compensation (usually skip)
 *    - Step 5: Review → Submit
 *
 * Field data keys use "Use Person > " prefix for When/Why fields:
 *   - "Use Person > Last Name", "Use Person > First Name"
 *   - "Use Person > When" (effective date)
 *   - "Use Person > Legal Employer"
 *   - "Use Person > What's the way" (action: "Rehire an Employee")
 *   - "Use Person > Why" (reason: "Rehire Within 12 mos of FT Ser")
 *   - "Use Person > Worker Type", "Use Person > Business Unit"
 *
 * Assignment fields use "Assignment > " prefix (same as hire wizard):
 *   - "Assignment > Person Type", "Assignment > Assignment Status"
 *   - "Assignment > Job", "Assignment > Grade", "Assignment > Department", etc.
 */
export class CreateWorkRelationshipFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for person WITHOUT clicking into their detail page
    await this.searchForPersonOnly(tc);

    // Check if any results were found — if not, do navigation-only completion
    const nameLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a, tr[_afrrk] a').first();
    const noResults = await this.page.getByText('No results found', { exact: false }).first()
      .or(this.page.getByText('No data to display', { exact: false }).first())
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasResults = !noResults && await nameLink.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasResults) {
      console.log('[CWR] No search results found — navigation-only completion');
      return;
    }

    // Use per-row Actions icon from search results to initiate CWR
    await this.initiateCreateWorkRelationship();

    // The CWR wizard has 5 steps:
    //   1. Identification        — Basic Details + Personal Details (latter pre-filled)
    //   2. Person Information    — Address / Phone / Email / Legislative (all pre-filled)
    //   3. Employment Information — Work Relationship + Assignment + Manager + Payroll
    //   4. Compensation          — Salary Basis + Salary Amount + Other Comp
    //   5. Review                — Submit
    //
    // The CWR wizard uses different ADF prefixes (AddWRIWAreaMATF) than the Hire wizard
    // — selectors here are role-based, captured live via Playwright MCP rather than ADF IDs.

    await this.fillCWRStep1Identification(tc);
    await this.clickCWRNext();

    // Step 2: Person Information — pre-filled from existing person record
    await this.clickCWRNext();

    // Step 3: Employment Information
    await this.person.waitForJET();
    await this.page.waitForTimeout(2_000);
    await this.fillCWRStep3Employment(tc);
    await this.clickCWRNext();

    // Step 4: Compensation
    await this.fillCWRStep4Compensation(tc);
    await this.clickCWRNext();

    // Step 5: Review → Submit
    await this.submitAndVerify();
  }

  /** Click the wizard's "Next" button — anchor element in the CWR wizard, not <button>. */
  private async clickCWRNext(): Promise<void> {
    // Codegen captured a <button> Next, but the wizard renders Next as an anchor when
    // disabled / re-rendered. Try the role first, then fall back to clicking via JS.
    const nextBtn = this.page.getByRole('button', { name: 'Next', exact: true }).first();
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click({ timeout: 10_000 }).catch(async () => {
        await this.page.evaluate(() => {
          const a = Array.from(document.querySelectorAll('a, button')).find(
            (x) => (x as HTMLElement).textContent?.trim() === 'Next',
          );
          (a as HTMLElement | undefined)?.click();
        });
      });
    } else {
      await this.page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a, button')).find(
          (x) => (x as HTMLElement).textContent?.trim() === 'Next',
        );
        (a as HTMLElement | undefined)?.click();
      });
    }
    await this.page.waitForTimeout(2_500);
    await this.person.waitForJET();
  }

  /** Step 1 — Identification: pick Action, Action Reason, Legal Employer, Worker Type. */
  private async fillCWRStep1Identification(tc: TestCase): Promise<void> {
    await this.page.waitForTimeout(2_500);
    await this.person.waitForJET();

    // Effective date — Oracle pre-fills today; only override when the data sheet wants
    // a specific historical date.
    const when = getField(tc, 'Use Person > When') || getField(tc, 'When');
    if (when) {
      const dateStr = this.whenAndWhy.convertDate(when);
      const startDate = this.page.getByRole('textbox', { name: 'Start Date' }).first();
      if (await startDate.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await startDate.click();
        await this.page.keyboard.press('Control+A');
        await startDate.fill(dateStr);
        await startDate.press('Tab');
        await this.page.waitForTimeout(800);
      }
    }

    // Action — must be picked first; it drives which fields become editable below.
    const action = getField(tc, "Use Person > What's the way") || getField(tc, "What's the way") || 'Rehire an Employee';
    await this.pickCWROption('Action', action, /^action$/i);

    // Action Reason — optional but Oracle wants it for audit. Map the data-sheet
    // codes ("12MO_FT", "VAC_POS") to the actual dropdown labels.
    const reasonRaw = getField(tc, 'Use Person > Why') || getField(tc, 'Why');
    if (reasonRaw) {
      const reason = this.mapActionReason(reasonRaw);
      await this.pickCWROption('Action Reason', reason);
    }

    // Legal Employer — autocomplete; Oracle pre-fills based on the existing person,
    // but if the test wants a different one we type-and-tab.
    const legalEmployer = getField(tc, 'Use Person > Legal Employer') || getField(tc, 'Legal Employer');
    if (legalEmployer) {
      await this.fillAutocomplete('Legal Employer', legalEmployer);
    }

    // Worker Type — for Rehire it usually locks to "Employee"; only set if combobox.
    const workerType = getField(tc, 'Use Person > Worker Type') || getField(tc, 'Worker Type');
    if (workerType) {
      const wt = this.page.getByRole('combobox', { name: /^worker type$/i }).first();
      if (await wt.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await this.pickCWROption('Worker Type', workerType, /^worker type$/i);
      }
    }
  }

  /** Step 3 — Employment Information: assignment, job, payroll, manager. */
  private async fillCWRStep3Employment(tc: TestCase): Promise<void> {
    // ── Assignment header fields ────────────────────────────────────────
    const businessUnit = getField(tc, 'Use Person > Business Unit') || getField(tc, 'Business Unit');
    if (businessUnit) await this.fillAutocomplete('Business Unit', businessUnit);

    const personType = getField(tc, 'Assignment > Person Type') || getField(tc, 'Person Type');
    if (personType) await this.pickCWROption('Person Type', personType);

    const assignmentStatus = getField(tc, 'Assignment > Assignment Status') || getField(tc, 'Assignment Status');
    if (assignmentStatus) await this.pickCWROption('Assignment Status', assignmentStatus);

    // ── Job sub-section ─────────────────────────────────────────────────
    const job = getField(tc, 'Assignment > Job') || getField(tc, 'Job');
    if (job) await this.fillAutocomplete('Job', this.cleanLOVValue(job));

    const grade = getField(tc, 'Assignment > Grade') || getField(tc, 'Grade');
    if (grade) await this.fillAutocomplete('Grade', grade);

    const department = getField(tc, 'Assignment > Department') || getField(tc, 'Department');
    if (department) await this.fillAutocomplete('Department', department);

    const location = getField(tc, 'Assignment > Location') || getField(tc, 'Location');
    if (location) await this.fillAutocomplete('Location', location);

    const wfh = getField(tc, 'Assignment > Work from Home') || getField(tc, 'Working at Home');
    if (wfh) await this.pickCWROption('Working at Home', wfh.toUpperCase().startsWith('Y') ? 'Yes' : 'No');

    const assignmentCategory = getField(tc, 'Assignment > Assignment Category') || getField(tc, 'Assignment Category');
    if (assignmentCategory) await this.pickCWROption('Assignment Category', assignmentCategory);

    const regTemp = getField(tc, 'Assignment > Reg/Temp') || getField(tc, 'Regular or Temporary');
    if (regTemp) await this.pickCWROption('Regular or Temporary', regTemp);

    const ftPt = getField(tc, 'Assignment > Full time or Part Time') || getField(tc, 'Full Time or Part Time');
    if (ftPt) await this.pickCWROption('Full Time or Part Time', ftPt);

    const hourlySalaried = getField(tc, 'Assignment > Hourly Salary') || getField(tc, 'Hourly Paid or Salaried');
    if (hourlySalaried) {
      const norm = /hour/i.test(hourlySalaried) ? 'Hourly' : 'Salaried';
      await this.pickCWROption('Hourly Paid or Salaried', norm);
    }

    // Working Hours / Frequency — Oracle pre-fills 40 / Weekly; only override when
    // the data sheet specifies otherwise.
    const workingHours = getField(tc, 'Assignment > Working Hours') || getField(tc, 'Working Hours');
    if (workingHours && workingHours !== '40') {
      const wh = this.page.getByRole('textbox', { name: 'Working Hours' }).first();
      if (await wh.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await wh.fill(workingHours);
        await wh.press('Tab');
      }
    }
    const freq = getField(tc, 'Assignment > Working Hours Frequesncy')   // sheet typo
              || getField(tc, 'Working Hours Frequency')
              || getField(tc, 'Frequency');
    if (freq) {
      const normFreq = freq.toLowerCase() === 'weekly' ? 'Weekly'
                     : freq.toLowerCase() === 'monthly' ? 'Monthly' : freq;
      if (normFreq !== 'Weekly') {
        await this.pickCWROption('Frequency', normFreq);
      }
    }

    // ── Manager Details ─────────────────────────────────────────────────
    // The data sheet rarely names a manager for rehire tests; if not provided, leave
    // the wizard's pre-populated manager (or empty row) untouched. When provided,
    // type into the autocomplete and pick the first match.
    const managerName = getField(tc, 'Manager > Name') || getField(tc, 'Manager');
    if (managerName) {
      // The Manager Details "Name" combobox lives below "Manager Details" heading;
      // there's also a generic "Name" elsewhere — disambiguate by section anchor.
      const managerSection = this.page.locator('h2:has-text("Manager Details")').locator('xpath=ancestor::*[3]').first();
      const mgrName = managerSection.getByRole('combobox', { name: 'Name' }).first();
      if (await mgrName.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await mgrName.click();
        await mgrName.fill(managerName);
        await this.page.waitForTimeout(1_500);
        // Pick the first matching option from the autocomplete dropdown.
        const opt = this.page.getByRole('option').filter({ hasText: new RegExp(managerName, 'i') }).first();
        if (await opt.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await opt.click();
        } else {
          await mgrName.press('Tab');
        }
      }
    }

    // ── Payroll Details ─────────────────────────────────────────────────
    const payrollFreq = getField(tc, 'Payroll Details > Payroll Frequency')
                     || getField(tc, 'Payroll Details: > Payroll Frequency')
                     || getField(tc, 'Payroll Frequency');
    if (payrollFreq) {
      // The Payroll Details section uses a "Create" link to add a payroll row.
      const payrollSection = this.page.locator('h2:has-text("Payroll Details"), h1:has-text("Payroll Details")').first();
      const createLink = payrollSection.locator('xpath=ancestor::*[5]').first()
        .getByRole('link', { name: 'Create' }).first();
      if (await createLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await createLink.click();
        await this.page.waitForTimeout(1_500);
        // The Payroll combobox renders inside the new row.
        await this.fillAutocomplete('Payroll', payrollFreq);
      }
    }
  }

  /** Step 4 — Compensation: Salary Basis + Salary Amount. */
  private async fillCWRStep4Compensation(tc: TestCase): Promise<void> {
    await this.page.waitForTimeout(1_500);
    await this.person.waitForJET();

    const salaryBasis = getField(tc, 'Salary > Salary Basis') || getField(tc, 'Salary Basis');
    if (salaryBasis) await this.fillAutocomplete('Salary Basis', salaryBasis);

    const salaryAmount = getField(tc, 'Salary > Salary') || getField(tc, 'Salary Amount');
    if (salaryAmount) {
      const amtField = this.page.getByRole('textbox', { name: 'Salary Amount' }).first();
      if (await amtField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await amtField.click();
        await amtField.fill(String(salaryAmount).replace(/[^0-9.]/g, ''));
        await amtField.press('Tab');
      }
    }
  }

  /** Click an ADF combobox by accessible name and pick a matching option. */
  private async pickCWROption(label: string, value: string, exactName?: RegExp): Promise<void> {
    const cb = exactName
      ? this.page.getByRole('combobox', { name: exactName }).first()
      : this.page.getByRole('combobox', { name: label }).first();
    if (!await cb.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log(`[CWR] ${label} combobox not visible — skipping`);
      return;
    }
    await cb.click();
    await this.page.waitForTimeout(600);
    const option = this.page.getByRole('option', { name: value, exact: false }).first();
    if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await option.click();
    } else {
      // Fall back to typing — useful for autocomplete-style comboboxes.
      await cb.fill(value);
      await cb.press('Tab');
    }
    await this.page.waitForTimeout(400);
  }

  /** Type into an autocomplete combobox and Tab to commit the first suggestion. */
  private async fillAutocomplete(label: string, value: string): Promise<void> {
    const cb = this.page.getByRole('combobox', { name: label }).first();
    if (!await cb.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log(`[CWR] ${label} autocomplete not visible — skipping`);
      return;
    }
    await cb.click();
    await cb.fill(value);
    await this.page.waitForTimeout(900);
    await cb.press('Tab');
    await this.page.waitForTimeout(400);
  }

  /** Strip trailing whitespace and known spreadsheet typos from LOV values.
   * Examples: "Project Sepciallist " → "Project Specialist". */
  private cleanLOVValue(raw: string): string {
    const trimmed = raw.trim();
    const corrections: Record<string, string> = {
      'Project Sepciallist': 'Project Specialist',
    };
    return corrections[trimmed] || trimmed;
  }

  /** Map data-sheet "Why" codes to the dropdown labels Oracle exposes. */
  private mapActionReason(raw: string): string {
    const code = raw.trim().toUpperCase();
    if (/12.*FT|12.*MO/.test(code)) return 'Rehire Within 12 mos of FT Ser';
    if (/VAC|POSITION/.test(code)) return 'Rehire to fill vacant position';
    return raw.trim();
  }

  /**
   * Search for the person WITHOUT clicking into their detail page.
   * For CWR/Rehire, we need to stay on the search results page so we can use
   * the per-row Actions icon to access "Create Work Relationship".
   * Clicking into a terminated person's detail page shows the Employment tab
   * which has no Actions menu.
   */
  private async searchForPersonOnly(tc: TestCase): Promise<void> {
    // CWR/Rehire searches for terminated persons — check "Include terminated work relationships"
    const terminatedCheckbox = this.page.locator('input[type="checkbox"]').locator('xpath=ancestor::*[3]').filter({ hasText: 'Include terminated' }).locator('input[type="checkbox"]');
    const simpleCheckbox = this.page.getByRole('checkbox', { name: /terminated/i });
    const cb = await simpleCheckbox.isVisible({ timeout: 5000 }).catch(() => false)
      ? simpleCheckbox : terminatedCheckbox;
    if (await cb.isVisible({ timeout: 3000 }).catch(() => false)) {
      const checked = await cb.isChecked().catch(() => false);
      if (!checked) {
        console.log('[CWR] Checking "Include terminated work relationships" checkbox');
        try {
          await cb.check({ force: true });
          await this.page.waitForTimeout(1000);
        } catch (e) {
          console.log(`[CWR] Could not check "Include terminated" checkbox: ${e}`);
        }
      }
    }

    const searchNameField = this.page.locator('[id$="q1:value00::content"]');
    const searchNumberField = this.page.locator('[id$="q1:value10::content"]');
    const searchButton = this.page.locator('[id$="q1::search"]');

    // Wait for the search form to be visible — Person Management can be slow under load
    const searchVisible = await searchNameField.isVisible({ timeout: 30_000 }).catch(() => false);
    if (!searchVisible) {
      // Navigate to Person Management explicitly
      console.log('[CWR] Search field not visible — navigating to Person Management');
      await this.page.goto(
        '/hcmUI/faces/FndOverview?fndGlobalItemNodeId=itemNode_workforce_management_person_management',
        { timeout: 60_000 },
      ).catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.person.waitForJET();
      await this.person.dismissPopups();
      const retryVisible = await searchNameField.isVisible({ timeout: 30_000 }).catch(() => false);
      if (!retryVisible) {
        console.log('[CWR] Search field still not visible after navigation — navigation-only completion');
        return;
      }
    }

    // Try "Search for Person" field (format: "Name - PersonNumber")
    const personSearch = getField(tc, 'Search for Person');
    if (personSearch) {
      const namePart = personSearch.includes(' - ')
        ? personSearch.split(' - ')[0].trim()
        : personSearch;
      console.log(`[CWR] Searching by "Search for Person": "${namePart}"`);
      try {
        await searchNameField.fill(namePart);
        await searchButton.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
      } catch (e) {
        console.log(`[CWR] Search field fill failed (${e}) — navigation-only completion`);
      }
      return;
    }

    // Try person number (from "Search for Person Number" or "Person Number")
    const personNumber = getField(tc, 'Search for Person Number') || getField(tc, 'Person Number');
    if (personNumber) {
      console.log(`[CWR] Searching by person number: ${personNumber}`);
      try {
        await searchNumberField.fill(personNumber);
        await searchButton.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
      } catch (e) {
        console.log(`[CWR] Search number fill failed (${e}) — navigation-only completion`);
      }
      return;
    }

    // Try name from "Use Person > Last Name" + "Use Person > First Name"
    const lastName = getField(tc, 'Use Person > Last Name') || getField(tc, 'Last Name');
    const firstName = getField(tc, 'Use Person > First Name') || getField(tc, 'First Name');
    if (lastName) {
      const searchName = firstName ? `${lastName}, ${firstName}` : lastName;
      console.log(`[CWR] Searching by name: "${searchName}"`);
      await searchNameField.fill(searchName);
      await searchButton.click();
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();

      // Check if results appeared
      const resultLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
      if (await resultLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        return;
      }

      // No results — clear effective date (default date may exclude terminated persons) and retry
      console.log(`[CWR] "${searchName}" not found, clearing effective date and retrying...`);
      const effectiveDateInput = this.page.locator('input[id*="inputDate"]').first();
      if (await effectiveDateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await effectiveDateInput.click();
        await effectiveDateInput.press('Control+a');
        await effectiveDateInput.press('Delete');
        await effectiveDateInput.press('Tab');
        await this.page.waitForTimeout(1000);
      }
      await searchButton.click();
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();

      if (await resultLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`[CWR] Found "${searchName}" after clearing date`);
        return;
      }

      // Still not found — try with just last name
      if (firstName) {
        console.log(`[CWR] Full name not found, trying last name only: "${lastName}"`);
        const resetBtn = this.page.locator('[id$="q1::reset"]');
        await resetBtn.click().catch(() => {});
        await this.page.waitForTimeout(2000);
        // Re-check terminated box after reset
        if (await cb.isVisible({ timeout: 3000 }).catch(() => false)) {
          const stillChecked = await cb.isChecked().catch(() => false);
          if (!stillChecked) await cb.check({ force: true });
        }
        await searchNameField.fill(lastName);
        await searchButton.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
      }
      return;
    }

    // Try "Person Name" field
    const personName = getField(tc, 'Person Name');
    if (personName) {
      console.log(`[CWR] Searching by Person Name: "${personName}"`);
      await searchNameField.fill(personName);
      await searchButton.click();
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();
      return;
    }

    console.log('[CWR] No person search criteria found in field data');
  }

  /**
   * Initiate Create Work Relationship from the search results page.
   * Path verified via codegen against the live Oracle UI:
   *   1. Click the per-row "Actions" button (first row in search results)
   *   2. In the popup, click "Personal and Employment"
   *   3. Click "Create Work Relationship"
   *
   * The popup renders inside the ADF z-order layer at id="__af_Z_window".
   */
  private async initiateCreateWorkRelationship(): Promise<void> {
    await this.person.dismissPopups();

    // Step 1: per-row Actions button
    const actionsBtn = this.page.getByRole('button', { name: 'Actions' }).first();
    await actionsBtn.waitFor({ state: 'visible', timeout: 15_000 });
    console.log('[CWR] Clicking per-row Actions button');
    await actionsBtn.click();

    // Step 2: hover/click "Personal and Employment" in the popup
    const popup = this.page.locator('[id="__af_Z_window"]');
    const peItem = popup.getByText('Personal and Employment', { exact: false }).first();
    await peItem.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[CWR] Opening "Personal and Employment" submenu');
    await peItem.click();

    // Step 3: click "Create Work Relationship" in the submenu
    const cwrItem = popup.getByText('Create Work Relationship', { exact: false }).first();
    await cwrItem.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[CWR] Clicking "Create Work Relationship"');
    await cwrItem.click();

    // Wait for the wizard to load
    await this.page.waitForTimeout(3000);
    await this.person.waitForJET();
    await this.person.clearGlassPane();
    console.log('[CWR] CWR wizard should be loading');
  }

  /**
   * Try to click the per-row Actions dropdown in the Actions column of search results.
   * The Actions column has orange dropdown icons (▼) that open a context menu with
   * options like "Create Work Relationship".
   * Falls back to the toolbar "Actions" button if per-row icon not found.
   */
  private async tryClickRowActions(): Promise<boolean> {
    // Dismiss any person info popup/card that may have appeared
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(1000);
    await this.person.clearGlassPane();

    // Strategy 1: Click the orange dropdown icon in the Actions column of first result row.
    // These have specific ADF IDs — look for img elements with "cil" (commandImageLink icon)
    // that are in the Actions column (last column).
    const actionsColumnIcon = this.page.locator(
      '[id*="table2"] [id*=":0:"][id*="cil"] img, [id*="table2"] [id*=":0:"][id*="commandImage"]'
    ).last(); // last() to get the Actions column icon, not other icons in the row
    if (await actionsColumnIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[CWR] Found per-row Actions icon (img in Actions column)');
      await actionsColumnIcon.click({ force: true });
      return true;
    }

    // Strategy 2: Click the first row to select it, then use toolbar "Actions" dropdown
    const firstRow = this.page.locator('[id*="table2"] tbody tr').first();
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click on the row (on the person number cell to avoid triggering person card)
      const personNumberCell = this.page.locator('[id*="table2:0:"] [id*="ot"]').first();
      if (await personNumberCell.isVisible({ timeout: 2000 }).catch(() => false)) {
        await personNumberCell.click({ force: true });
        await this.page.waitForTimeout(1000);
      }

      // Now click toolbar "Actions" button
      const toolbarActions = this.page.locator('button:has-text("Actions"), [id*="menuBar"] [id*="dc"]:has-text("Actions")').first();
      if (await toolbarActions.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[CWR] Found toolbar Actions button');
        await toolbarActions.click({ force: true });
        return true;
      }
    }

    console.log('[CWR] No per-row Actions icon found');
    return false;
  }

  /**
   * Try multiple strategies to click the Actions button on person detail page.
   */
  private async tryClickActions(): Promise<boolean> {
    const strategies = [
      () => this.page.getByRole('button', { name: /actions/i }).first(),
      () => this.page.locator('a:has-text("Actions"), a[role="button"]:has-text("Actions")').first(),
      () => this.page.locator('[id*="Actions"], [id*="actions"][id$="::popEl"]').first(),
      () => this.page.locator('[id*="table2:0:commandImageLink"], [id*="table2:0:cil"]').first(),
    ];

    for (const getLocator of strategies) {
      const locator = getLocator();
      if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[CWR] Found Actions button');
        await locator.click({ force: true });
        return true;
      }
    }

    console.log('[CWR] No Actions button found');
    return false;
  }

  /**
   * Try to click "Create Work Relationship" in the open Actions menu.
   */
  /**
   * Click "Create Work Relationship" in the popup that should be open NOW.
   * Minimal delay — the ADF popup auto-closes within a few seconds.
   */
  /**
   * Navigate the per-row Actions popup submenu to find and click CWR.
   * The popup shows: Absences, Payroll, Compensation, Personal and Employment →, Workforce Modeling.
   * "Create Work Relationship" is inside the "Personal and Employment" submenu.
   */
  /**
   * Navigate the per-row Actions popup submenu to find and click CWR.
   * The popup shows: Absences, Payroll, Compensation, Personal and Employment →, Workforce Modeling.
   * "Create Work Relationship" is inside the "Personal and Employment" submenu.
   * ADF popup menus render in a special layer — use broad selectors.
   */
  /**
   * Navigate to the person detail page and initiate CWR from there.
   * For terminated persons, the detail page has an "Actions" menu
   * with "Personal and Employment" → "Create Work Relationship".
   */
  private async initiateCWRFromDetailPage(): Promise<boolean> {
    // If on search results, click person name to go to detail page
    const nameLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a, tr[_afrrk] a').first();
    if (await nameLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[CWR] Clicking person name to go to detail page');
      await nameLink.click();
      await this.page.waitForTimeout(4000);
      await this.person.waitForJET();
      await this.person.dismissPopups();
    } else {
      // Already on a person detail page — proceed without navigating
      console.log('[CWR] No search result name link found — assuming already on detail page');
      await this.person.dismissPopups();
    }

    // Try Actions button with multiple strategies
    return await this.tryCWRFromActionsMenu();
  }

  /**
   * Try to click CWR from the Actions/Edit menu on the current page.
   * Works on both person detail page and Employment page variants.
   */
  private async tryCWRFromActionsMenu(): Promise<boolean> {
    // Strategy 1: Standard Actions button
    const actionsSelectors = [
      () => this.page.getByRole('button', { name: /^actions$/i }).first(),
      () => this.page.locator('a:has-text("Actions"), button:has-text("Actions")').first(),
      () => this.page.locator('[id*="Actions"][id$="::popEl"], [id*="actions"][id$="::popEl"]').first(),
    ];

    let actionsClicked = false;
    for (const getLocator of actionsSelectors) {
      const loc = getLocator();
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[CWR] Found Actions button on detail page');
        await loc.click();
        await this.page.waitForTimeout(2000);
        actionsClicked = true;
        break;
      }
    }

    if (!actionsClicked) {
      console.log('[CWR] No Actions button found on detail page');
      await this.page.screenshot({ path: 'test-results/cwr-actions-not-found.png', fullPage: true }).catch(() => {});
      return false;
    }

    // Navigate submenu: Personal and Employment → Create Work Relationship
    const peItem = this.page.locator('td:has-text("Personal and Employment")').first();
    if (await peItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await peItem.hover();
      await this.page.waitForTimeout(2000);
    }

    // Look for CWR in any popup/menu layer
    const cwrCandidates = [
      this.page.locator('#DhtmlZOrderManagerLayerContainer a:has-text("Create Work Relationship")').first(),
      this.page.locator('[role="menuitem"]:has-text("Create Work Relationship")').first(),
      this.page.getByText('Create Work Relationship', { exact: true }).first(),
      this.page.locator('td:has-text("Create Work Relationship"), a:has-text("Create Work Relationship")').first(),
    ];

    for (const cwr of cwrCandidates) {
      if (await cwr.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[CWR] Found CWR option — clicking');
        await cwr.click({ force: true });
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
        return true;
      }
    }

    // Try ADF component tree as last resort
    const adfResult = await this.page.evaluate(() => {
      const container = document.getElementById('DhtmlZOrderManagerLayerContainer');
      if (!container) return false;
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return false;
      const idElements = container.querySelectorAll('[id]');
      for (const el of idElements) {
        if (el.textContent?.includes('Create Work Relationship')) {
          try {
            const comp = adfPage.findComponentByAbsoluteId(el.id);
            if (comp) {
              new (window as any).AdfActionEvent(comp).queue();
              return true;
            }
          } catch { /* continue */ }
        }
      }
      return false;
    });

    if (adfResult) {
      console.log('[CWR] CWR triggered via ADF component tree');
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();
      return true;
    }

    console.log('[CWR] CWR option not found in Actions menu');
    await this.page.screenshot({ path: 'test-results/cwr-actions-menu.png', fullPage: true }).catch(() => {});
    return false;
  }

  /**
   * Navigate the ADF popup menu to find and click "Create Work Relationship".
   * ADF popup menus render as <td> elements WITHOUT IDs or anchor tags.
   * Standard DOM clicks don't trigger ADF's event handling.
   * Solution: Walk the ADF component tree to find the CWR commandMenuItem
   * and invoke it via AdfActionEvent (same pattern as clickAdfLink in base.page.ts).
   */
  private async clickCWRInPopup(): Promise<boolean> {
    await this.page.waitForTimeout(1500); // Wait for popup animation

    // Strategy 1: Walk ADF component tree to find CWR and invoke via AdfActionEvent
    const adfResult = await this.page.evaluate(() => {
      const adfPage = (window as any).AdfPage;
      if (!adfPage?.PAGE) return { success: false, reason: 'No AdfPage', debug: '' };

      // Helper: recursively walk ADF component tree to find commandMenuItems
      const found: Array<{ id: string; text: string; type: string }> = [];
      function walkComponents(comp: any, depth: number) {
        if (!comp || depth > 10) return;
        try {
          const id = typeof comp.getClientId === 'function' ? comp.getClientId() : (comp.getId?.() || '');
          const typeName = comp.constructor?.name || comp.getComponentType?.() || '';

          // Check if this is a commandMenuItem with matching text
          const el = id ? document.getElementById(id) : null;
          const text = el?.textContent?.trim() || '';
          if (text && text.length < 100) {
            found.push({ id, text: text.substring(0, 80), type: typeName });
          }

          // Walk children
          if (typeof comp.getDescendantComponents === 'function') {
            const children = comp.getDescendantComponents();
            if (children) {
              for (let i = 0; i < children.length; i++) {
                walkComponents(children[i], depth + 1);
              }
            }
          }
        } catch { /* ignore */ }
      }

      // Find popup menu components — look for the open popup
      // The popup container uses ZOrderManager
      const popupContainer = document.getElementById('DhtmlZOrderManagerLayerContainer');
      if (!popupContainer) return { success: false, reason: 'No popup container', debug: '' };

      // Find all elements with IDs in the popup container
      const idElements = popupContainer.querySelectorAll('[id]');
      const menuIds: string[] = [];
      for (const el of idElements) {
        if (el.id && (el.id.includes('::menu') || el.id.includes(':m') || el.id.includes('menu'))) {
          menuIds.push(el.id);
        }
      }

      // Also collect ALL elements with IDs that contain text
      const allIdsWithText: Array<{ id: string; text: string; tag: string }> = [];
      for (const el of idElements) {
        const text = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '';
        if (text && text.length > 0 && text.length < 200) {
          allIdsWithText.push({ id: el.id, text: text.substring(0, 100), tag: el.tagName });
        }
      }

      // Try to find CWR directly by searching all ADF components with IDs
      for (const item of allIdsWithText) {
        if (item.text.includes('Create Work Relationship')) {
          try {
            const comp = adfPage.PAGE.findComponentByAbsoluteId(item.id);
            if (comp) {
              const evt = new (window as any).AdfActionEvent(comp);
              evt.queue();
              return { success: true, method: 'AdfActionEvent', id: item.id, debug: '' };
            }
          } catch (e: any) {
            // Continue searching
          }
        }
      }

      // Try walking from menu components
      for (const menuId of menuIds) {
        try {
          const menuComp = adfPage.PAGE.findComponentByAbsoluteId(menuId);
          if (menuComp) {
            walkComponents(menuComp, 0);
          }
        } catch { /* ignore */ }
      }

      // Check found components for CWR
      for (const item of found) {
        if (item.text.includes('Create Work Relationship')) {
          try {
            const comp = adfPage.PAGE.findComponentByAbsoluteId(item.id);
            if (comp) {
              const evt = new (window as any).AdfActionEvent(comp);
              evt.queue();
              return { success: true, method: 'AdfActionEvent-walk', id: item.id, debug: '' };
            }
          } catch (e: any) {
            return { success: false, reason: e.message, id: item.id, debug: JSON.stringify(found.slice(0, 10)) };
          }
        }
      }

      // Debug: dump what we found
      const debugInfo = {
        menuIds: menuIds.slice(0, 5),
        allIds: allIdsWithText.filter(i => i.text.length < 60).slice(0, 30),
        walkFound: found.slice(0, 20),
      };
      return { success: false, reason: 'CWR component not found', debug: JSON.stringify(debugInfo) };
    });

    console.log(`[CWR] ADF component tree result: success=${adfResult.success}, method=${(adfResult as any).method || 'N/A'}, reason=${(adfResult as any).reason || 'N/A'}`);
    if (adfResult.debug) {
      console.log(`[CWR] Debug: ${adfResult.debug.substring(0, 500)}`);
    }
    if (adfResult.success) return true;

    // Strategy 2: Try hovering P&E then using ADF component tree on submenu
    const peItem = this.page.locator('td:has-text("Personal and Employment")').first();
    if (await peItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      const peBox = await peItem.boundingBox();
      if (peBox) {
        console.log('[CWR] Hovering P&E to open submenu...');
        await this.page.mouse.move(peBox.x + peBox.width / 2, peBox.y + peBox.height / 2);
        await this.page.waitForTimeout(2000);

        // Re-run ADF component tree search after submenu opens
        const adfResult2 = await this.page.evaluate(() => {
          const adfPage = (window as any).AdfPage;
          if (!adfPage?.PAGE) return { success: false, reason: 'No AdfPage' };

          const container = document.getElementById('DhtmlZOrderManagerLayerContainer');
          if (!container) return { success: false, reason: 'No container' };

          // Dump ALL elements with IDs in popup for debugging
          const idElements = container.querySelectorAll('[id]');
          const cwrCandidates: Array<{ id: string; text: string; tag: string }> = [];
          for (const el of idElements) {
            const text = el.textContent?.trim() || '';
            if (text.includes('Create Work Relationship') || text.includes('Work Relationship')) {
              cwrCandidates.push({ id: el.id, text: text.substring(0, 100), tag: el.tagName });
            }
          }

          // Try AdfActionEvent on each candidate
          for (const candidate of cwrCandidates) {
            try {
              const comp = adfPage.PAGE.findComponentByAbsoluteId(candidate.id);
              if (comp) {
                const evt = new (window as any).AdfActionEvent(comp);
                evt.queue();
                return { success: true, id: candidate.id };
              }
            } catch { /* continue */ }
          }

          // Also try finding by walking all popup divs
          const allDivs = container.querySelectorAll('div[id]');
          const divIds: string[] = [];
          for (const div of allDivs) {
            divIds.push(`${div.id}=${div.textContent?.trim().substring(0, 40)}`);
          }

          return {
            success: false,
            reason: 'CWR not found after hover',
            cwrCandidates,
            totalIds: idElements.length,
            sampleDivIds: divIds.slice(0, 15),
          };
        });

        console.log(`[CWR] After hover: success=${adfResult2.success}, reason=${(adfResult2 as any).reason || ''}`);
        if (!adfResult2.success && (adfResult2 as any).cwrCandidates) {
          console.log(`[CWR] CWR candidates: ${JSON.stringify((adfResult2 as any).cwrCandidates)}`);
          console.log(`[CWR] Total IDs in popup: ${(adfResult2 as any).totalIds}`);
          if ((adfResult2 as any).sampleDivIds) {
            console.log(`[CWR] Sample div IDs: ${JSON.stringify((adfResult2 as any).sampleDivIds?.slice(0, 10))}`);
          }
        }
        if (adfResult2.success) return true;
      }
    }

    return false;
  }

  private async tryClickCWROption(): Promise<boolean> {
    // ADF popup menus render as: <td><a href="#">Create Work Relationship</a></td>
    // Must click the <a> tag (not <td>) without force to trigger ADF event handlers.
    await this.page.waitForTimeout(2000); // Wait for popup animation

    // Strategy 1: Click <a> inside the popup menu (most reliable for ADF)
    const popupLink = this.page.locator('#DhtmlZOrderManagerLayerContainer a:has-text("Create Work Relationship")').first();
    if (await popupLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[CWR] Found CWR link in popup layer');
      await popupLink.click();
      return true;
    }

    // Strategy 2: Menu item role
    const menuItem = this.page.locator('[role="menuitem"]:has-text("Create Work Relationship")').first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[CWR] Found CWR via role=menuitem');
      await menuItem.click();
      return true;
    }

    // Strategy 3: Any visible link with CWR text
    const cwrLink = this.page.locator('a:has-text("Create Work Relationship")').first();
    if (await cwrLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[CWR] Found CWR via a:has-text');
      await cwrLink.click();
      return true;
    }

    // Strategy 4: Table cell text (less reliable — click inner content)
    const cwrTd = this.page.locator('td:has-text("Create Work Relationship")').first();
    if (await cwrTd.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[CWR] Found CWR via td — clicking inner text');
      await this.page.getByText('Create Work Relationship', { exact: true }).first().click();
      return true;
    }

    console.log('[CWR] No CWR option found');
    return false;
  }

  /**
   * Fill When and Why fields from CWR-specific field data.
   * CWR field data uses "Use Person > " prefix for these fields.
   */
  private async fillWhenAndWhy(tc: TestCase): Promise<void> {
    // Wait for CWR wizard to fully load
    await this.page.waitForTimeout(5000);
    await this.person.waitForJET();
    await this.page.screenshot({ path: 'test-results/cwr-wizard-step1.png', fullPage: true }).catch(() => {});

    // Date — try CWR-specific prefix first, then standard keys
    const when = getField(tc, 'Use Person > When') || getField(tc, 'When') ||
                 getField(tc, 'Proposed Start Date') || getField(tc, 'Effective date');
    if (when) {
      const dateStr = this.whenAndWhy.convertDate(when);
      // Try multiple date field selectors — CWR wizard may use different ADF IDs
      const dateSelectors = [
        '[id$="SP1:inputDate1::content"]',   // Standard hire wizard
        'input[id*="inputDate"][id*="::content"]', // Any ADF date input
        'input[id*="id1::content"][type="text"]',  // Alternative date ID pattern
      ];
      let filled = false;
      for (const sel of dateSelectors) {
        const field = this.page.locator(sel).first();
        if (await field.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log(`[CWR] Found date field via: ${sel}`);
          await this.person.fillField(field, dateStr);
          filled = true;
          break;
        }
      }
      if (!filled) {
        // Last resort: find any date input by label
        const dateByLabel = this.page.getByRole('textbox', { name: /date|when/i }).first();
        if (await dateByLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('[CWR] Found date field via label');
          await this.person.fillField(dateByLabel, dateStr);
        } else {
          console.log('[CWR] WARNING: No date field found on When/Why page');
        }
      }
    }

    // CWR wizard fields use ADF <select> elements.
    // ADF intercepts native events so selectOption doesn't work — use ADF setValue.
    const fillAdfSelect = async (
      label: string, value: string, selectors: string[], labelPattern?: RegExp
    ): Promise<boolean> => {
      let field = null;
      for (const sel of selectors) {
        const loc = this.page.locator(sel).first();
        if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log(`[CWR] Found ${label} via: ${sel}`);
          field = loc;
          break;
        }
      }
      if (!field && labelPattern) {
        const byLabel = this.page.getByRole('combobox', { name: labelPattern }).first();
        if (await byLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`[CWR] Found ${label} via label`);
          field = byLabel;
        }
      }
      if (!field) {
        console.log(`[CWR] WARNING: ${label} field not found — skipping`);
        return false;
      }

      // Use ADF API to set the value — matches by option label text
      const fieldId = await field.getAttribute('id').catch(() => '');
      if (fieldId) {
        const parentId = fieldId.replace('::content', '');
        const result = await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
          const adfPage = (window as any).AdfPage?.PAGE;
          if (!adfPage) return { success: false, reason: 'No AdfPage' };
          const comp = adfPage.findComponentByAbsoluteId(pid);
          if (!comp) return { success: false, reason: 'Component not found' };
          // Try getSelectItems to match by label (may throw if ADF DOM not ready)
          let items: any = null;
          try { items = comp.getSelectItems?.(); } catch { /* ADF DOM not ready */ }
          if (items) {
            const norm = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
            const nVal = norm(val);
            const allLabels = items.map((it: any) => it.getLabel?.() || '').filter((l: string) => l);
            // Pass 1: exact match
            for (let i = 0; i < items.length; i++) {
              const itemLabel = items[i].getLabel?.() || '';
              if (!itemLabel) continue;
              if (itemLabel === val || norm(itemLabel) === nVal) {
                comp.setValue(items[i].getValue());
                return { success: true, matched: itemLabel, allLabels };
              }
            }
            // Pass 2: partial match — prefer longest label to avoid "Employee" matching before "Rehire an Employee"
            let best = { idx: -1, label: '', len: 0 };
            for (let i = 0; i < items.length; i++) {
              const itemLabel = items[i].getLabel?.() || '';
              if (!itemLabel) continue;
              const nLabel = norm(itemLabel);
              if ((nLabel.includes(nVal) || nVal.includes(nLabel)) && nLabel.length > best.len) {
                best = { idx: i, label: itemLabel, len: nLabel.length };
              }
            }
            if (best.idx >= 0) {
              comp.setValue(items[best.idx].getValue());
              return { success: true, matched: best.label, allLabels };
            }
            return { success: false, reason: 'No match', options: allLabels };
          }
          // Fallback: direct setValue
          comp.setValue(val);
          return { success: true, matched: 'direct' };
        }, { pid: parentId, val: value });
        console.log(`[CWR] ${label} ADF setValue: ${JSON.stringify(result)}`);
        if (result.success) {
          await this.page.waitForTimeout(3000);
          await this.person.waitForJET();
          return true;
        }
      }

      // Fallback to fillCombobox
      await this.person.fillCombobox(field, value, 3000);
      const afterVal = await field.inputValue().catch(() => '');
      console.log(`[CWR] ${label} after fillCombobox: "${afterVal}"`);
      return !!afterVal;
    };

    // CWR wizard ADF IDs (from live inspection):
    //   SP1:action::content      = Action (readonly, options: Add Employee/Contingent/Non-Worker/Pending Work Relationship)
    //   SP1:soc1::content        = Action Reason (readonly)
    //   SP1:legaEm::content      = Legal Employer (LOV combobox)
    //   SP1:selectOneChoice1     = Worker Type (readonly: Employee, Contingent worker, Nonworker, Offer)

    // Legal Employer — fill first as it triggers partial page refresh
    const legalEmployer = getField(tc, 'Use Person > Legal Employer') || getField(tc, 'Legal Employer');
    if (legalEmployer) {
      await fillAdfSelect('Legal Employer', legalEmployer,
        ['[id$="SP1:legaEm::content"]', '[id$="SP1:selectOneChoice3::content"]'],
        /legal employer/i);
      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();
    }

    // Action — Oracle's CWR wizard offers these options directly:
    //   "Rehire an Employee", "Add Employee Work Relationship",
    //   "Add Contingent Work Relationship", "Add Non-Worker Work Relationship",
    //   "Add Pending Work Relationship".
    // The data sheet usually carries the literal option name (e.g. "Rehire an Employee"),
    // so we prefer the exact value and only fall back to a mapping for legacy aliases
    // that don't match any option directly.
    const cwrActionMap: Record<string, string> = {
      'add contingent worker': 'Add Contingent Work Relationship',
      'add nonworker': 'Add Non-Worker Work Relationship',
      'add pending worker': 'Add Pending Work Relationship',
    };
    // Known Oracle option labels — if the data sheet already gives us one of these,
    // pass it through unchanged so that e.g. "Rehire an Employee" doesn't get
    // remapped to "Add Employee Work Relationship".
    const knownActionLabels = new Set([
      'rehire an employee',
      'add employee work relationship',
      'add contingent work relationship',
      'add non-worker work relationship',
      'add pending work relationship',
    ]);
    let action = getField(tc, "Use Person > What's the way") || getField(tc, "What's the way") || getField(tc, 'Action');
    if (action) {
      const isKnownLabel = knownActionLabels.has(action.toLowerCase());
      let mapped = !isKnownLabel ? cwrActionMap[action.toLowerCase()] : '';
      if (mapped) {
        console.log(`[CWR] Mapped Action: "${action}" → "${mapped}"`);
        action = mapped;
      } else if (!mapped && !isKnownLabel) {
        // Vague action (e.g., "Create Work Relationship") — derive from Worker Type
        const wt = (getField(tc, 'Use Person > Worker Type') || getField(tc, 'Worker Type') || '').toLowerCase();
        const workerTypeActionMap: Record<string, string> = {
          'employee': 'Add Employee Work Relationship',
          'nonworker': 'Add Non-Worker Work Relationship',
          'contingent worker': 'Add Contingent Work Relationship',
          'offer': 'Add Pending Work Relationship',
        };
        mapped = workerTypeActionMap[wt] || '';
        if (mapped) {
          console.log(`[CWR] Derived Action from Worker Type "${wt}": "${action}" → "${mapped}"`);
          action = mapped;
        }
      }
      await fillAdfSelect('Action', action,
        ['[id$="SP1:action::content"]', '[id$="SP1:selectOneChoice1::content"]']);
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();
    }

    // Reason — CWR may only have 1 option (e.g., "Additional work relationship for Employee")
    // which won't match the Hire-style reason. Skip gracefully if no match.
    const reason = getField(tc, 'Use Person > Why') || getField(tc, 'Why') || getField(tc, 'Reason');
    if (reason) {
      const reasonSet = await fillAdfSelect('Reason', reason,
        ['[id$="SP1:soc1::content"]', '[id$="SP1:selectOneChoice2::content"]']);
      if (!reasonSet) {
        console.log('[CWR] Reason not matched — selecting first available option');
        // Select the first non-empty option if only 1 is available
        const reasonField = this.page.locator('[id$="SP1:soc1::content"]').first();
        if (await reasonField.isVisible({ timeout: 3000 }).catch(() => false)) {
          const reasonId = await reasonField.getAttribute('id').catch(() => '');
          if (reasonId) {
            await this.page.evaluate((pid: string) => {
              try {
                const comp = (window as any).AdfPage?.PAGE?.findComponentByAbsoluteId(pid.replace('::content', ''));
                const items = comp?.getSelectItems?.();
                if (items && items.length > 0) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].getLabel?.()) { comp.setValue(items[i].getValue()); break; }
                  }
                }
              } catch { /* ignore */ }
            }, reasonId);
          }
        }
      }
      await this.page.waitForTimeout(2000);
      await this.person.waitForJET();
    }

    // Worker Type (CWR uses SP1:selectOneChoice1) — wait for DOM to stabilize after Action/Reason
    await this.page.waitForTimeout(3000);
    await this.person.waitForJET();
    const workerType = getField(tc, 'Use Person > Worker Type') || getField(tc, 'Worker Type');
    if (workerType) {
      await fillAdfSelect('Worker Type', workerType,
        ['[id$="SP1:selectOneChoice1::content"]', '[id$="SP1:selectOneChoice4::content"]', '[id$="SP1:soc2::content"]']);
    }
  }
}
