// Seeds the minimum rows the automated tests need into a DISPOSABLE database (name must contain "test"):
// one active admin with 2FA, one category, one merchant. Idempotent.
import "dotenv/config";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/[^/?]*test[^/?]*(\?|$)/i.test(url)) throw new Error("Refusing to seed: DATABASE_URL must point at a database whose name contains 'test'.");
  const db = getDatabase();
  await db.user.upsert({ where: { email: "zz-test-admin@example.test" }, update: {}, create: { email: "zz-test-admin@example.test", name: "Test Admin", role: "SUPER_ADMIN", status: "ACTIVE", totpEnabledAt: new Date() } });
  await db.category.upsert({ where: { slug: "zz-test-category" }, update: {}, create: { slug: "zz-test-category", name: "Test category" } });
  await db.merchant.upsert({ where: { slug: "zz-test-store" }, update: {}, create: { slug: "zz-test-store", name: "Test store", websiteUrl: "https://www.example-store.in" } });
  console.log("fixtures ready");
  await disconnectDatabase();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
