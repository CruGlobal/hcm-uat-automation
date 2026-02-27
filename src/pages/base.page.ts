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
    await field.clear();
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

    // No autocomplete — press Tab to trigger LOV resolution
    await field.press('Tab');
    await this.page.waitForTimeout(3000);

    // Check if a modal "Search and Select" dialog appeared
    const glassPane = this.page.locator('div.AFModalGlassPane');
    const hasDialog = await glassPane.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasDialog) {
      await this.handleLovDialog(matchText || value);

      // Check if value was resolved after dialog
      const afterDialog = await field.inputValue().catch(() => '');
      if (afterDialog) return;
    }

    // Check if Tab resolved the value without dialog
    const afterTab = await field.inputValue().catch(() => '');
    if (afterTab) {
      await this.waitForJET();
      return;
    }

    // Value still empty — try LOV search icon to force a proper search dialog.
    const fieldId = await field.getAttribute('id').catch(() => '');
    if (fieldId) {
      const lovIconId = fieldId.replace('::content', '::lovIconId');
      const lovIcon = this.page.locator(`[id="${lovIconId}"]`);
      const iconVisible = await lovIcon.isVisible({ timeout: 2000 }).catch(() => false);
      if (iconVisible) {
        await field.click({ force: true });
        await field.pressSequentially(value, { delay: 50 });
        await this.page.waitForTimeout(1000);
        console.log(`[LOV] Clicking search icon for: "${value}"`);
        await lovIcon.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        await this.handleLovDialog(matchText || value);
        return;
      }
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
  private async handleLovDialog(matchText?: string): Promise<void> {
    // Check if a modal glass pane appeared (indicates a dialog is open)
    const glassPane = this.page.locator('div.AFModalGlassPane');
    const hasDialog = await glassPane.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasDialog) {
      await this.clearGlassPane();
      await this.waitForJET();
      return;
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

        console.log('[LOV] Clicking Search button');
        await searchBtn.click({ force: true });
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

    console.log(`[LOV] Dialog has ${rowCount} result rows`);

    if (rowCount > 0) {
      const rows = rowCount > 0 ? dialogLayer.locator('[_afrrk]') : dialogLayer.locator('table tbody tr');
      if (matchText && rowCount > 1) {
        const matchRow = dialogLayer.locator(`[_afrrk]:has-text("${matchText}")`).first();
        const matchVisible = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);
        if (matchVisible) {
          console.log(`[LOV] Clicking row matching: "${matchText}"`);
          await matchRow.click({ force: true });
        } else {
          await rows.first().click({ force: true });
        }
      } else {
        await rows.first().click({ force: true });
      }
      await this.page.waitForTimeout(1000);
    }

    // Click OK to close the dialog
    const okButton = dialogLayer.getByRole('button', { name: 'OK' }).first();
    const okVisible = await okButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (okVisible) {
      await okButton.click({ force: true });
    } else {
      const cancelButton = dialogLayer.getByRole('button', { name: 'Cancel' }).first();
      await cancelButton.click({ force: true }).catch(() => {});
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
