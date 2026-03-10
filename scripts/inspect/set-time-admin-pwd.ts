import dotenv from "dotenv";
dotenv.config();
import { scimLookupUser, scimResetPassword } from "../lib/hcm-rest-api";

const baseUrl = (process.env.ORACLE_HCM_URL || "").replace(/\/$/, "");

async function main() {
  const user = await scimLookupUser(baseUrl, "uat.bot_time_admin");
  if (user === null) {
    console.log("User not found in SCIM — Oracle may not have created the account yet");
    return;
  }
  console.log("SCIM user:", JSON.stringify(user));

  // Two-phase password set (Oracle rejects reuse)
  const tempPwd = "TempReset!2026@x";
  const finalPwd = "WinBuildSend!1951@cru";

  let ok = await scimResetPassword(baseUrl, user.id, tempPwd);
  console.log("Temp password set:", ok);
  if (ok) {
    ok = await scimResetPassword(baseUrl, user.id, finalPwd);
    console.log("Final password set:", ok);
  }
}
main().catch(e => console.error(e.message));
