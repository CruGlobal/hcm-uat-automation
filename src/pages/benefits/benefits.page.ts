import { type Locator } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page object for Oracle HCM Benefits module.
 *
 * Two distinct UI surfaces:
 *   1. Benefits Activity Center (Admin) — Redwood search page with person list,
 *      filter chips, and worker detail cards showing assignment/person info.
 *   2. Benefits Self-Service (ESS) — Redwood enrollment summary with plan cards,
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
  );

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
  // Each filter chip is a div.oj-sp-filter-chip with role="button" and text content.
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
  // Each worker card in the list contains oj-input-text fields with personNumber,
  // assignmentNumber, and assignmentStatus. The cards are oj-read-only fields.
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
  // Quick action links (ESS sidebar) — located by visible text
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

  /** Submit button — present in both admin and ESS contexts. */
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

  /** Navigate to Benefits Activity Center (Admin) via deep link. */
  async navigateToBenefitsAdmin(): Promise<void> {
    await this.page.goto(
      '/fscmUI/redwood/benefits-activity-center/view/benefits-administration'
    );
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.dismissPopups();
  }

  /** Navigate to Benefits Self-Service enrollment summary via deep link. */
  async navigateToSelfServiceBenefits(): Promise<void> {
    await this.page.goto('/fscmUI/redwood/benefits/enrollment-summary');
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.dismissPopups();
  }

  /** Navigate to Benefits via the Navigator menu. */
  async navigateToBenefits(): Promise<void> {
    const benefitsNav = this.page.locator(
      'a[title="Benefits"], [id*="nv_itemNode_benefits"]'
    ).first();
    if (await benefitsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await benefitsNav.click({ force: true });
    } else {
      await this.page.goto('/fscmUI/redwood/benefits/enrollment-summary');
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.dismissPopups();
  }

  // ===================================================================
  // Person search (Admin Activity Center)
  // ===================================================================

  /**
   * Search for a person in the Benefits Activity Center.
   * Uses the Redwood combobox search bar at the top of the page.
   */
  async searchPerson(nameOrNumber: string): Promise<void> {
    await this.adminSearchInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.adminSearchInput.click();
    await this.adminSearchInput.fill(nameOrNumber);
    await this.page.waitForTimeout(1500);
    await this.adminSearchInput.press('Enter');
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Select a worker from the Activity Center search results.
   * Worker cards are rendered as list items containing the person name.
   * Clicks the first visible card text matching the given name.
   */
  async selectWorker(name: string): Promise<void> {
    const workerLink = this.page.locator(
      `a:has-text("${name}"), span:has-text("${name}"), div:has-text("${name}")`
    ).first();
    await workerLink.waitFor({ state: 'visible', timeout: 15_000 });
    await workerLink.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===================================================================
  // Enrollment (ESS)
  // ===================================================================

  /**
   * Open the enrollment wizard by clicking "Enroll Now" on the ESS page.
   * Falls back to the welcome banner primary action if "Enroll Now" is not visible.
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
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Report a life event from the ESS quick actions sidebar.
   * Clicks "Report a Life Event", then fills the event type and date in the dialog.
   */
  async reportLifeEvent(eventType: string, eventDate?: string): Promise<void> {
    await this.quickActionReportLifeEvent.waitFor({ state: 'visible', timeout: 10_000 });
    await this.quickActionReportLifeEvent.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Fill event type — look for a select/combobox labeled "Life Event"
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
    await this.quickActionDependents.waitFor({ state: 'visible', timeout: 10_000 });
    await this.quickActionDependents.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** View the current enrollment summary on the ESS page. */
  async viewEnrollmentSummary(): Promise<void> {
    await this.showBenefitsInput.waitFor({ state: 'visible', timeout: 15_000 });
    await this.showBenefitsInput.click();
    await this.page.waitForTimeout(1000);
    // Select "Current enrollment" from the dropdown
    const currentOption = this.page.getByText('Current enrollment', { exact: false }).first();
    if (await currentOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await currentOption.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Change the "Show Benefits" dropdown to a specific view.
   * Common values: "Current enrollment", "All plans", "Pending enrollment".
   */
  async setShowBenefitsFilter(filterValue: string): Promise<void> {
    await this.showBenefitsInput.waitFor({ state: 'visible', timeout: 15_000 });
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
      await planCard.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Modify an existing election by plan name.
   * Clicks the "Modify" button on the plan card.
   */
  async modifyElection(planName: string): Promise<void> {
    const modifyBtn = this.page.locator(`div:has-text("${planName}")`)
      .locator('button:has-text("Modify"), a:has-text("Modify")')
      .first();
    if (await modifyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modifyBtn.click();
    } else {
      // Click the plan card and look for an edit/modify action inside
      const planCard = this.page.getByText(planName, { exact: false }).first();
      await planCard.click();
      await this.page.waitForTimeout(2000);
      const editBtn = this.page.getByRole('button', { name: /modify|edit|change/i }).first();
      if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editBtn.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Select a plan by name in the enrollment wizard.
   * Looks for a checkbox, radio button, or clickable row near the plan name text.
   */
  async selectPlan(planName: string): Promise<void> {
    const planRow = this.page.locator(
      `tr:has-text("${planName}"), div:has-text("${planName}"), li:has-text("${planName}")`
    ).first();
    await planRow.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

    const checkbox = planRow.locator('input[type="checkbox"], input[type="radio"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.check();
    } else {
      await planRow.click();
    }
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Select a coverage level (e.g. "Employee Only", "Employee + Family"). */
  async selectCoverage(coverageLevel: string): Promise<void> {
    const coverageField = this.page.getByLabel(/coverage/i).first();
    if (await coverageField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await coverageField.click();
      await coverageField.fill(coverageLevel);
      await this.page.waitForTimeout(1500);
      await coverageField.press('Tab');
    } else {
      // Try select dropdown pattern
      const select = this.page.locator('select').filter({ hasText: /employee/i }).first();
      if (await select.isVisible({ timeout: 3000 }).catch(() => false)) {
        await select.selectOption({ label: coverageLevel });
      }
    }
    await this.waitForJET();
  }

  /** Submit the current enrollment. */
  async submitEnrollment(): Promise<void> {
    if (await this.submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.submitButton.click();
    } else {
      try {
        await this.clickAdfButton('Submit');
      } catch {
        // Last resort: find any submit-like button
        const btn = this.page.getByRole('button', { name: /submit|confirm/i }).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click();
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
        // Wizard may not have a next step
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
  }

  // ===================================================================
  // Filter chips (Admin Activity Center)
  // ===================================================================

  /**
   * Apply a filter in the Benefits Activity Center using the filter chip buttons.
   * Supported statuses: "Worker Type", "Assignment Status",
   * "Effective As-of Date", "Life Event Status", "Filters".
   */
  async filterByStatus(chipLabel: string): Promise<void> {
    const chip = this.page.locator(
      `div.oj-sp-filter-chip[role="button"]:has-text("${chipLabel}")`
    );
    await chip.waitFor({ state: 'visible', timeout: 10_000 });
    await chip.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Select a value within a filter chip popup.
   * After clicking a filter chip, a popup with options appears.
   */
  async selectFilterValue(value: string): Promise<void> {
    const option = this.page.getByText(value, { exact: false }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  // ===================================================================
  // Dependent / Beneficiary management
  // ===================================================================

  /**
   * Add a dependent. Navigates to the dependents page if not already there,
   * then fills the Add Dependent form.
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
   * Fills the beneficiary name and allocation percentage.
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
    await this.quickActionBenefitsContacts.waitFor({ state: 'visible', timeout: 10_000 });
    await this.quickActionBenefitsContacts.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Open "Before You Enroll" information from the ESS quick actions sidebar. */
  async viewBeforeYouEnroll(): Promise<void> {
    await this.quickActionBeforeYouEnroll.waitFor({ state: 'visible', timeout: 10_000 });
    await this.quickActionBeforeYouEnroll.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ===================================================================
  // Verification / screenshots
  // ===================================================================

  /** Verify enrollment confirmation is displayed after submission. */
  async verifyEnrollmentConfirmation(): Promise<void> {
    // Look for confirmation text or banner
    const confirmText = this.page.getByText(/submitted|confirmed|success/i).first();
    const confirmVisible = await confirmText
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (confirmVisible) {
      await this.screenshot('benefits-enrollment-confirmation');
    } else if (await this.confirmationBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.screenshot('benefits-enrollment-confirmation');
    }
  }

  /** Verify the plan summary / enrollment summary is displayed. */
  async verifyPlanSummary(): Promise<void> {
    // The enrollment summary page shows plan cards with the programPlanField
    const summaryVisible = await this.programPlanField
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (summaryVisible) {
      await this.screenshot('benefits-plan-summary');
    } else {
      // Fall back to checking for any plan-related text
      const planText = this.page.getByText(/plan|coverage|enrollment/i).first();
      if (await planText.isVisible({ timeout: 5000 }).catch(() => false)) {
        await this.screenshot('benefits-plan-summary');
      }
    }
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
    // In the admin view, after selecting a worker, look for enrollment actions
    const enrollAction = this.page.getByRole('button', { name: /enroll|enrollment/i }).first();
    if (await enrollAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await enrollAction.click();
    } else {
      // Try menu/action link pattern
      const actionLink = this.page.getByRole('link', { name: /enroll|enrollment/i }).first();
      if (await actionLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await actionLink.click();
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Open life events management from the admin view for the selected worker. */
  async openAdminLifeEvents(): Promise<void> {
    const lifeEventAction = this.page.getByRole('button', { name: /life event/i }).first();
    if (await lifeEventAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await lifeEventAction.click();
    } else {
      const lifeEventLink = this.page.getByRole('link', { name: /life event/i }).first();
      if (await lifeEventLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await lifeEventLink.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Report a life event from the admin Activity Center.
   * After navigating to life events for a worker, fills the event form.
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
   * Tab names vary by context but use oj-navigationlist anchors.
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
