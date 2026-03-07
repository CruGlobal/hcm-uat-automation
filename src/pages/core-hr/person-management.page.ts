import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Personal Details page — covers step 1 (Identification) personal fields,
 * step 2 (Person Information) address/legislative fields, and also the
 * Person Management search page for finding existing persons.
 *
 * Step 1 personal detail field indices are DYNAMIC — they change after
 * Legal Employer selection triggers a partial page refresh.
 * Use stable suffixes (it20, it60, etc.) with `.first()`.
 *
 * Person Management Search selectors:
 *   Name:          [id$="q1:value00::content"]
 *   Person Number: [id$="q1:value10::content"]
 *   National ID:   [id$="q1:value20::content"]
 *   Search btn:    [id$="q1::search"]
 */
export class PersonManagementPage extends BasePage {
  // === Person Management Search Page ===
  private readonly searchName = this.page.locator('[id$="q1:value00::content"]');
  private readonly searchPersonNumber = this.page.locator('[id$="q1:value10::content"]');
  private readonly searchNationalId = this.page.locator('[id$="q1:value20::content"]');
  private readonly searchButton = this.page.locator('[id$="q1::search"]');
  private readonly searchReset = this.page.locator('[id$="q1::reset"]');

  // === Step 1: Identification — Personal Details ===
  // These suffixes are stable but the middle index (i1:N) changes after LE selection.
  private readonly lastName = this.page.locator('input[id*="it20::content"]').first();
  private readonly firstName = this.page.locator('input[id*="it60::content"]').first();
  private readonly middleName = this.page.locator('input[id*="it24::content"]').first();
  private readonly suffix = this.page.locator('input[id*="it17::content"]').first();
  private readonly title = this.page.locator('input[id*="NewPe1"][id$="selectOneChoice4::content"]').first();
  private readonly gender = this.page.locator('[id$="soc3::content"]');
  private readonly dateOfBirth = this.page.locator('[id$="id3::content"]');

  // === Step 2: Person Information — Home Address ===
  private readonly country = this.page.locator('[id$="countrylov::content"]');
  private readonly addressLine1 = this.page.locator('[id$="inputText17::content"]').first();
  private readonly addressLine2 = this.page.locator('[id$="inputText18::content"]').first();
  private readonly zipCode = this.page.locator('[id$="inputComboboxListOfValues28::content"]').first();
  private readonly city = this.page.locator('[id$="inputComboboxListOfValues27::content"]').first();
  private readonly state = this.page.locator('[id$="inputComboboxListOfValues25::content"]').first();
  private readonly county = this.page.locator('[id$="inputComboboxListOfValues26::content"]').first();

  // === Step 2: Person Information — Legislative ===
  private readonly maritalStatus = this.page.locator('[id$="soc2::content"]');
  private readonly highestEducation = this.page.locator('[id$="hoc2::content"]');

  // === Step 1: Fill personal details ===

  async fillLastName(value: string): Promise<void> {
    await this.fillField(this.lastName, value);
  }

  async fillFirstName(value: string): Promise<void> {
    await this.fillField(this.firstName, value);
  }

  async fillMiddleName(value: string): Promise<void> {
    await this.fillField(this.middleName, value);
  }

  async fillDateOfBirth(serial: string): Promise<void> {
    await this.fillField(this.dateOfBirth, excelSerialToDate(serial));
  }

  async selectGender(value: string): Promise<void> {
    await this.fillCombobox(this.gender, value);
  }

  /** Fill step 1 personal details from test case. */
  async fillIdentificationFromTestCase(tc: TestCase): Promise<void> {
    const lastName = getField(tc, 'Last Name');
    const firstName = getField(tc, 'First Name');
    const middleName = getField(tc, 'Middle Name');
    const gender = getField(tc, 'Gender');
    const dob = getField(tc, 'Birthdate') || getField(tc, 'Date of Birth');

    if (lastName) await this.fillLastName(lastName);
    if (firstName) await this.fillFirstName(firstName);
    if (middleName) await this.fillMiddleName(middleName);
    if (gender) await this.selectGender(gender);
    if (dob) await this.fillDateOfBirth(dob);
  }

  // === Step 2: Fill address ===

  async fillAddress(tc: TestCase): Promise<void> {
    let addr1 = getField(tc, 'Address Line 1') || getField(tc, 'Address');
    const addr2 = getField(tc, 'Address Line 2');
    let zip = getField(tc, 'ZIP Code') || getField(tc, 'Zip');
    let cityVal = getField(tc, 'City');
    let countyVal = getField(tc, 'County');
    let stateVal = getField(tc, 'State');

    // If address is a placeholder ("Any valid address") with no real ZIP/City, use Cru HQ defaults
    if (addr1 && addr1.toLowerCase().includes('any valid') && !zip) {
      console.log('[Address] Placeholder address detected — using Cru HQ defaults');
      addr1 = '100 Lake Hart Dr';
      zip = '32832';
      cityVal = cityVal || 'Orlando';
      stateVal = stateVal || 'FL';
      countyVal = countyVal || 'Orange';
    }

    if (addr1) await this.fillField(this.addressLine1, addr1);
    if (addr2) await this.fillField(this.addressLine2, addr2);

    // ZIP Code is a LOV field — opens "Search and Select" dialog when multiple matches.
    // Selecting a ZIP auto-populates City, State, and County, so fill ZIP first.
    if (zip) {
      // Use city+county to pick the right ZIP match when the dialog appears
      const matchHint = cityVal && countyVal ? `${cityVal}, ${countyVal}` : cityVal || '';
      await this.fillLovField(this.zipCode, zip, matchHint || undefined);

      // After ZIP selection, City/State/County may be auto-populated.
      // Only fill them if they're still empty.
      await this.page.waitForTimeout(1000);
    }

    const cityEmpty = !(await this.city.inputValue().catch(() => ''));
    const countyEmpty = !(await this.county.inputValue().catch(() => ''));
    const stateEmpty = !(await this.state.inputValue().catch(() => ''));

    if (cityVal && cityEmpty) await this.fillLovField(this.city, cityVal);
    if (stateVal && stateEmpty) await this.fillLovField(this.state, stateVal);
    if (countyVal && countyEmpty) await this.fillLovField(this.county, countyVal);
  }

  // === Step 2: Fill legislative info ===

  async fillLegislative(tc: TestCase): Promise<void> {
    const marital = getField(tc, 'Marital Status');
    const education = getField(tc, 'Highest Education');

    if (marital) await this.fillCombobox(this.maritalStatus, marital);
    if (education) await this.fillCombobox(this.highestEducation, education);
  }

  /** Fill all step 2 (Person Information) fields from test case. */
  async fillPersonInfoFromTestCase(tc: TestCase): Promise<void> {
    await this.fillAddress(tc);
    await this.fillLegislative(tc);
  }

  // === Person Management Search ===

  /** Search by name or number (convenience wrapper). */
  async searchPerson(query: string): Promise<void> {
    // If it looks like a number, search by person number; otherwise by name
    if (/^\d+$/.test(query.trim())) {
      await this.searchByPersonNumber(query.trim());
    } else {
      await this.searchByName(query.trim());
    }
  }

  /** Fill a search field using click → clear → pressSequentially to trigger ADF binding events. */
  private async fillSearchField(locator: ReturnType<typeof this.page.locator>, value: string): Promise<void> {
    await locator.click();
    await locator.clear();
    await locator.pressSequentially(value, { delay: 30 });
    await locator.press('Tab');
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Search by person name and click the first result. */
  async searchByName(name: string): Promise<void> {
    await this.fillSearchField(this.searchName, name);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    await this.clickFirstSearchResult();
  }

  /** Search by person number and click the first result. */
  async searchByPersonNumber(personNumber: string): Promise<void> {
    await this.fillSearchField(this.searchPersonNumber, personNumber);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    await this.clickFirstSearchResult();
  }

  /**
   * Search by person number but do NOT click the result.
   * Returns true if at least one result was found.
   */
  async searchByPersonNumberOnly(personNumber: string): Promise<boolean> {
    await this.fillSearchField(this.searchPersonNumber, personNumber);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    const resultLink = this.page.locator('[id*="table2:0:gl"]').first();
    return await resultLink.isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Get all text from the first search result row.
   * Returns the full row text, which includes Name, Person Number, Department,
   * Location, User Person Type, Job, Assignment Status, etc.
   */
  async getFirstResultRowText(): Promise<string> {
    // Use Playwright locators which handle ADF's virtual DOM better.
    // The search results area contains table headers and row data.
    const resultsArea = this.page.locator('[id*="SP3:table1"]').first();
    if (await resultsArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      return (await resultsArea.textContent() || '').trim();
    }
    return '';
  }

  /**
   * Click the per-row Actions icon (orange dropdown) for the first search result.
   * This opens a context menu with available actions for that person.
   */
  async clickFirstResultActionsIcon(): Promise<void> {
    const actionIcon = this.page.locator('[id*="table2:0:commandImageLink"], [id*="table2:0:cil"]').first();
    if (await actionIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[PersonMgmt] Clicking per-row Actions icon');
      await actionIcon.click();
      await this.page.waitForTimeout(2000);
    } else {
      console.log('[PersonMgmt] Per-row Actions icon not found');
    }
  }

  /**
   * Change the "Show" dropdown filter (default: "Active Assignment") to a different value.
   * Useful when searching for terminated or pending workers.
   */
  async setSearchStatusFilter(status: string): Promise<void> {
    const showDropdown = this.page.locator('[id$="q1:value30::content"], [id$="soc1::content"], select[id*="q1"]').first();
    if (await showDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[PersonMgmt] Setting Show filter to: ${status}`);
      await this.fillCombobox(showDropdown, status);
      await this.page.waitForTimeout(1000);
    }
  }

  /** Click the first person in search results table. */
  private async clickFirstSearchResult(): Promise<void> {
    // Search results table uses IDs like: ...Perso1:0:SP3:table1:_ATp:table2:0:gl1
    // The name link is the first <a> inside the results table (table2).
    const resultLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
    const isVisible = await resultLink.isVisible({ timeout: 10000 }).catch(() => false);
    if (isVisible) {
      console.log('[PersonMgmt] Clicking first search result');
      await resultLink.click();
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
    } else {
      // Fallback: any clickable link in the first row of search results
      const fallbackLink = this.page.locator('table[id*="table2"] tbody tr:first-child a, table[id*="resId1"] tbody tr:first-child a').first();
      if (await fallbackLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[PersonMgmt] Clicking fallback search result link');
        await fallbackLink.click();
        await this.page.waitForTimeout(8000);
        await this.waitForJET();
      } else {
        // No results with current filter — retry with "All" status filter
        console.log('[PersonMgmt] No search result link found, retrying with "All" filter...');
        await this.setSearchStatusFilter('All');
        await this.searchButton.click();
        await this.page.waitForTimeout(8000);
        await this.waitForJET();
        const retryLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
        if (await retryLink.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('[PersonMgmt] Found result after switching to "All" filter');
          await retryLink.click();
          await this.page.waitForTimeout(8000);
          await this.waitForJET();
        } else {
          console.log('[PersonMgmt] No search results even with "All" filter');
        }
      }
    }
  }
}
