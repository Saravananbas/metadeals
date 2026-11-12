import { getDatabase } from "../src/server/db/client";

async function main() {
  const db = getDatabase();
  try {
    const columns = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'PublicationAuthorization'
      ORDER BY ordinal_position;
    `);
    console.log("COLUMNS:", JSON.stringify(columns, null, 2));

    const enumVals = await db.$queryRawUnsafe(`
      SELECT e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'PublicationAuthStatus'
      ORDER BY e.enumsortorder;
    `);
    console.log("ENUM_VALS:", JSON.stringify(enumVals, null, 2));

    const migrations = await db.$queryRawUnsafe(`
      SELECT id, migration_name, finished_at 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC;
    `);
    console.log("MIGRATIONS:", JSON.stringify(migrations, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    process.exit(0);
  }
}

main();
