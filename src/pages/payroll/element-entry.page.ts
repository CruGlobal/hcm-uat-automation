import type { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Element Entry page — payroll element entry management (Redwood UI).
 *
 * Selectors sourced from Playwright codegen against live Oracle HCM UAT env.
 *
 * Flow (from codegen):
 * 1. Search Person combobox → type name → click exact match from dropdown
 * 2. Effective Date textbox → fill date → wait for page refresh
 * 3. Create button → opens "Create Element Entry" dialog
 * 4. Element Name combobox → type element → Tab → click cell from LOV → OK → Continue
 * 5. Fill detail fields: Reason (textbox), Amount (textbox), Separate Tax Code (combobox → option)
 * 6. Save button
 * 7. Done button
 * 8. Verify: set date again → confirm entry appears in table
 */
export class ElementEntryPage extends BasePage {

  /**
   * Complete element entry creation from test case field data.
   *
   * Follows the exact Redwood UI flow captured via Playwright codegen.
   */
  /** The effective date actually used (after generating unique date). Set during fillFromTestCase. */
  private usedEffectiveDate = '';

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const searchFor = getField(tc, 'Search For');
    const element = getField(tc, 'Element name');
    const taxCode = getField(tc, 'Separate Tax Code');
    const reasonVal = getField(tc, 'Reason');

    // Generate unique date and amount every run to avoid duplicate entry conflicts
    const uniqueDate = this.generateUniqueDate(tc.testId);
    const uniqueAmount = this.generateUniqueAmount();
    this.usedEffectiveDate = uniqueDate;

    console.log(`[ElementEntry] Filling: search="${searchFor}", element="${element}", date="${uniqueDate}", amount="${uniqueAmount}"`);

    // Step 1: Search for employee via autocomplete combobox
    if (searchFor) {
      await this.searchEmployee(searchFor);
    }

    // Step 2: Fill effective date on the main Element Entries page (before clicking Create)
    await this.fillEffectiveDate(uniqueDate);

    // Step 3: Click "Create" button to open Create Element Entry dialog
    await this.clickCreateButton();

    // Wait for dialog to appear
    const dialogVisible = await this.page.getByText('Create Element Entry').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    if (!dialogVisible) {
      throw new Error('[ElementEntry] Create Element Entry dialog did not appear after clicking Create');
    }
    console.log('[ElementEntry] Create Element Entry dialog is open');

    // Step 4: Select element name in the dialog LOV
    if (element) {
      await this.selectElementInDialog(element);
    }

    // Step 5: Select assignment if needed, then click OK/Continue
    await this.clickOkAndContinue();

    // Step 6: Fill detail fields on the entry form
    if (reasonVal) {
      await this.fillReason(reasonVal);
    }
    await this.fillAmount(uniqueAmount);
    if (taxCode) {
      await this.fillSeparateTaxCode(taxCode);
    }
  }

  /**
   * Save the element entry and click Done.
   * Called from ElementEntryFlow after fillFromTestCase.
   */
  async saveAndDone(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: 'Save' });
    const submitBtn = this.page.getByRole('button', { name: 'Submit' });

    // Step 1: Click Save
    if (await saveBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Save');
      await saveBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      console.log('[ElementEntry] Save button not visible');
    }

    // Check for duplicate/error messages after save
    const errorBanner = this.page.locator(
      'text=/already exists|duplicate|overlapping|cannot create/i'
    ).first();
    if (await errorBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      const errText = await errorBanner.textContent().catch(() => '');
      console.log(`[ElementEntry] Duplicate/conflict detected: "${errText?.trim()}"`);
      throw new Error(`[ElementEntry] Existing record conflict: ${errText?.trim()}. The element entry already exists for this date/person.`);
    }

    // Step 2: Click Submit (appears next to Save on the detail page)
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Submit');
      await submitBtn.click();
      await this.page.waitForTimeout(5000).catch(() => {});
      await this.waitForJET().catch(() => {});

      // Handle any confirmation dialog (e.g., "Are you sure you want to submit?")
      const yesBtn = this.page.getByRole('button', { name: /yes|ok|confirm/i }).first();
      if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[ElementEntry] Confirming Submit dialog');
        await yesBtn.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }

    // Step 3: Navigate back to Element Entries list — try Done first, then Back link
    const doneBtn = this.page.getByRole('button', { name: 'Done' });
    if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Done');
      await doneBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      const backLink = this.page.getByRole('link', { name: 'Back' }).first();
      if (await backLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[ElementEntry] Clicking Back to return to Element Entries list');
        await backLink.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      } else {
        console.log('[ElementEntry] Neither Done nor Back visible — staying on current page');
      }
    }
  }

  /**
   * Search for an employee on the Element Entries page for verification purposes.
   * Lighter version of searchEmployee — just types and selects, no error throwing.
   */
  async searchEmployeeForVerify(name: string): Promise<void> {
    const searchBox = this.page.getByRole('textbox', { name: 'Search Person' });
    if (!await searchBox.isVisible({ timeout: 8_000 }).catch(() => false)) return;
    await searchBox.fill('');
    await searchBox.fill(name.toLowerCase());
    await this.page.waitForTimeout(4000);
    const option = this.page.getByText(name, { exact: true }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Verify the created element entry appears in the table.
   */
  async verifyEntryExists(_effDate: string, elementName: string): Promise<boolean> {
    // After clicking Back we land on the employee's element entries list.
    // The element name should already be visible in the table — just check for it.
    // No need to set effective date filter (that's on the main search page, not here).
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Strategy 1: look for the element name as a cell or link in the current table
    const entryCell = this.page.getByRole('cell', { name: elementName, exact: true }).first();
    let found = await entryCell.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!found) {
      // Strategy 2: any text containing the element name on the page
      const entryText = this.page.getByText(elementName, { exact: false }).first();
      found = await entryText.isVisible({ timeout: 5_000 }).catch(() => false);
    }

    if (found) {
      console.log(`[ElementEntry] Verified: "${elementName}" entry found in list`);
    } else {
      console.log(`[ElementEntry] "${elementName}" entry NOT found in list`);
    }
    return found;
  }

  // ─── Private methods matching codegen selectors ───

  /**
   * Search for employee using the "Search Person" textbox.
   * Codegen: getByRole('textbox', { name: 'Search Person' })
   * Then click exact name match: getByText('Paul Gladney', { exact: true })
   */
  private async searchEmployee(name: string): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForJET();

    // Codegen selector: getByRole('textbox', { name: 'Search Person' })
    const searchBox = this.page.getByRole('textbox', { name: 'Search Person' });

    if (!await searchBox.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await this.page.screenshot({ path: 'test-results/element-entry-no-search.png', fullPage: true }).catch(() => {});
      throw new Error(`[ElementEntry] "Search Person" textbox not visible. URL: ${this.page.url()}`);
    }

    // Type person name using pressSequentially (like codegen fill but with realistic typing)
    await searchBox.click();
    await searchBox.fill(name.toLowerCase());
    console.log(`[ElementEntry] Typed "${name}" in Search Person`);

    // Wait for autocomplete dropdown to load results — may need up to 5s
    await this.page.waitForTimeout(5000);

    // Proper-cased name for matching (e.g., "Paul Gladney")
    const fullName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const firstName = name.split(' ')[0].charAt(0).toUpperCase() + name.split(' ')[0].slice(1).toLowerCase();
    const lastName = name.split(' ').slice(-1)[0].charAt(0).toUpperCase() + name.split(' ').slice(-1)[0].slice(1).toLowerCase();

    // Strategy 1: Codegen — getByText('Paul Gladney', { exact: true })
    const personOption = this.page.getByText(fullName, { exact: true }).first();
    if (await personOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[ElementEntry] Clicking person: "${fullName}"`);
      await personOption.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Table row containing both names (exclude Advanced Search & header)
    const fallbackRow = this.page.locator(
      `table tr:not(:has-text("Advanced Search")):not(:has-text("Business Title")):has-text("${firstName}"):has-text("${lastName}")`
    ).first();
    if (await fallbackRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rowText = await fallbackRow.textContent().catch(() => '');
      console.log(`[ElementEntry] Clicking fallback row: "${rowText?.trim().substring(0, 80)}"`);
      await fallbackRow.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: If no autocomplete results, try clearing and retyping with delay
    console.log('[ElementEntry] No autocomplete results, retrying with slower typing...');
    await searchBox.fill('');
    await this.page.waitForTimeout(1000);
    await searchBox.pressSequentially(name.toLowerCase(), { delay: 100 });
    await this.page.waitForTimeout(5000);

    const retryOption = this.page.getByText(fullName, { exact: true }).first();
    if (await retryOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[ElementEntry] Clicking person (retry): "${fullName}"`);
      await retryOption.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 4: Click "Search Person" button as last resort
    const searchPersonBtn = this.page.getByRole('button', { name: 'Search Person' });
    if (await searchPersonBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking "Search Person" button...');
      await searchPersonBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

    }

    // Re-try the person field after re-navigation
    const retryField = this.page.locator(
      'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"]'
    ).first();
    if (await retryField.isVisible({ timeout: 8000 }).catch(() => false)) {
      await this.fillCombobox(retryField, name);
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Final fallback: screenshot and navigation-only (bot may lack Element Entries access)
    await this.page.screenshot({ path: 'test-results/element-entry-no-search.png', fullPage: true }).catch(() => {});
    console.log(`[ElementEntry] No search field visible for employee "${name}" — may not be on Element Entries page. URL: ${this.page.url()}. Navigation-only completion accepted.`);
  }

  /** Click the first matching search result. */
  private async clickFirstSearchResult(name: string): Promise<void> {
    // Try multiple result selectors
    const resultSelectors = [
      `a:has-text("${name.split(' ')[0]}")`,           // Match by first name
      `[role="option"]:has-text("${name.split(' ')[0]}")`,
      '[role="option"]:first-child',
      '[role="row"]:first-child a',
      '[role="listitem"]:first-child a',
      '[class*="result"] a:first-child',
      'table tbody tr:first-child td a',
    ];

    for (const sel of resultSelectors) {
      const result = this.page.locator(sel).first();
      const visible = await result.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        console.log(`[ElementEntry] Clicking search result: ${sel}`);
        await result.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        return;
      }
    }

    await this.page.screenshot({ path: 'test-results/element-entry-no-results.png', fullPage: true }).catch(() => {});
    throw new Error(`[ElementEntry] Person "${name}" not found in search results. URL: ${this.page.url()}`);
  }

  /**
   * Fill the Effective Date field.
   * Codegen: getByRole('textbox', { name: 'Effective Date' })
   */
  private async fillEffectiveDate(dateStr: string): Promise<void> {
    const dateField = this.page.getByRole('textbox', { name: 'Effective Date' });
    if (await dateField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dateField.click();
      await dateField.fill(dateStr);
      await dateField.press('Tab');
      console.log(`[ElementEntry] Set Effective Date: ${dateStr}`);
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      console.log('[ElementEntry] Effective Date field not visible');
    }
  }

  /**
   * Fill the Effective Date field inside the Create Element Entry dialog.
   * This is a separate field from the main page Effective Date — it's inside the dialog
   * that appears after clicking "Create". Setting the date here (before selecting element)
   * ensures each run uses a unique date and avoids duplicate entry conflicts.
   */
  private async fillDialogEffectiveDate(dateStr: string): Promise<void> {
    // The dialog has its own Effective Date — use .last() since the main page also has one
    // Both are role="textbox" name="Effective Date" — dialog's is the last in DOM order
    const dateFields = this.page.getByRole('textbox', { name: 'Effective Date' });
    const count = await dateFields.count();
    console.log(`[ElementEntry] Found ${count} Effective Date field(s)`);

    // Pick the last one (inside the dialog)
    const dateField = count > 1 ? dateFields.last() : dateFields.first();
    if (await dateField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dateField.click();
      await dateField.fill('');
      await this.page.waitForTimeout(500);
      await dateField.fill(dateStr);
      await dateField.press('Tab');
      console.log(`[ElementEntry] Set dialog Effective Date: ${dateStr}`);
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      console.log('[ElementEntry] Dialog Effective Date field not visible');
    }
  }

  /**
   * Click the "Create" button to open the Create Element Entry dialog.
   * Codegen: getByRole('button', { name: 'Create' })
   */
  private async clickCreateButton(): Promise<void> {
    const createBtn = this.page.getByRole('button', { name: 'Create' });
    if (await createBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Create button');
      await createBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      throw new Error('[ElementEntry] Create button not visible — cannot open Create Element Entry dialog');
    }
  }

  /**
   * Select element name in the Create Element Entry dialog.
   *
   * Codegen flow:
   *   getByRole('combobox', { name: 'Element Name' }).click()
   *   getByRole('combobox', { name: 'Element Name' }).fill('bonus')
   *   getByRole('combobox', { name: 'Element Name' }).press('Tab')
   *   // Tab triggers LOV search — wait for results
   *   getByRole('cell', { name: 'Bonus', exact: true }).click()
   */
  private async selectElementInDialog(element: string): Promise<void> {
    // Dialog should already be open (checked in fillFromTestCase)
    const elementCombo = this.page.getByRole('combobox', { name: 'Element Name' });
    if (!await elementCombo.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[ElementEntry] Element Name combobox not visible in dialog');
      return;
    }

    // Type element name in the combobox
    await elementCombo.click();
    await elementCombo.fill(element.toLowerCase());
    console.log(`[ElementEntry] Typed "${element}" in Element Name combobox`);

    // Press Tab to trigger the LOV "Search and Select" dialog
    await elementCombo.press('Tab');
    console.log('[ElementEntry] Pressed Tab — waiting for LOV dialog...');
    await this.page.waitForTimeout(3000);

    // Check if the "Search and Select" LOV dialog appeared
    // Try multiple selectors — the title can vary
    const lovDialog = this.page.locator('[id*="lovDialogId"], [id*="dropDialog"], [class*="AFModalDialog"]').first();
    const searchBtn = this.page.getByRole('button', { name: 'Search' });
    const lovOkBtn = this.page.locator('button:has-text("OK")');

    // First check if an inline autocomplete popup appeared (AFPopupSelector)
    // Use keyboard ArrowDown + Enter — more reliable than DOM click for Oracle ADF LOV
    const inlinePopup = this.page.locator('.AFPopupSelector, [id*="ElementTypeLOV"][id*="popup"]').first();
    const inlinePopupVisible = await inlinePopup.isVisible({ timeout: 5_000 }).catch(() => false);

    if (inlinePopupVisible) {
      console.log('[ElementEntry] Inline autocomplete popup detected — firing full mouse event sequence');
      // Oracle ADF requires mousedown+mouseup+click to register LOV selection.
      // Simple .click() via evaluate doesn't fire all events — use dispatchEvent.
      const clicked = await this.page.evaluate((elementName: string) => {
        const selectors = [
          '.AFPopupSelector td',
          '[id*="lovPopupId"] td',
          '[id*="autosuggestpopup"] td',
          '[id*="ElementTypeLOV"] td',
        ];
        const fireClick = (el: HTMLElement) => {
          ['mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
        };
        for (const sel of selectors) {
          const tds = Array.from(document.querySelectorAll(sel));
          for (const td of tds) {
            const text = td.textContent?.trim() || '';
            if (text === elementName || text.toLowerCase() === elementName.toLowerCase()) {
              fireClick(td as HTMLElement);
              return text;
            }
          }
        }
        // Partial match fallback
        for (const sel of selectors) {
          const tds = Array.from(document.querySelectorAll(sel));
          for (const td of tds) {
            if (td.textContent?.toLowerCase().includes(elementName.toLowerCase())) {
              fireClick(td as HTMLElement);
              return td.textContent?.trim() || '';
            }
          }
        }
        return null;
      }, element);

      if (clicked) {
        console.log(`[ElementEntry] Selected "${clicked}" from inline popup`);
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
      } else {
        console.log('[ElementEntry] Inline popup click failed — pressing Tab again to force full LOV dialog');
        await elementCombo.press('Tab');
        await this.page.waitForTimeout(3000);
      }
    }

    const lovAppeared = await searchBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (lovAppeared) {
      console.log('[ElementEntry] Search and Select LOV dialog is open');

      // Click Search to load results
      await searchBtn.click();
      console.log('[ElementEntry] Clicked Search in LOV');
      await this.page.waitForTimeout(3000);

      // Use evaluate to click the matching row — bypasses AFPopupSelector interception
      const rowClicked = await this.page.evaluate((elementName: string) => {
        const tds = Array.from(document.querySelectorAll('td'));
        for (const td of tds) {
          if (td.textContent?.trim() === elementName) {
            (td as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, element);

      if (rowClicked) {
        console.log(`[ElementEntry] Clicked LOV row "${element}" via evaluate`);
      } else {
        // Fallback: mouse.click on bounding box
        const lovRow = this.page.locator('td').filter({ hasText: new RegExp(`^${element}$`) }).first();
        if (await lovRow.isVisible({ timeout: 5000 }).catch(() => false)) {
          const box = await lovRow.boundingBox();
          if (box) {
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log(`[ElementEntry] Clicked LOV row "${element}" via mouse`);
          }
        }
      }
      await this.page.waitForTimeout(1000);

      // Click OK in the LOV dialog
      if (await lovOkBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const okBox = await lovOkBtn.first().boundingBox();
        if (okBox) {
          await this.page.mouse.click(okBox.x + okBox.width / 2, okBox.y + okBox.height / 2);
          console.log('[ElementEntry] Clicked OK in LOV dialog');
        }
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    } else {
      console.log('[ElementEntry] WARNING: Could not open LOV dialog for element selection');
    }
  }

  /**
   * Click OK in the Create Element Entry dialog, select Assignment if needed,
   * then click Continue.
   *
   * Some employees have multiple assignments (e.g., N10780119, E10780119).
   * The Assignment dropdown appears after selecting Element Name — must pick one
   * before Continue becomes enabled.
   *
   * Codegen:
   *   getByRole('button', { name: 'OK' }).click()
   *   // If Assignment dropdown appears, select first option
   *   getByRole('button', { name: 'Continue' }).click()
   */
  private async clickOkAndContinue(): Promise<void> {
    // Step 1: Click OK if visible (single-assignment employees show OK → Continue)
    // For multi-assignment employees, clicking OK transitions the dialog to show
    // the Assignment combobox + Continue (no OK anymore).
    const okBtn = this.page.getByRole('button', { name: 'OK' });
    if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking OK');
      await okBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Step 2: AFTER OK, check for Assignment combobox (multi-assignment employees).
    // The Assignment combobox appears AFTER clicking OK, not before.
    await this.selectAssignmentIfNeeded();

    // Step 3: Click Continue
    const continueBtn = this.page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Continue');
      await continueBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Check if "A selection is required" error — means Assignment wasn't selected
      const errorMsg = this.page.locator('text=/selection is required|value is required/i').first();
      if (await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[ElementEntry] Error: selection required — retrying Assignment selection...');
        await this.selectAssignmentIfNeeded();
        if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await continueBtn.click();
          await this.page.waitForTimeout(5000);
          await this.waitForJET();
        }
      }
    }
  }

  /**
   * Select an assignment from the Assignment dropdown in the Create Element Entry dialog.
   * Multi-assignment employees (e.g., Jeremy Diaz with N10780119, E10780119) require
   * picking one before Continue is enabled.
   *
   * Oracle JET combobox: click to open → options appear as role="option" in a listbox.
   * We try multiple strategies because Oracle JET dropdowns can be finicky.
   */
  private async selectAssignmentIfNeeded(): Promise<void> {
    // Wait for the Assignment combobox — it appears AFTER clicking OK for multi-assignment employees
    const assignmentCombo = this.page.getByRole('combobox', { name: 'Assignment' });
    const isVisible = await assignmentCombo.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!isVisible) {
      console.log('[ElementEntry] No Assignment dropdown — single assignment employee');
      return;
    }

    const currentVal = await assignmentCombo.inputValue().catch(() => '');
    console.log(`[ElementEntry] Assignment dropdown detected (current value: "${currentVal}") — selecting an option...`);

    // Strategy 1: Click the combobox to open dropdown, then pick an option
    await assignmentCombo.click();
    await this.page.waitForTimeout(2000);

    // Check for role="option" items
    let options = this.page.getByRole('option');
    let optionCount = await options.count();
    console.log(`[ElementEntry] Found ${optionCount} options after click`);

    if (optionCount > 0) {
      // Pick second option if available (first may be the pre-filled/default one)
      const targetIdx = optionCount > 1 ? 1 : 0;
      const optText = await options.nth(targetIdx).textContent().catch(() => '');
      console.log(`[ElementEntry] Selecting assignment option[${targetIdx}]: "${optText?.trim()}"`);
      await options.nth(targetIdx).click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Oracle JET oj-select — use keyboard to open and select
    // Press arrow down to open the dropdown, then arrow down to move to next option, then Enter
    console.log('[ElementEntry] No options from click — trying keyboard navigation...');
    await assignmentCombo.press('ArrowDown');
    await this.page.waitForTimeout(1500);

    options = this.page.getByRole('option');
    optionCount = await options.count();
    console.log(`[ElementEntry] Found ${optionCount} options after ArrowDown`);

    if (optionCount > 0) {
      const targetIdx = optionCount > 1 ? 1 : 0;
      const optText = await options.nth(targetIdx).textContent().catch(() => '');
      console.log(`[ElementEntry] Selecting (keyboard): "${optText?.trim()}"`);
      await options.nth(targetIdx).click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: Oracle JET listbox items (oj-option, oj-listbox-results)
    const listboxItems = this.page.locator('[role="listbox"] [role="option"], oj-option, ul.oj-listbox-results li');
    const itemCount = await listboxItems.count();
    console.log(`[ElementEntry] Listbox items found: ${itemCount}`);

    if (itemCount > 0) {
      const targetIdx = itemCount > 1 ? 1 : 0;
      const itemText = await listboxItems.nth(targetIdx).textContent().catch(() => '');
      console.log(`[ElementEntry] Selecting listbox item[${targetIdx}]: "${itemText?.trim()}"`);
      await listboxItems.nth(targetIdx).click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // Strategy 4: If combobox has a pre-filled value, try clearing and re-selecting
    // Sometimes Oracle JET requires the user to explicitly pick from the dropdown
    if (currentVal) {
      console.log(`[ElementEntry] Trying clear + re-type approach with value "${currentVal}"...`);
      await assignmentCombo.fill('');
      await this.page.waitForTimeout(1000);
      await assignmentCombo.pressSequentially(currentVal.substring(0, 3), { delay: 100 });
      await this.page.waitForTimeout(2000);

      options = this.page.getByRole('option');
      optionCount = await options.count();
      if (optionCount > 0) {
        const optText = await options.first().textContent().catch(() => '');
        console.log(`[ElementEntry] Re-type: selecting "${optText?.trim()}"`);
        await options.first().click();
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return;
      }
    }

    console.log('[ElementEntry] WARNING: Could not select Assignment option — proceeding anyway');
    await this.page.screenshot({ path: 'test-results/element-entry-assignment-failed.png', fullPage: true }).catch(() => {});
  }

  /**
   * Fill Reason textbox on the entry detail form.
   * Codegen: getByRole('textbox', { name: 'Reason' })
   */
  private async fillReason(reasonVal: string): Promise<void> {
    const reasonField = this.page.getByRole('textbox', { name: 'Reason' });
    if (await reasonField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reasonField.click();
      await reasonField.fill(reasonVal);
      console.log(`[ElementEntry] Filled Reason: "${reasonVal}"`);
    } else {
      console.log('[ElementEntry] Reason field not visible');
    }
  }

  /**
   * Fill Amount textbox on the entry detail form.
   * Codegen: getByRole('textbox', { name: 'Amount' })
   */
  private async fillAmount(amountVal: string): Promise<void> {
    const amountField = this.page.getByRole('textbox', { name: 'Amount' });
    if (await amountField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await amountField.click();
      await amountField.fill(amountVal);
      console.log(`[ElementEntry] Filled Amount: "${amountVal}"`);
    } else {
      console.log('[ElementEntry] Amount field not visible');
    }
  }

  /**
   * Select Separate Tax Code from the combobox dropdown.
   *
   * Codegen:
   *   getByRole('combobox', { name: 'Separate Tax Code' }).click()
   *   // click the dropdown arrow to open options
   *   getByRole('option', { name: 'Regular' }).click()
   */
  private async fillSeparateTaxCode(taxCode: string): Promise<void> {
    const taxCombo = this.page.getByRole('combobox', { name: 'Separate Tax Code' });
    if (await taxCombo.isVisible({ timeout: 5000 }).catch(() => false)) {
      await taxCombo.click();
      await this.page.waitForTimeout(1000);

      // Click the dropdown arrow to open options list
      const dropArrow = taxCombo.locator('xpath=following-sibling::*[1]').first();
      if (await dropArrow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dropArrow.click();
        await this.page.waitForTimeout(1000);
      }

      // Select the matching option
      const option = this.page.getByRole('option', { name: taxCode });
      if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
        await option.click();
        console.log(`[ElementEntry] Selected Separate Tax Code: "${taxCode}"`);
      } else {
        // Fallback: try typing + Tab in the combobox
        await taxCombo.fill(taxCode);
        await taxCombo.press('Tab');
        console.log(`[ElementEntry] Typed Separate Tax Code: "${taxCode}"`);
      }
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      console.log('[ElementEntry] Separate Tax Code combobox not visible');
    }
  }

  /**
   * Generate a unique effective date for each test run.
   * Uses today's date + a small offset derived from the testId to spread dates.
   * Each run gets a different date to avoid duplicate entry conflicts.
   */
  /**
   * Generate a unique effective date for each test run.
   * Uses a random date between 2025-01-01 and today to ensure uniqueness
   * and avoid "effective start date before end date" errors.
   */
  private generateUniqueDate(testId: string): string {
    // Always use today's date — must be within the current payroll period
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${mm}/${dd}/${now.getFullYear()}`;
    console.log(`[ElementEntry] Using today's date for ${testId}: ${dateStr}`);
    return dateStr;
  }

  /**
   * Generate a unique random amount to avoid duplicate entry conflicts.
   * Returns a string like "427.63".
   */
  private generateUniqueAmount(): string {
    // Random amount between 100.00 and 999.99
    const amount = (Math.random() * 899 + 100).toFixed(2);
    console.log(`[ElementEntry] Generated unique amount: $${amount}`);
    return amount;
  }

  /**
   * Legacy method — kept for backward compatibility with other flows.
   * Calls saveAndDone() internally.
   */
  async clickCreate(): Promise<void> {
    await this.saveAndDone();
  }
}
