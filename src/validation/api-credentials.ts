/**
 * Resolve REST API credentials for pre-flight checks and outcome validation.
 *
 * Requires ORACLE_API_USERNAME + ORACLE_API_PASSWORD env vars in .env.
 * Falls back to current bot account or bot_hr_admin from credentials file.
 */
import { getBotCredentials } from '../config/bot-users';
import type { BasicAuthCredentials } from '../../scripts/lib/hcm-rest-api';

export function resolveApiCredentials(): BasicAuthCredentials {
  // 1. Dedicated API user from env vars
  const apiUser = process.env.ORACLE_API_USERNAME;
  const apiPass = process.env.ORACLE_API_PASSWORD;
  if (apiUser && apiPass) {
    return { username: apiUser, password: apiPass };
  }

  // 2. Current bot account
  const botAccount = process.env.PARALLEL_BOT_ACCOUNT;
  if (botAccount) {
    const creds = getBotCredentials(botAccount);
    if (creds) {
      return { username: creds.username, password: creds.password };
    }
  }

  // 3. Fallback to bot_hr_admin from credentials file
  const fallback = getBotCredentials('bot_hr_admin');
  if (fallback) {
    return { username: fallback.username, password: fallback.password };
  }

  throw new Error('No REST API credentials available. Set ORACLE_API_USERNAME and ORACLE_API_PASSWORD in .env');
}
