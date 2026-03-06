import dotenv from "dotenv";
dotenv.config();
import { getAccessToken, readSheetTab } from "../lib/google-sheets";

async function main() {
  const token = await getAccessToken();
  const sheetId = "1oJmPmQJbJPt61PLow6bPSmHmGOPZnS2edTHIICIKLo8";

  const tabs = ["Core HR", "Payroll", "Absence Management", "Benefits", "Time and Labor", "Journeys", "Workforce Compensation", "MPDX", "SAA", "Other Functions", "OneApp"];

  const errorCounts: Record<string, string[]> = {};
  const samples: Record<string, {testId: string, msg: string}[]> = {};

  for (const tab of tabs) {
    let data: any[];
    try { data = await readSheetTab(token, sheetId, tab); } catch { continue; }
    if (!data || data.length < 2) continue;

    for (const row of data.slice(1)) {
      const status = String(row[9] || "").trim();
      if (status !== "Failed") continue;
      const testId = String(row[0] || "").trim();
      const actual = String(row[10] || "").trim();
      if (!actual) continue;

      let category: string;
      if (actual.includes("auth_cred_submit") || actual.includes("credentials")) category = "Login: credentials rejected";
      else if (actual.includes("Timeout") || actual.includes("timeout") || actual.includes("420000ms") || actual.includes("exceeded")) category = "Timeout";
      else if (actual.includes("locator") || actual.includes("selector")) category = "Locator/element not found";
      else if (actual.includes("Person Management")) category = "Navigator: Person Management not found";
      else if (actual.includes("New Person")) category = "Navigator: New Person not found";
      else if (actual.includes("No person number")) category = "Missing person number in field data";
      else category = "Other";

      if (!errorCounts[category]) { errorCounts[category] = []; samples[category] = []; }
      errorCounts[category].push(testId);
      if (samples[category].length < 3) samples[category].push({testId, msg: actual.slice(0, 300)});
    }
  }

  console.log("=== Failed Test Error Categories (All Modules) ===\n");
  for (const [cat, tests] of Object.entries(errorCounts).sort((a,b) => b[1].length - a[1].length)) {
    console.log(`${cat}: ${tests.length} tests`);
    console.log(`  IDs: ${tests.slice(0, 8).join(", ")}${tests.length > 8 ? ` ... +${tests.length - 8} more` : ""}`);
    for (const s of samples[cat]) {
      console.log(`  Sample (${s.testId}): ${s.msg}`);
    }
    console.log();
  }
}
main().catch(e => console.error(e.message));
