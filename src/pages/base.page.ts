import { type Page, type Locator, expect } from '@playwright/test';
import { waitForOracleJET, waitForPageReady, dismissPopups } from '../utils/oracle-hcm-helpers';

/**
 * Base page object for all Oracle HCM pages.
 * Provides common waits, popup dismissal, ADF interaction helpers, and navigation.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Wait for Oracle JET to finish processing. */
  async waitForJET(timeout?: number): Promise<void> {
    await waitForOracleJET(this.page, timeout);
  }

  /** Wait for full page readiness (network idle + JET). */
  async waitForReady(): Promise<void> {
    await waitForPageReady(this.page);
  }

  /** Dismiss any notification popups or walkme guides. */
  async dismissPopups(): Promise<void> {
    await dismissPopups(this.page);
  }

  /** Navigate to a URL path relative to base URL. */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForReady();
    await this.dismissPopups();
  }

  /** Fill an input field, Tab to trigger validation, and wait for JET. */
  async fillField(locator: Locator | string, value: string): Promise<void> {
    const field = typeof locator === 'string' ? this.page.locator(locator) : locator;
    try {
      await field.clear({ timeout: 5000 });
    } catch {
      // ADF date fields can hang on clear() — fall back to select-all + delete
      await field.click();
      await field.press('Control+a');
      await field.press('Delete');
    }
    await field.fill(value);
    await field.press('Tab');
    await this.waitForJET();
  }

  /**
   * Fill an Oracle ADF combobox (LOV autocomplete).
   * Handles both editable and readonly ADF selectOneChoice components:
   *   - Readonly: uses ADF JS API (AdfPage.PAGE) to set the value
   *   - Editable: types the value then presses Tab to trigger autocomplete
   * Skips filling if the current value already matches.
   */
  async fillCombobox(locator: Locator | string, value: string, waitAfter = 3000): Promise<void> {
    const field = typeof locator === 'string' ? this.page.locator(locator) : locator;

    // Fail fast if field isn't visible — page may not have loaded correctly
    const visible = await field.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!visible) {
      console.log(`[fillCombobox] Field not visible for value "${value}" — page may not have loaded correctly`);
      return; // Don't throw — let the test continue and fail on validation
    }

    // Skip if the current value already matches
    const currentValue = await field.inputValue().catch(() => '');
    if (currentValue === value) return;

    // Detect field type: readonly <input>, <select>, or editable <input>
    const isReadonly = await field.getAttribute('readonly') !== null;
    const tagName = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
    const isDropdown = isReadonly || tagName === 'select';

    if (isDropdown) {
      if (tagName === 'select') {
        // Native <select> — use Playwright selectOption with fuzzy label matching
        const options = await field.evaluate((el) =>
          Array.from((el as HTMLSelectElement).options).map(o => ({ label: o.text.trim(), value: o.value }))
        );
        const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
        const nVal = normalize(value);
        const match = options.find(o => o.label === value)
          || options.find(o => normalize(o.label) === nVal)
          || options.find(o => normalize(o.label).includes(nVal) || nVal.includes(normalize(o.label)));
        if (match) await field.selectOption(match.value);
      } else {
        // ADF readonly <input> — use ADF API to set value
        const elementId = await field.getAttribute('id') || '';
        const componentId = elementId.replace(/::content$/, '');
        const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
        await this.page.evaluate(({ id, val, nVal }) => {
          const adfPage = (window as any).AdfPage?.PAGE;
          if (!adfPage) return;
          const comp = adfPage.findComponentByAbsoluteId(id);
          if (!comp) return;
          const items = comp.getSelectItems?.();
          if (items) {
            for (let i = 0; i < items.length; i++) {
              if (items[i].getLabel?.() === val || items[i].getValue?.() === val) {
                comp.setValue(items[i].getValue());
                return;
              }
            }
            for (let i = 0; i < items.length; i++) {
              const nl = (items[i].getLabel?.() || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
              if (nl === nVal || nl.includes(nVal) || nVal.includes(nl)) {
                comp.setValue(items[i].getValue());
                return;
              }
            }
          }
          comp.setValue(val);
        }, { id: componentId, val: value, nVal: normalize(value) });
      }
      await this.page.waitForTimeout(waitAfter);
      await this.waitForJET();
    } else {
      // Editable combobox — type + Tab
      await field.click();
      await field.fill(value);
      await this.page.waitForTimeout(1500);
      await field.press('Tab');
      await this.page.waitForTimeout(waitAfter);
      // Handle any LOV dialog that appeared after Tab
      await this.handleLovDialog();
    }
  }

  /**
   * Click an Oracle ADF command link/button via AdfActionEvent.
   * Standard clicks don't work because Oracle ADF uses onclick="return false".
   * This queues an AdfActionEvent on the ADF component to trigger server-side action.
   */
  async clickAdfLink(componentId: string): Promise<void> {
    // Wait for AdfPage.PAGE to be defined (may be slow on initial page load)
    await this.page.waitForFunction(() => !!(window as any).AdfPage?.PAGE, { timeout: 15000 })
      .catch(() => {}); // proceed even if timeout — evaluate below will surface the error
    await this.page.evaluate((id: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) throw new Error('AdfPage.PAGE not available');
      const comp = adfPage.findComponentByAbsoluteId(id);
      if (!comp) throw new Error(`ADF component not found: ${id}`);
      const evt = new (window as any).AdfActionEvent(comp);
      evt.queue();
    }, componentId);
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Click an ADF wizard button (Next, Back, Submit, Cancel, Save) by its visible text.
   * Walks up parent elements from the <a role="button"> to find the ADF component.
   */
  async clickAdfButton(buttonText: string): Promise<void> {
    const componentId = await this.page.evaluate((text: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return null;
      const links = document.querySelectorAll('a[role="button"]');
      for (const a of Array.from(links)) {
        if ((a as any).textContent?.trim() === text && (a as any).offsetWidth > 0) {
          let el: any = a;
          for (let i = 0; i < 5; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.id) {
              const comp = adfPage.findComponentByAbsoluteId(el.id);
              if (comp) return el.id;
            }
          }
        }
      }
      return null;
    }, buttonText);

    if (!componentId) throw new Error(`ADF button "${buttonText}" not found`);
    await this.clickAdfLink(componentId);
  }

  /**
   * Fill an Oracle ADF LOV (inputComboboxListOfValues) field.
   * These fields open a "Search and Select" dialog when the value needs
   * disambiguation. This method handles the dialog automatically:
   *   1. Types the value and tabs
   *   2. If a "Search and Select" dialog appears, selects the best matching row and clicks OK
   *   3. Waits for the field and page to settle
   */
  async fillLovField(locator: Locator | string, value: string, matchText?: string): Promise<void> {
    const field = typeof locator === 'string' ? this.page.locator(locator) : locator;

    // Ensure clean state — dismiss any leftover popups
    await this.clearGlassPane();

    // Skip if already has the correct value
    const currentValue = await field.inputValue().catch(() => '');
    if (currentValue === value) return;

    // Use pressSequentially to type character by character — this dispatches
    // real keyboard events (keydown/keypress/keyup) that trigger ADF's
    // LOV autocomplete, unlike fill() which sets the value directly.
    await field.click({ force: true });
    await field.clear();
    await field.pressSequentially(value, { delay: 50 });
    await this.page.waitForTimeout(2000);

    // Check for ADF LOV autocomplete suggestions (broader selectors for ADF)
    const autocompleteSelectors = [
      `li:has-text("${value}")`,
      `[role="option"]:has-text("${value}")`,
      `[role="listbox"] li:has-text("${value}")`,
      `.af_inputComboboxListOfValues_dropdown li`,
      `[id*="::pop"] li`,
    ];
    for (const sel of autocompleteSelectors) {
      const item = this.page.locator(sel).first();
      const visible = await item.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        console.log(`[LOV] Found autocomplete suggestion: ${sel}`);
        await item.click();
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return;
      }
    }

    // No autocomplete — press Tab to trigger LOV resolution (primary approach).
    // This works for most LOV fields (ZIP, City, State, County on Step 2).
    await field.press('Tab');
    await this.page.waitForTimeout(3000);

    let dialogFoundRows = true; // assume resolved unless dialog says otherwise
    const glassPane = this.page.locator('div.AFModalGlassPane');
    const hasDialog = await glassPane.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasDialog) {
      dialogFoundRows = await this.handleLovDialog(matchText || value);
    }

    // If the Tab-triggered dialog found real ADF data rows and selected one,
    // the value is resolved. If not, we need to try the LOV icon.
    if (dialogFoundRows) {
      await this.waitForJET();
      return;
    }

    // Tab-triggered dialog had 0 ADF data rows. But the value might still be
    // resolved — some LOV fields resolve server-side during dialog dismissal.
    // Use ADF getValue() to check: resolved fields have an internal ID (number)
    // different from the display text. Unresolved fields have the text itself.
    const afterTab = await field.inputValue().catch(() => '');
    const fieldIdCheck = await field.getAttribute('id').catch(() => '');
    if (afterTab && fieldIdCheck) {
      const cidCheck = fieldIdCheck.replace('::content', '');
      const adfCheck = await this.page.evaluate(({ cid, displayVal }: { cid: string; displayVal: string }) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        if (!adfPage) return { resolved: false, internal: 'no-adf' };
        const comp = adfPage.findComponentByAbsoluteId(cid);
        if (!comp) return { resolved: false, internal: 'no-comp' };
        const val = comp.getValue?.();
        if (val != null && val !== '' && String(val) !== displayVal) {
          return { resolved: true, internal: String(val).substring(0, 50) };
        }
        return { resolved: false, internal: val == null ? 'null' : String(val).substring(0, 50) };
      }, { cid: cidCheck, displayVal: value });

      if (adfCheck.resolved) {
        console.log(`[LOV] ADF confirmed resolved "${value}" (internal=${adfCheck.internal})`);
        await this.waitForJET();
        return;
      }
      console.log(`[LOV] ADF NOT resolved "${value}" (internal=${adfCheck.internal})`);
    }

    // Value is truly unresolved — clear it so wizard navigation isn't blocked.
    // Empty fields produce warnings but allow Submit; unresolved text blocks Next.
    console.log(`[LOV] Clearing unresolved LOV value "${value}"`);

    const fieldId = await field.getAttribute('id').catch(() => '');
    if (fieldId) {
      const componentId = fieldId.replace('::content', '');

      // Clear the field first so the dialog opens fresh
      await field.click({ force: true });
      await field.clear();
      await this.page.waitForTimeout(500);

      // Try ADF launchPopup() to open the LOV dialog programmatically
      const launched = await this.page.evaluate((cid: string) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        if (!adfPage) return false;
        const comp = adfPage.findComponentByAbsoluteId(cid);
        if (!comp) return false;
        if (comp.launchPopup) { comp.launchPopup(); return true; }
        return false;
      }, componentId);

      if (!launched) {
        // Fallback: click the LOV search icon
        const iconSelector = `[id="${fieldId.replace('::content', '::lovIconId')}"]`;
        const lovIcon = this.page.locator(iconSelector);
        const iconVisible = await lovIcon.isVisible({ timeout: 2000 }).catch(() => false);
        if (iconVisible) {
          await lovIcon.click({ force: true });
        }
      }

      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Handle the LOV icon dialog (different from Tab-triggered dialog)
      await this.handleLovIconDialog(value, matchText || value);
    }

    await this.waitForJET();
  }

  /**
   * Dismiss any visible ADF error dialogs ("Error", "Warning", "Information").
   * These appear as modal popups with an OK button.
   */
  async dismissErrorDialog(): Promise<void> {
    const errorDialog = this.page.locator('.x24d, [id*="msgDlg"]').first();
    const visible = await errorDialog.isVisible({ timeout: 1000 }).catch(() => false);
    if (visible) {
      const okBtn = this.page.locator('.x24d button, [id*="msgDlg"] button').first();
      await okBtn.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Handle the ADF "Search and Select" LOV dialog if it's visible.
   * Selects the best matching row and clicks OK.
   * Uses force:true for all clicks since the AFModalGlassPane sits between
   * the background page and the dialog, intercepting normal click routing.
   */
  private async handleLovDialog(matchText?: string): Promise<boolean> {
    // Check if a modal glass pane appeared (indicates a dialog is open)
    const glassPane = this.page.locator('div.AFModalGlassPane');
    const hasDialog = await glassPane.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasDialog) {
      await this.clearGlassPane();
      await this.waitForJET();
      return true; // No dialog = Tab resolved the value directly
    }

    // Wait for the dialog content to render.
    // IMPORTANT: Keep the glass pane — ADF needs it to track the dialog as active.
    // Use force:true for all clicks to bypass the glass pane.
    await this.page.waitForTimeout(2000);

    const dialogLayer = this.page.locator('#DhtmlZOrderManagerLayerContainer');

    // Find data rows in the dialog's results table
    const resultRows = dialogLayer.locator('[_afrrk]');
    let rowCount = await resultRows.count();

    // If no results yet, fill the dialog search field and click Search
    if (rowCount === 0) {
      const searchBtn = dialogLayer.getByRole('button', { name: /search/i }).first();
      const searchVisible = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (searchVisible) {
        // Type search value into the Name field using focus + keyboard events.
        // Glass pane blocks clicks but keyboard events still work.
        const searchValue = matchText || '';
        if (searchValue) {
          const nameInput = dialogLayer.locator('input[type="text"]').first();
          // Focus via JavaScript (bypasses glass pane), then type
          await nameInput.evaluate((el: HTMLElement) => el.focus());
          await nameInput.pressSequentially(searchValue, { delay: 30 });
          await nameInput.press('Tab');
          await this.page.waitForTimeout(500);
          console.log(`[LOV] Typed "${searchValue}" in dialog search`);
        }

        // Click Search button via ADF action event (force:true click may not
        // trigger the server-side search when glass pane is present).
        const searchBtnId = await searchBtn.getAttribute('id').catch(() => '');
        if (searchBtnId) {
          const parentId = searchBtnId.replace(/::content$/, '');
          const fired = await this.page.evaluate((id: string) => {
            const adfPage = (window as any).AdfPage?.PAGE;
            if (!adfPage) return false;
            // Try multiple ID variations to find the ADF component
            for (const tryId of [id, id.replace(/-/g, ':')]) {
              const comp = adfPage.findComponentByAbsoluteId(tryId);
              if (comp) {
                const evt = new (window as any).AdfActionEvent(comp);
                evt.queue();
                return true;
              }
            }
            return false;
          }, parentId);
          if (!fired) {
            // Fallback: use force click
            await searchBtn.click({ force: true });
          }
        } else {
          await searchBtn.click({ force: true });
        }
        console.log('[LOV] Fired Search action');
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        rowCount = await resultRows.count();
        console.log(`[LOV] After search: ${rowCount} rows`);

        // If still 0, check for alternative result selectors
        if (rowCount === 0) {
          // Try other table row selectors (some ADF tables don't use _afrrk)
          const altRows = dialogLayer.locator('table tbody tr').filter({ hasNot: this.page.locator('th') });
          const altCount = await altRows.count();
          if (altCount > 0) {
            console.log(`[LOV] Found ${altCount} alt rows (tbody tr)`);
            rowCount = altCount;
          }
        }
      }
    }

    // Determine which row selector to use
    const adfRows = dialogLayer.locator('[_afrrk]');
    const adfRowCount = await adfRows.count();
    const rows = adfRowCount > 0 ? adfRows : dialogLayer.locator('table tbody tr').filter({ hasNot: this.page.locator('th') });
    const actualRowCount = adfRowCount > 0 ? adfRowCount : rowCount;
    console.log(`[LOV] Dialog has ${actualRowCount} rows (adf=${adfRowCount})`);

    let clickedRow = false;
    if (actualRowCount > 0) {
      let targetRow = rows.first();
      if (matchText && actualRowCount > 1) {
        // Try to find a row matching the search text
        const matchRow = rows.filter({ hasText: matchText }).first();
        const matchVisible = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);
        if (matchVisible) {
          console.log(`[LOV] Clicking row matching: "${matchText}"`);
          targetRow = matchRow;
        } else {
          console.log('[LOV] No text match, clicking first row');
        }
      }
      await targetRow.click({ force: true });
      clickedRow = true;
      await this.page.waitForTimeout(1000);

      // For non-ADF rows, also try dispatching a mousedown event to trigger selection
      if (adfRowCount === 0) {
        await targetRow.dispatchEvent('mousedown');
        await this.page.waitForTimeout(500);
        await targetRow.dispatchEvent('mouseup');
        await this.page.waitForTimeout(500);
      }
    }

    // Click OK to close the dialog
    const okButton = dialogLayer.getByRole('button', { name: 'OK' }).first();
    const okVisible = await okButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (okVisible) {
      // Check if OK is enabled
      const okDisabled = await okButton.isDisabled().catch(() => false);
      if (okDisabled && clickedRow) {
        // OK is disabled despite row click — try double-clicking the row to select+close
        console.log('[LOV] OK disabled after row click, trying double-click on row');
        const firstRow = rows.first();
        await firstRow.dblclick({ force: true });
        await this.page.waitForTimeout(2000);
      } else {
        await okButton.click({ force: true });
      }
    } else {
      const cancelButton = dialogLayer.getByRole('button', { name: 'Cancel' }).first();
      await cancelButton.click({ force: true }).catch(() => {});
    }

    await this.page.waitForTimeout(3000);
    await this.clearGlassPane();
    await this.waitForJET();
    return clickedRow; // True if we found and clicked any data rows
  }

  /**
   * Handle an LOV dialog opened via the LOV search icon or launchPopup().
   * Unlike Tab-triggered dialogs, icon-triggered dialogs are properly
   * initialized by ADF and support server-side search.
   */
  private async handleLovIconDialog(searchTerm: string, matchText: string): Promise<void> {
    const glassPane = this.page.locator('div.AFModalGlassPane');
    const hasDialog = await glassPane.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasDialog) {
      console.log('[LOV] No dialog appeared after LOV icon click');
      return;
    }

    await this.page.waitForTimeout(2000);
    const dialogLayer = this.page.locator('#DhtmlZOrderManagerLayerContainer');

    // Check for existing data rows first
    const resultRows = dialogLayer.locator('[_afrrk]');
    let rowCount = await resultRows.count();
    console.log(`[LOV-icon] Initial rows: ${rowCount}`);

    // Type search term in the dialog's search field and submit
    if (rowCount === 0 || rowCount > 10) {
      const searchInputs = dialogLayer.locator('input[type="text"]');
      const inputCount = await searchInputs.count();
      console.log(`[LOV-icon] Dialog has ${inputCount} search inputs`);

      if (inputCount > 0) {
        // Fill only the first search input (Name field, not Code field)
        const nameInput = searchInputs.first();
        // Remove glass pane temporarily so the click goes through to ADF
        await this.clearGlassPane();
        await nameInput.click();
        await nameInput.fill(searchTerm);
        await this.page.waitForTimeout(500);
        console.log(`[LOV-icon] Typed "${searchTerm}" in dialog search`);

        // Submit search by clicking the Search button
        const searchBtn = dialogLayer.getByRole('button', { name: /search/i }).first();
        const searchBtnVisible = await searchBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (searchBtnVisible) {
          await searchBtn.click();
          console.log('[LOV-icon] Clicked Search button');
        } else {
          // Fallback: press Enter to submit the search form
          await nameInput.press('Enter');
          console.log('[LOV-icon] Pressed Enter to search');
        }

        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        rowCount = await resultRows.count();
        console.log(`[LOV-icon] After search: ${rowCount} rows`);

        // Debug: log alt row content if no ADF rows found
        if (rowCount === 0) {
          const altRows = dialogLayer.locator('table tbody tr');
          const altCount = await altRows.count();
          for (let i = 0; i < Math.min(altCount, 3); i++) {
            const text = await altRows.nth(i).textContent().catch(() => 'N/A');
            console.log(`[LOV-icon] Row ${i}: "${text?.trim().substring(0, 120)}"`);
          }
        }
      }
    }

    // Select matching row
    if (rowCount > 0) {
      if (rowCount > 1 && matchText) {
        const matchRow = resultRows.filter({ hasText: matchText }).first();
        const vis = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);
        if (vis) {
          console.log(`[LOV-icon] Selecting row matching "${matchText}"`);
          await matchRow.click();
        } else {
          console.log('[LOV-icon] No text match, selecting first row');
          await resultRows.first().click();
        }
      } else {
        console.log('[LOV-icon] Selecting first row');
        await resultRows.first().click();
      }
      await this.page.waitForTimeout(1000);
    }

    // Click OK to close — remove glass pane first for clean click
    await this.clearGlassPane();
    const okBtn = dialogLayer.getByRole('button', { name: 'OK' }).first();
    const okVisible = await okBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (okVisible) {
      await okBtn.click();
      console.log('[LOV-icon] Clicked OK');
    } else {
      const cancelBtn = dialogLayer.getByRole('button', { name: 'Cancel' }).first();
      await cancelBtn.click().catch(() => {});
      console.log('[LOV-icon] No OK button, clicked Cancel');
    }

    await this.page.waitForTimeout(3000);
    await this.clearGlassPane();
    await this.waitForJET();
  }

  /**
   * Remove any leftover ADF popup overlays.
   * Force-clicking dialog buttons bypasses ADF's popup manager, leaving
   * AFModalGlassPane overlays that block interaction.
   * Note: Do NOT remove children from DhtmlZOrderManagerLayerContainer —
   * this breaks ADF's internal component tree references.
   */
  async clearGlassPane(): Promise<void> {
    await this.page.evaluate(() => {
      document.querySelectorAll('.AFModalGlassPane').forEach((el) => el.remove());
    });
  }

  /** Click an element and wait for JET. */
  async clickAndWait(selector: string): Promise<void> {
    await this.page.locator(selector).click();
    await this.waitForJET();
  }

  /** Check that a text element is visible on the page. */
  async expectTextVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible();
  }

  /** Take a screenshot with a descriptive name. */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }
}
