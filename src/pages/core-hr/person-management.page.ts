import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { LoginPage } from '../login.page';
import { HomePage } from '../home.page';
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

  // === Person Management Search — Saved Search / Show dropdown ===
  // The "Saved Search" dropdown controls which people appear (Active Assignment, All, etc.)
  private readonly savedSearchDropdown = this.page.locator(
    '[id*="q1"][id*="savedSearch1::content"], [id*="qsPanel"][id*="savedSearch"]'
  ).first();

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
    // Wait for the search field — under concurrent load ADF can take 30s+ to render
    const visible = await locator.isVisible({ timeout: 30_000 }).catch(() => false);
    if (!visible) {
      const currentUrl = this.page.url();

      // Dead session or login page — re-login
      if (!currentUrl.includes('fscmUI') || currentUrl.includes('login') || currentUrl.includes('signin')) {
        console.log(`[PersonMgmt] Not on HCM page (${currentUrl}), re-authenticating...`);
        const login = new LoginPage(this.page);
        await login.fullLogin();
      }

      // Navigate to Person Management and wait generously for ADF to render
      console.log('[PersonMgmt] Search field not visible — navigating to Person Management');
      await this.page.goto(
        '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_person_management',
        { timeout: 60_000 },
      ).catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.waitForJET();
      await this.dismissPopups();

      // Poll for the search field with a generous timeout — ADF renders lazily under load
      let retryVisible = await locator.isVisible({ timeout: 30_000 }).catch(() => false);
      if (!retryVisible) {
        // One more attempt: go home first then back (forces clean ADF transition)
        console.log('[PersonMgmt] Search panel did not render — resetting via home...');
        await this.page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
        await this.page.waitForTimeout(3000);
        await this.page.goto(
          '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_person_management',
          { timeout: 60_000 },
        ).catch(() => {});
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
        await this.waitForJET();
        retryVisible = await locator.isVisible({ timeout: 30_000 }).catch(() => false);
      }
      if (!retryVisible) {
        await this.page.screenshot({ path: `test-results/person-search-not-visible.png`, fullPage: true }).catch(() => {});
        throw new Error(`Person Management search field not visible after navigation retry (url: ${this.page.url()})`);
      }
    }
    await locator.click();
    await locator.clear();
    await locator.pressSequentially(value, { delay: 30 });
    await locator.press('Tab');
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Ensure we're on the Person Management page by checking for the search panel.
   * If not found, navigate via deep link and wait for the search field.
   */
  private async ensureOnPersonManagement(): Promise<void> {
    const anySearchField = this.page.locator('[id*="q1:"]').first();
    // Give ADF 20s to render under load (was 5s — too aggressive for concurrent runs)
    const isOnPage = await anySearchField.isVisible({ timeout: 20_000 }).catch(() => false);
    if (isOnPage) return;

    console.log('[PersonMgmt] Search panel not found — navigating via FuseOverview URL');
    await this.page.goto(
      '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_person_management',
      { timeout: 60_000 },
    ).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await this.waitForJET();
    await this.dismissPopups();
    // Wait for the search panel to render — generous timeout for concurrent load
    await anySearchField.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      console.log('[PersonMgmt] Search panel still not visible after FuseOverview nav');
    });
  }

  /** Search by person name and click the first result. */
  async searchByName(name: string): Promise<void> {
    await this.ensureOnPersonManagement();
    await this.fillSearchField(this.searchName, name);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    await this.clickFirstSearchResult();
  }

  /** Search by person number and click the first result. */
  async searchByPersonNumber(personNumber: string): Promise<void> {
    await this.ensureOnPersonManagement();
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
    await this.ensureOnPersonManagement();
    await this.fillSearchField(this.searchPersonNumber, personNumber);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();

    // Check for "No results found" first
    const noResults = await this.page.locator('text=No results found, text=No data to display').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (noResults) return false;

    // Check multiple result link selectors
    const resultLink = this.page.locator(
      '[id*="table2:0:gl"], [id*="resId1:0:"] a, tr[_afrrk] a, [id*="SP3"] a[id*=":gl"]'
    ).first();
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
   * Change the saved search filter (e.g. "Active Assignment" → "All").
   * Returns true if changed successfully.
   */
  async setSavedSearchFilter(filterName: string): Promise<boolean> {
    if (await this.savedSearchDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.fillCombobox(this.savedSearchDropdown, filterName);
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return true;
    }
    console.log('[PersonMgmt] Saved search dropdown not found');
    return false;
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

  /** Click the first person in search results table. */
  private async clickFirstSearchResult(): Promise<void> {
    // Check for "No results found" message first
    const noResults = await this.page.locator('text=No results found, text=No data to display').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    if (noResults) {
      throw new Error('Person search returned no results');
    }

    // Clear glass pane that may persist from search — blocks clicks on result links
    await this.clearGlassPane();

    // Search results table uses IDs like: ...Perso1:0:SP3:table1:_ATp:table2:0:gl1
    // The name link is the first <a> inside the results table (table2).
    // Strategy 1: Standard ADF table result link ID patterns
    const resultLink = this.page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
    const isVisible = await resultLink.isVisible({ timeout: 10000 }).catch(() => false);
    if (isVisible) {
      console.log('[PersonMgmt] Clicking first search result');
      await resultLink.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Any clickable link in the first row of search results table
    const fallbackLink = this.page.locator('table[id*="table2"] tbody tr:first-child a, table[id*="resId1"] tbody tr:first-child a').first();
    if (await fallbackLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[PersonMgmt] Clicking fallback search result link');
      await fallbackLink.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: ADF data rows with [_afrrk] attribute — these are virtual table rows
    const afrrkRow = this.page.locator('tr[_afrrk] a, [_afrrk] a').first();
    if (await afrrkRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[PersonMgmt] Clicking ADF data row link [_afrrk]');
      await afrrkRow.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return;
    }

    // Strategy 4: Any link inside the search results panel (SP3 container)
    const sp3Link = this.page.locator('[id*="SP3"] a[id*=":gl"], [id*="SP3"] a[id*=":ot"]').first();
    if (await sp3Link.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[PersonMgmt] Clicking SP3 container link');
      await sp3Link.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return;
    }

    // Strategy 5: Any link in a table row within the results area
    const anyTableLink = this.page.locator('[id*="table"] tbody tr a').first();
    if (await anyTableLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[PersonMgmt] Clicking generic table result link');
      await anyTableLink.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return;
    }

    console.log('[PersonMgmt] No search result link found — person may not exist');
    throw new Error('Person search found no clickable results');
  }
}
