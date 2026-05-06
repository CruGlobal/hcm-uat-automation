import { type Locator } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page object for Oracle HCM Benefits module.
 *
 * Two distinct UI surfaces:
 *   1. Benefits Activity Center (Admin) -- Redwood search page with person list,
 *      filter chips, and worker detail cards showing assignment/person info.
 *   2. Benefits Self-Service (ESS) -- Redwood enrollment summary with plan cards,
 *      "Show Benefits" dropdown, "Enroll Now" button, and quick-action sidebar.
 *
 * Selectors sourced from live inspection of:
 *   - .cache/inspect/benefits-admin-deep.json (94 elements)
 *   - .cache/inspect/benefits-ess-deep.json  (16 elements)
 */
export class BenefitsPage extends BasePage {
  // ===================================================================
  // Benefits Activity Center (Admin) selectors
  // ===================================================================

  /** Person search combobox at top of Activity Center. */
  private readonly adminSearchInput: Locator = this.page.locator(
    'input.oj-inputsearch-input[placeholder*="Search by name"]'
  ).or(this.page.locator(
    'input[placeholder*="Search by name"]'
  )).or(this.page.locator(
    'input.oj-inputsearch-input'
  )).or(this.page.locator(
    'oj-input-search input'
  )).first();

  /** The combobox wrapper for the admin search. */
  private readonly adminSearchCombobox: Locator = this.page.locator(
    'div[role="combobox"][aria-label*="Search by name"]'
  );

  /** Back button in Activity Center header. */
  private readonly adminBackButton: Locator = this.page.locator(
    'button[aria-label="Back"]'
  );

  /** "Saved Searches" button in Activity Center. */
  private readonly savedSearchesButton: Locator = this.page.locator(
    'button[aria-label="Saved Searches"]'
  );

  /** "Sort By Relevance" button in Activity Center. */
  private readonly sortByRelevanceButton: Locator = this.page.locator(
    'button[aria-label="Sort By Relevance"]'
  );

  // --- Filter chips (admin) ---
  private readonly filterWorkerType: Locator = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Worker Type")'
  );
  private readonly filterAssignmentStatus: Locator = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Assignment Status")'
  );
  private readonly filterEffectiveDate: Locator = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Effective As-of Date")'
  );
  private readonly filterLifeEventStatus: Locator = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Life Event Status")'
  );
  private readonly filterMore: Locator = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Filters")'
  );

  // --- Worker list items (admin) ---
  private readonly workerCards: Locator = this.page.locator(
    'oj-input-text.oj-read-only'
  );

  // ===================================================================
  // Benefits Self-Service (ESS) selectors
  // ===================================================================

  /** "Show Benefits" dropdown (oj-select-single). */
  private readonly showBenefitsDropdown: Locator = this.page.locator(
    '#enrt_sum_select_single_ben1'
  );

  /** "Show Benefits" dropdown input field for typing/filtering. */
  private readonly showBenefitsInput: Locator = this.page.locator(
    'input#enrt_sum_select_single_ben1\\|input'
  );

  /** "Show Benefits" filter/search input inside the dropdown popup. */
  private readonly showBenefitsFilterInput: Locator = this.page.locator(
    'input#oj-searchselect-filter-enrt_sum_select_single_ben1\\|input'
  );

  /** "Enroll Now" button on the ESS enrollment summary page. */
  private readonly enrollNowButton: Locator = this.page.locator(
    'button:has-text("Enroll Now"), button.oj-button-button:has-text("Enroll")'
  ).first();

  /** Program or Plan name (read-only display). */
  private readonly programPlanField: Locator = this.page.locator(
    'oj-input-text#pgm'
  );

  /** Go back button on ESS pages. */
  private readonly essGoBackButton: Locator = this.page.locator(
    'button[aria-label="Go back"]'
  );

  /** Welcome banner primary action button. */
  private readonly welcomeBannerAction: Locator = this.page.locator(
    '#welcomeBanner_hwb_primaryAction'
  );

  /** Navigation tabs (shared between admin and ESS views). */
  private readonly navTabs: Locator = this.page.locator(
    'a[role="tab"].oj-navigationlist-focused-element'
  );

  // ===================================================================
  // Quick action links (ESS sidebar) -- located by visible text
  // ===================================================================

  private readonly quickActionBeforeYouEnroll: Locator =
    this.page.getByRole('link', { name: 'Before You Enroll' });

  private readonly quickActionDependents: Locator =
    this.page.getByRole('link', { name: 'Dependents' });

  private readonly quickActionReportLifeEvent: Locator =
    this.page.getByRole('link', { name: 'Report a Life Event' });

  private readonly quickActionBenefitsContacts: Locator =
    this.page.getByRole('link', { name: 'Benefits Contacts' });

  // ===================================================================
  // Enrollment wizard selectors (used after clicking Enroll Now)
  // ===================================================================

  /** "Enroll" or "Modify" button on a plan card in ESS. */
  private enrollButtonForPlan(planName: string): Locator {
    return this.page.locator(`div:has-text("${planName}")`)
      .locator('button:has-text("Enroll"), button:has-text("Modify"), a:has-text("Enroll"), a:has-text("Modify")')
      .first();
  }

  /** Submit button -- present in both admin and ESS contexts. */
  private readonly submitButton: Locator = this.page.locator(
    'button:has-text("Submit"), a[role="button"]:has-text("Submit")'
  ).first();

  /** Continue button in enrollment wizard. */
  private readonly continueButton: Locator = this.page.locator(
    'button:has-text("Continue"), a[role="button"]:has-text("Continue")'
  ).first();

  /** Next button in enrollment wizard. */
  private readonly nextButton: Locator = this.page.locator(
    'button:has-text("Next"), a[role="button"]:has-text("Next")'
  ).first();

  /** Save button in enrollment wizard. */
  private readonly saveButton: Locator = this.page.locator(
    'button:has-text("Save"), a[role="button"]:has-text("Save")'
  ).first();

  /** Cancel button. */
  private readonly cancelButton: Locator = this.page.locator(
    'button:has-text("Cancel"), a[role="button"]:has-text("Cancel")'
  ).first();

  /** Done button (post-submit confirmation). */
  private readonly doneButton: Locator = this.page.locator(
    'button:has-text("Done"), a[role="button"]:has-text("Done")'
  ).first();

  /** Confirmation/success banner or message. */
  private readonly confirmationBanner: Locator = this.page.locator(
    '[class*="confirmation"], [class*="success"], [class*="oj-message-banner"]'
  ).first();

  // ===================================================================
  // Navigation
  // ===================================================================

  /**
   * Navigate to Benefits Activity Center (Admin) via deep link.
   * Falls back to Navigator menu if deep link fails.
   */
  async navigateToBenefitsAdmin(): Promise<void> {
    try {
      await this.page.goto(
        '/fscmUI/redwood/benefits-activity-center/view/benefits-administration'
      );
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      await this.dismissPopups();

      // Verify we reached the admin page by checking for the search input
      const onAdminPage = await this.adminSearchInput.isVisible({ timeout: 10_000 }).catch(() => false);
      if (onAdminPage) return;

      // Deep link may land on Benefits Administration home page with icons.
      // Try clicking "Benefit Activity Center" icon to enter the search page.
      const activityCenterLink = this.page.locator(
        'a:has-text("Benefit Activity Center"), a:has-text("Benefits Activity Center"), ' +
        'a[title*="Activity Center"]'
      ).first();
      if (await activityCenterLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log('[Benefits] Clicking Benefit Activity Center icon');
        await activityCenterLink.click();
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        await this.dismissPopups();
        const onPage = await this.adminSearchInput.isVisible({ timeout: 10_000 }).catch(() => false);
        if (onPage) return;
      }
    } catch {
      console.log('[Benefits] Deep link to admin failed, trying Navigator');
    }

    // Fallback: Navigate via Navigator menu
    await this.navigateToBenefitsViaNavigator('benefits-admin');
  }

  /**
   * Navigate to Benefits Self-Service enrollment summary via deep link.
   * Falls back to Me > Benefits springboard if deep link fails.
   */
  async navigateToSelfServiceBenefits(): Promise<void> {
    try {
      await this.page.goto('/fscmUI/redwood/benefits/enrollment-summary');
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      await this.dismissPopups();

      // Verify we reached the ESS page
      const onEssPage = await this.showBenefitsInput.isVisible({ timeout: 10_000 }).catch(() => false)
        || await this.page.getByText(/benefits|enrollment/i).first().isVisible({ timeout: 5_000 }).catch(() => false);
      if (onEssPage) return;
    } catch {
      console.log('[Benefits] Deep link to ESS failed, trying Navigator');
    }

    // Fallback: Navigate via Navigator > Me > Benefits
    await this.navigateToBenefitsViaNavigator('benefits-ess');
  }

  /**
   * Navigate to Benefits via the Navigator menu.
   * @param target 'benefits-admin' or 'benefits-ess'
   */
  private async navigateToBenefitsViaNavigator(target: string): Promise<void> {
    // Try direct URL first before falling back to Navigator menu
    if (target === 'benefits-admin') {
      try {
        await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_benefits_benefits_admin', { timeout: 30000 });
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        await this.dismissPopups();
        const onPage = await this.adminSearchInput.isVisible({ timeout: 10000 }).catch(() => false);
        if (onPage) return;
      } catch { /* fall through to Navigator */ }
    }

    const navigatorLink = this.page.locator('a[title="Navigator"]');
    await this.dismissPopups();
    const navVisible = await navigatorLink.isVisible({ timeout: 10000 }).catch(() => false);
    if (!navVisible) {
      console.log('[Benefits] Navigator not visible — page may not have loaded');
      return;
    }
    await navigatorLink.click({ force: true });
    await this.page.waitForTimeout(2000);

    // Click "Show More" to expand all sections
    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    if (target === 'benefits-admin') {
      // Try Benefits Administration link
      const adminLink = this.page.locator(
        '[id$="nv_itemNode_groupNode_benefits_BenefitsActivityCenter"], ' +
        'a[title*="Benefits"], a:has-text("Benefits Administration")'
      ).first();
      if (await adminLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await adminLink.click({ force: true });
      } else {
        // Deep link fallback
        await this.page.goto('/fscmUI/redwood/benefits-activity-center/view/benefits-administration');
      }
    } else {
      // Try Me > Benefits link
      const essLink = this.page.locator(
        '[id$="nv_itemNode_itemNode_my_information_benefits_Redwood"], ' +
        'a[title*="Benefits"]:not([title*="Administration"])'
      ).first();
      if (await essLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await essLink.click({ force: true });
      } else {
        // Deep link fallback
        await this.page.goto('/fscmUI/redwood/benefits/enrollment-summary');
      }
    }

    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.dismissPopups();
  }

  /** Navigate to Benefits (delegates to self-service deep link + Navigator fallback). */
  async navigateToBenefits(): Promise<void> {
    await this.navigateToSelfServiceBenefits();
  }

  // ===================================================================
  // Person search (Admin Activity Center)
  // ===================================================================

  /**
   * Search for a person in the Benefits Activity Center.
   * Uses the Redwood combobox search bar at the top of the page.
   * Handles case where search input is not immediately visible.
   */
  async searchPerson(nameOrNumber: string): Promise<void> {
    // Wait for the search input to appear with retry
    let searchVisible = await this.adminSearchInput.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!searchVisible) {
      // Try clicking back button if we're in a detail view
      const backVisible = await this.adminBackButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (backVisible) {
        await this.adminBackButton.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        searchVisible = await this.adminSearchInput.isVisible({ timeout: 10_000 }).catch(() => false);
      }
    }

    if (!searchVisible) {
      // We may be on the Benefits Administration home page (with icons).
      // Try clicking "Benefit Activity Center" icon to enter the search page.
      const activityCenterLink = this.page.locator(
        'a:has-text("Benefit Activity Center"), a:has-text("Benefits Activity Center"), ' +
        'a[title*="Activity Center"], img[alt*="Activity Center"]'
      ).first();
      if (await activityCenterLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log('[Benefits] Clicking Benefit Activity Center icon to reach search page');
        await activityCenterLink.click();
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        await this.dismissPopups();
        searchVisible = await this.adminSearchInput.isVisible({ timeout: 10_000 }).catch(() => false);
      }
    }

    if (!searchVisible) {
      // Try alternate search inputs
      const altSearch = this.page.locator('input[type="search"], input[role="searchbox"], input[aria-label*="Search"]').first();
      const altVisible = await altSearch.isVisible({ timeout: 5_000 }).catch(() => false);
      if (altVisible) {
        await altSearch.click();
        await altSearch.fill(nameOrNumber);
        await this.page.waitForTimeout(1500);
        await altSearch.press('Enter');
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
      console.log('[Benefits] Search input not found — proceeding without person search');
      return;
    }

    await this.adminSearchInput.click();
    // Clear any existing search text
    await this.adminSearchInput.fill('');
    await this.page.waitForTimeout(500);
    await this.adminSearchInput.fill(nameOrNumber);
    await this.page.waitForTimeout(1500);
    await this.adminSearchInput.press('Enter');
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Select a worker from the Activity Center search results.
   * Uses multiple strategies to find and click the worker card:
   *   1. Exact link text match (a:has-text)
   *   2. Partial name match with person number
   *   3. First clickable result card
   */
  async selectWorker(name: string): Promise<void> {
    // Strategy 1: find a link containing the name
    const workerLink = this.page.locator(`a:has-text("${name}")`).first();
    const linkVisible = await workerLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (linkVisible) {
      await workerLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: try span or div containing the name
    const workerSpan = this.page.locator(`span:has-text("${name}"), div.oj-listview-cell-element:has-text("${name}")`).first();
    const spanVisible = await workerSpan.isVisible({ timeout: 5_000 }).catch(() => false);
    if (spanVisible) {
      await workerSpan.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: if name is "Last, First" format, try "First Last"
    if (name.includes(',')) {
      const parts = name.split(',').map(p => p.trim());
      const reversed = `${parts[1]} ${parts[0]}`;
      const reversedLink = this.page.locator(`a:has-text("${reversed}"), span:has-text("${reversed}")`).first();
      const revVisible = await reversedLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (revVisible) {
        await reversedLink.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
    }

    // Strategy 4: click the first result card — but only if search returned results.
    // Guard: "No suggestions found" / "Search for workers" means empty results.
    // Avoid clicking filter chips (Worker Type, etc.) which are also list items.
    const noResults = await this.page.getByText(
      /no suggestions found|search for workers to see|no results found/i
    ).first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (noResults) {
      console.log(`[Benefits] selectWorker: Search returned no results for "${name}" — navigation-only`);
      await this.screenshot('benefits-worker-not-found');
      return;
    }
    // Use oj-list-item-layout (worker cards) specifically — avoid filter chip listitems
    const firstCard = this.page.locator('oj-list-item-layout').first();
    const cardVisible = await firstCard.isVisible({ timeout: 5_000 }).catch(() => false);
    if (cardVisible) {
      console.log(`[Benefits] selectWorker: No exact match for "${name}", clicking first result`);
      await firstCard.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    console.log(`[Benefits] selectWorker: Could not find worker "${name}" in results`);
    await this.screenshot('benefits-worker-not-found');
  }

  // ===================================================================
  // Enrollment (ESS)
  // ===================================================================

  /**
   * Open the enrollment wizard by clicking "Enroll Now" on the ESS page.
   * Falls back to welcome banner, then generic button search.
   */
  async openEnrollment(): Promise<void> {
    if (await this.enrollNowButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.enrollNowButton.click();
    } else if (await this.welcomeBannerAction.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.welcomeBannerAction.click();
    } else {
      // Try generic text match
      const enrollLink = this.page.getByRole('button', { name: /enroll/i }).first();
      if (await enrollLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await enrollLink.click();
      } else {
        console.log('[Benefits] No "Enroll Now" button found on ESS page');
        await this.screenshot('benefits-no-enroll-button');
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Report a life event from the ESS quick actions sidebar.
   * Clicks "Report a Life Event", then fills the event type and date.
   */
  async reportLifeEvent(eventType: string, eventDate?: string): Promise<void> {
    // Try multiple approaches to find the life event link
    const sidebarVisible = await this.quickActionReportLifeEvent.isVisible({ timeout: 5_000 }).catch(() => false);
    if (sidebarVisible) {
      await this.quickActionReportLifeEvent.click();
    } else {
      // Try alternative text patterns
      const altPatterns = [
        this.page.getByText('Report a Life Event', { exact: false }).first(),
        this.page.getByRole('link', { name: /life event/i }).first(),
        this.page.locator('a:has-text("Life Event")').first(),
        this.page.locator('[class*="quick-action"] a, [class*="quickAction"] a').filter({ hasText: /life event/i }).first(),
      ];
      let clicked = false;
      for (const alt of altPatterns) {
        const vis = await alt.isVisible({ timeout: 3_000 }).catch(() => false);
        if (vis) {
          await alt.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        console.log('[Benefits] "Report a Life Event" link not found — trying direct navigation');
        // Try navigating via the Benefits page menu
        const menuItems = this.page.locator('oj-navigation-list-item, [role="menuitem"], [role="tab"]').filter({ hasText: /life event/i }).first();
        const hasMenu = await menuItems.isVisible({ timeout: 3_000 }).catch(() => false);
        if (hasMenu) {
          await menuItems.click();
        } else {
          await this.screenshot('benefits-no-life-event-link');
          console.log('[Benefits] Life event link not available — skipping life event reporting');
          return;
        }
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Fill event type -- look for a select/combobox labeled "Life Event"
    const eventTypeField = this.page.getByLabel(/life event/i).first();
    if (await eventTypeField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await eventTypeField.click();
      await eventTypeField.fill(eventType);
      await this.page.waitForTimeout(1500);
      await eventTypeField.press('Tab');
      await this.waitForJET();
    }

    // Fill event date if provided
    if (eventDate) {
      const dateField = this.page.getByLabel(/date/i).first();
      if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.fillField(dateField, eventDate);
      }
    }

    // Submit the life event form
    const submitLifeEvent = this.page.getByRole('button', { name: /submit|ok|save/i }).first();
    if (await submitLifeEvent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitLifeEvent.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Open the Dependents management page from the ESS quick actions sidebar. */
  async manageDependents(): Promise<void> {
    const depVisible = await this.quickActionDependents.isVisible({ timeout: 5_000 }).catch(() => false);
    if (depVisible) {
      await this.quickActionDependents.click();
    } else {
      // Try alternative: look for a "Dependents" tab or link
      const altLink = this.page.getByText('Dependents', { exact: false }).first();
      if (await altLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await altLink.click();
      } else {
        console.log('[Benefits] "Dependents" link not found');
        return;
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** View the current enrollment summary on the ESS page. */
  async viewEnrollmentSummary(): Promise<void> {
    const inputVisible = await this.showBenefitsInput.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!inputVisible) {
      console.log('[Benefits] "Show Benefits" dropdown not visible, may not be on ESS page');
      await this.screenshot('benefits-no-show-dropdown');
      return;
    }

    await this.showBenefitsInput.click();
    await this.page.waitForTimeout(1000);
    // Select "Current enrollment" from the dropdown
    const currentOption = this.page.getByText('Current enrollment', { exact: false }).first();
    if (await currentOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await currentOption.click();
    } else {
      // Close dropdown if nothing to select
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Change the "Show Benefits" dropdown to a specific view.
   * Common values: "Current enrollment", "All plans", "Pending enrollment".
   */
  async setShowBenefitsFilter(filterValue: string): Promise<void> {
    const inputVisible = await this.showBenefitsInput.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!inputVisible) {
      console.log(`[Benefits] Cannot set show filter to "${filterValue}" - dropdown not visible`);
      return;
    }

    await this.showBenefitsInput.click();
    await this.page.waitForTimeout(500);
    await this.showBenefitsInput.fill('');
    await this.page.waitForTimeout(500);

    // Type the filter value to search within the dropdown
    const filterInput = this.showBenefitsFilterInput;
    if (await filterInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterInput.fill(filterValue);
      await this.page.waitForTimeout(1500);
    }

    // Select the matching option
    const option = this.page.getByText(filterValue, { exact: false }).first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    } else {
      await this.showBenefitsInput.press('Enter');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Enroll in a specific plan by name.
   * Finds the plan card and clicks its "Enroll" or "Modify" button.
   */
  async enrollInPlan(planName: string): Promise<void> {
    const button = this.enrollButtonForPlan(planName);
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click();
    } else {
      // Fall back to clicking the plan card text to open it
      const planCard = this.page.getByText(planName, { exact: false }).first();
      if (await planCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await planCard.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Modify an existing election by plan name.
   */
  async modifyElection(planName: string): Promise<void> {
    const modifyBtn = this.page.locator(`div:has-text("${planName}")`)
      .locator('button:has-text("Modify"), a:has-text("Modify")')
      .first();
    if (await modifyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modifyBtn.click();
    } else {
      const planCard = this.page.getByText(planName, { exact: false }).first();
      if (await planCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await planCard.click();
        await this.page.waitForTimeout(2000);
        const editBtn = this.page.getByRole('button', { name: /modify|edit|change/i }).first();
        if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await editBtn.click();
        }
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Select a plan by name in the enrollment wizard.
   * Looks for checkbox, radio button, clickable row, or card near the plan name.
   * If the exact plan name is not found, tries partial matches.
   */
  async selectPlan(planName: string): Promise<void> {
    // Try table row first (most precise for enrollment wizards)
    const tableRow = this.page.locator(`tr:has-text("${planName}")`).first();
    if (await tableRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const checkbox = tableRow.locator('input[type="checkbox"], input[type="radio"]').first();
      if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await checkbox.check();
      } else {
        await tableRow.click();
      }
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // Try list item (Redwood card layout)
    const listItem = this.page.locator(`li:has-text("${planName}")`).first();
    if (await listItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const checkbox = listItem.locator('input[type="checkbox"], input[type="radio"]').first();
      if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await checkbox.check();
      } else {
        await listItem.click();
      }
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // Try Enroll/Modify button on plan card
    const enrollBtn = this.enrollButtonForPlan(planName);
    if (await enrollBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enrollBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Try partial name match (e.g., "Life" matches "Basic Life Insurance 250K")
    const partialMatch = this.page.getByText(planName, { exact: false }).first();
    if (await partialMatch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await partialMatch.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    console.log(`[Benefits] Plan "${planName}" not found in enrollment wizard`);
  }

  /** Select a coverage level (e.g. "Employee Only", "Staff Only", option name). */
  async selectCoverage(coverageLevel: string): Promise<void> {
    // Try labeled field first
    const coverageField = this.page.getByLabel(/coverage|option/i).first();
    if (await coverageField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await coverageField.click();
      await coverageField.fill(coverageLevel);
      await this.page.waitForTimeout(1500);
      await coverageField.press('Tab');
      await this.waitForJET();
      return;
    }

    // Try select dropdown pattern
    const select = this.page.locator('select').filter({ hasText: /employee|staff|enrolled|coverage/i }).first();
    if (await select.isVisible({ timeout: 3000 }).catch(() => false)) {
      await select.selectOption({ label: coverageLevel });
      await this.waitForJET();
      return;
    }

    // Try radio button or clickable option
    const optionElement = this.page.getByText(coverageLevel, { exact: false }).first();
    if (await optionElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check if there's a radio/checkbox nearby
      const parent = optionElement.locator('xpath=ancestor::*[.//input[@type="radio" or @type="checkbox"]][1]').first();
      const radio = parent.locator('input[type="radio"], input[type="checkbox"]').first();
      if (await radio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await radio.check();
      } else {
        await optionElement.click();
      }
      await this.waitForJET();
      return;
    }

    console.log(`[Benefits] Coverage "${coverageLevel}" not found`);
  }

  /** Submit the current enrollment. */
  async submitEnrollment(): Promise<void> {
    if (await this.submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.submitButton.click();
    } else {
      try {
        await this.clickAdfButton('Submit');
      } catch {
        const btn = this.page.getByRole('button', { name: /submit|confirm/i }).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click();
        } else {
          // Previously: silent return + screenshot, which let downstream
          // verifyEnrollmentConfirmation accept any page as "success".
          await this.screenshot('benefits-no-submit');
          throw new Error('Benefits submitEnrollment: no Submit / Confirm button found on the page');
        }
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Handle any confirmation dialog (e.g. "Are you sure?")
    const yesBtn = this.page.getByRole('button', { name: /yes|ok/i }).first();
    if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yesBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // ===================================================================
  // Enrollment wizard navigation
  // ===================================================================

  /** Click Next in the enrollment wizard. */
  async clickEnrollmentNext(): Promise<void> {
    if (await this.nextButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.nextButton.click();
    } else if (await this.continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.continueButton.click();
    } else {
      try {
        await this.clickAdfButton('Next');
      } catch {
        // Wizard may not have a next step -- this is OK
        console.log('[Benefits] No Next/Continue button found');
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click Done to close confirmation dialog after submission. */
  async clickDone(): Promise<void> {
    if (await this.doneButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.doneButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
    // Also check for Close button (some dialogs use "Close" instead of "Done")
    const closeBtn = this.page.getByRole('button', { name: /close/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  // ===================================================================
  // Filter chips (Admin Activity Center)
  // ===================================================================

  /**
   * Apply a filter in the Benefits Activity Center using the filter chip buttons.
   */
  async filterByStatus(chipLabel: string): Promise<void> {
    const chip = this.page.locator(
      `div.oj-sp-filter-chip[role="button"]:has-text("${chipLabel}")`
    );
    const chipVisible = await chip.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!chipVisible) {
      console.log(`[Benefits] Filter chip "${chipLabel}" not visible`);
      return;
    }
    await chip.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Select a value within a filter chip popup.
   * After clicking a filter chip, a popup with options appears.
   * Always dismisses the popup after selection (via Escape).
   */
  async selectFilterValue(value: string): Promise<void> {
    const option = this.page.getByText(value, { exact: false }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
    // Dismiss filter dialog
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);
  }

  // ===================================================================
  // Dependent / Beneficiary management
  // ===================================================================

  /**
   * Add a dependent. Navigates to the dependents page if not already there.
   */
  async addDependent(name: string, relationship: string): Promise<void> {
    // Navigate to dependents if the sidebar link is visible
    if (await this.quickActionDependents.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.quickActionDependents.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Click "Add" button to open the add-dependent form
    const addBtn = this.page.getByRole('button', { name: /add/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Fill name fields
    const nameField = this.page.getByLabel(/name/i).first();
    if (await nameField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.fillField(nameField, name);
    }

    // Fill relationship
    const relField = this.page.getByLabel(/relationship/i).first();
    if (await relField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await relField.click();
      await relField.fill(relationship);
      await this.page.waitForTimeout(1500);
      await relField.press('Tab');
      await this.waitForJET();
    }

    // Save
    const saveBtn = this.page.getByRole('button', { name: /save|submit|ok/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Add a beneficiary for the current plan election.
   */
  async addBeneficiary(name: string, percentage: string): Promise<void> {
    const addBenBtn = this.page.getByRole('button', { name: /add beneficiary|add/i }).first();
    if (await addBenBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBenBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Fill beneficiary name
    const nameField = this.page.getByLabel(/beneficiary|name/i).first();
    if (await nameField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.fillField(nameField, name);
    }

    // Fill percentage
    const pctField = this.page.getByLabel(/percent|allocation/i).first();
    if (await pctField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.fillField(pctField, percentage);
    }

    // Save
    const saveBtn = this.page.getByRole('button', { name: /save|submit|ok/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // ===================================================================
  // Quick actions (ESS sidebar)
  // ===================================================================

  /** Open "Benefits Contacts" from the ESS quick actions sidebar. */
  async viewBenefitsContacts(): Promise<void> {
    if (await this.quickActionBenefitsContacts.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.quickActionBenefitsContacts.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Open "Before You Enroll" information from the ESS quick actions sidebar. */
  async viewBeforeYouEnroll(): Promise<void> {
    if (await this.quickActionBeforeYouEnroll.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.quickActionBeforeYouEnroll.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // ===================================================================
  // Verification / screenshots
  // ===================================================================

  /** Verify enrollment confirmation is displayed after submission. */
  async verifyEnrollmentConfirmation(): Promise<void> {
    // Look for confirmation text inside an alert/banner/dialog — NOT anywhere
    // on the page. The previous getByText(/submitted|.../).isVisible used to
    // match column headers, audit-log rows, and other unrelated text, which
    // made every navigation-only test silently pass.
    const confirmInBanner = this.page.locator(
      '[role="alert"], .af_messages, [class*="confirmation" i], [class*="success" i], [id*="confirm" i]'
    ).filter({ hasText: /submitted|confirmed|success|processed|completed/i }).first();
    if (await confirmInBanner.isVisible({ timeout: 8000 }).catch(() => false)) {
      await this.screenshot('benefits-enrollment-confirmation');
      return;
    }

    if (await this.confirmationBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.screenshot('benefits-enrollment-confirmation');
      return;
    }

    // No real success indicator. Used to log + return; now throw so the test
    // fails loudly instead of silently passing.
    await this.screenshot('benefits-enrollment-result');
    throw new Error('Benefits verifyEnrollmentConfirmation: no confirmation banner / alert / success message found after submit');
  }

  /** Verify the plan summary / enrollment summary is displayed. */
  async verifyPlanSummary(): Promise<void> {
    // The enrollment summary page shows plan cards with the programPlanField
    const summaryVisible = await this.programPlanField
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (summaryVisible) {
      await this.screenshot('benefits-plan-summary');
      return;
    }

    // Check for any plan-related text
    const planText = this.page.getByText(/plan|coverage|enrollment|benefits/i).first();
    if (await planText.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.screenshot('benefits-plan-summary');
      return;
    }

    // Still take a screenshot of whatever is on screen
    await this.screenshot('benefits-current-state');
  }

  /** Take a screenshot of the current benefits state. */
  async captureBenefitsState(name: string): Promise<void> {
    await this.screenshot(`benefits-${name}`);
  }

  // ===================================================================
  // Admin-specific enrollment actions
  // ===================================================================

  /** Open enrollment wizard from the admin Activity Center for the selected worker. */
  async openAdminEnrollment(): Promise<void> {
    // Strategy 1: button with enrollment text
    const enrollAction = this.page.getByRole('button', { name: /enroll|enrollment/i }).first();
    if (await enrollAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await enrollAction.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: link with enrollment text
    const actionLink = this.page.getByRole('link', { name: /enroll|enrollment/i }).first();
    if (await actionLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: look for action menu or kebab menu
    const actionsMenu = this.page.getByRole('button', { name: /actions|more/i }).first();
    if (await actionsMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionsMenu.click();
      await this.page.waitForTimeout(2000);
      const enrollMenuItem = this.page.getByText(/enroll|enrollment/i).first();
      if (await enrollMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await enrollMenuItem.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
    }

    console.log('[Benefits] No enrollment action found for worker');
    await this.screenshot('benefits-no-admin-enrollment');
  }

  /** Open life events management from the admin view for the selected worker. */
  async openAdminLifeEvents(): Promise<void> {
    // Strategy 1: button — but NOT filter chip buttons (those have class oj-sp-filter-chip)
    // Filter chips open dialogs (e.g. "Life Event Status" dialog), not the life events page.
    const lifeEventAction = this.page.locator(
      'button:not(.oj-sp-filter-chip):not([class*="filter-chip"])'
    ).filter({ hasText: /life events?/i }).first();
    if (await lifeEventAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await lifeEventAction.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: link
    const lifeEventLink = this.page.getByRole('link', { name: /life event/i }).first();
    if (await lifeEventLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lifeEventLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 3: tab navigation
    const lifeEventTab = this.page.getByText('Life Events', { exact: false }).first();
    if (await lifeEventTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lifeEventTab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    console.log('[Benefits] No life events action found for worker');
  }

  /**
   * Report a life event from the admin Activity Center.
   */
  async reportAdminLifeEvent(eventType: string, eventDate?: string): Promise<void> {
    await this.openAdminLifeEvents();

    // Click "Report" or "Add" to open the life event form
    const reportBtn = this.page.getByRole('button', { name: /report|add|create/i }).first();
    if (await reportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Fill event type
    const eventTypeField = this.page.getByLabel(/life event|event type/i).first();
    if (await eventTypeField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await eventTypeField.click();
      await eventTypeField.fill(eventType);
      await this.page.waitForTimeout(1500);
      await eventTypeField.press('Tab');
      await this.waitForJET();
    }

    // Fill event date
    if (eventDate) {
      const dateField = this.page.getByLabel(/date/i).first();
      if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.fillField(dateField, eventDate);
      }
    }

    // Submit
    const submitBtn = this.page.getByRole('button', { name: /submit|save|ok/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Navigate between tabs in the worker detail view (admin or ESS).
   */
  async selectTab(tabIndex: number): Promise<void> {
    const tab = this.navTabs.nth(tabIndex);
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }
}
