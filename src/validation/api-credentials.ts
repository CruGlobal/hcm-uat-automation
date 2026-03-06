/**
 * Resolve REST API credentials for pre-flight checks and outcome validation.
 *
 * Priority:
 * 1. ORACLE_API_USERNAME + ORACLE_API_PASSWORD env vars (dedicated API user)
 * 2. Current bot account (PARALLEL_BOT_ACCOUNT from bot-credentials.json)
 * 3. Fallback: bot_hr_admin
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

  // 3. Fallback to bot_hr_admin
  const fallback = getBotCredentials('bot_hr_admin');
  if (fallback) {
    return { username: fallback.username, password: fallback.password };
  }

  // Last resort — will likely 401 but lets the caller handle it
  return { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };
}
