import "server-only";
import { demoDeals } from "./demo-data";

/** Replace this source boundary with an approved repository in the deal-management milestone. */
export async function getHomepageDeals() {
  return { source: "demo" as const, deals: demoDeals };
}
