import { getBotForTester, getBotCredentials } from './bot-users';
import type { UATTestCase } from '../data/types';

/** Resolved credentials for a test run. */
export interface ResolvedUser {
  username: string;
  password: string;
  /** TOTP secret for Okta MFA. Undefined = direct Oracle login (no SSO). */
  totpSecret?: string;
  /** botName of the bot user. All tests use bot users. */
  botName: string;
  /** Original sheetName from the UAT Plan (for logging). */
  sheetName: string;
}

/**
 * Tracks which bot account is currently logged in to Oracle HCM.
 * Uses botName (not sheetName) so that different testers sharing the
 * same bot account don't trigger unnecessary re-logins.
 */
let _currentBotName: string | null = null;

/** Get the botName of the currently logged-in user (null = not logged in). */
export function getCurrentUser(): string | null {
  return _currentBotName;
}

/** Set the currently logged-in user after a successful login. */
export function setCurrentUser(botName: string | null): void {
  _currentBotName = botName;
}

/**
 * Resolve which bot user should run a given test case.
 * All tests run with bot users — never falls back to SSO/default user.
 *
 * When PARALLEL_BOT_ACCOUNT is set (clone mode), uses the clone's credentials
 * for login while keeping the base bot's identity for test routing.
 *
 * Throws if the bot's credentials are missing from .config/bot-credentials.json.
 */
export function resolveUser(tc: UATTestCase): ResolvedUser {
  const bot = getBotForTester(tc.testerName, tc.module, tc.testId);

  // Check if we should use a clone account for login
  const accountOverride = process.env.PARALLEL_BOT_ACCOUNT;
  const loginBotName = accountOverride || bot.botName;

  const creds = getBotCredentials(loginBotName);
  if (!creds) {
    throw new Error(
      `Bot user '${loginBotName}' credentials not found in .config/bot-credentials.json. ` +
      `Test ${tc.testId} requires tester "${tc.testerName}" (bot: ${bot.botName}). ` +
      `Add credentials to .config/bot-credentials.json.`
    );
  }

  return {
    username: creds.username,
    password: creds.password,
    totpSecret: creds.totpSecret,
    // Use the account name as botName so session tracking works per-account
    botName: loginBotName,
    sheetName: bot.sheetName,
  };
}

/** Check if the current test needs a different user than who's logged in. */
export function needsSwitch(tc: UATTestCase): boolean {
  const resolved = resolveUser(tc);
  return resolved.botName !== _currentBotName;
}
