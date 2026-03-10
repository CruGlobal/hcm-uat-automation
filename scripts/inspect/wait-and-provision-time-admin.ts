import dotenv from "dotenv";
dotenv.config();
import { scimLookupUser, scimResetPassword } from "../lib/hcm-rest-api";

const baseUrl = (process.env.ORACLE_HCM_URL || "").replace(/\/$/, "");
const USERNAME = "uat.bot_time_admin";
const FINAL_PWD = "WinBuildSend!1951@cru";
const TEMP_PWD = "TempReset!2026@x";
const CHECK_INTERVAL_MS = 120_000; // 2 minutes between checks
const MAX_CHECKS = 15; // 30 minutes max

async function main() {
  console.log(`Waiting for Oracle to auto-create user account: ${USERNAME}`);
  console.log(`Checking every ${CHECK_INTERVAL_MS / 1000}s, max ${MAX_CHECKS} attempts...`);

  for (let i = 1; i <= MAX_CHECKS; i++) {
    const user = await scimLookupUser(baseUrl, USERNAME);
    if (user) {
      console.log(`\n[${i}] User found: ${JSON.stringify(user)}`);
      // Set password via two-phase SCIM
      let ok = await scimResetPassword(baseUrl, user.id, TEMP_PWD);
      console.log(`Temp password set: ${ok}`);
      if (ok) {
        ok = await scimResetPassword(baseUrl, user.id, FINAL_PWD);
        console.log(`Final password set: ${ok}`);
      }
      console.log("\nDone. Next step: npx tsx scripts/provision-bot-accounts.ts bot_time_admin");
      return;
    }
    console.log(`[${i}/${MAX_CHECKS}] Not found yet, waiting ${CHECK_INTERVAL_MS / 1000}s...`);
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }
  console.log("Timed out waiting for user account creation.");
}
main().catch(e => console.error(e.message));
