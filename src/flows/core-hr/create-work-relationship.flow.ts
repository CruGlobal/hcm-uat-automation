import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { searchPerson } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Create Work Relationship
 * Tab: "Core - Create Work Relationship"
 * Searches for an existing person, then creates a new work relationship.
 */
export class CreateWorkRelationshipFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // Search for existing person
    const personSearch = getField(tc, 'Search for Person');
    if (personSearch) {
      await searchPerson(this.page, personSearch);
    }

    // TODO: Click "Create Work Relationship" action
    await this.page.locator('button:has-text("Create Work Relationship"), a:has-text("Create Work Relationship")').first().click();
    await this.person.waitForReady();

    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
