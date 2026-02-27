import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
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
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // TODO: Implement Person Management search to find person
    const personSearch = getField(tc, 'Search for Person');
    if (personSearch) {
      // TODO: Use Person Management search (searchPerson helper removed)
      void personSearch; // placeholder until search is implemented
    }

    // TODO: Click "Create Work Relationship" action

    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
