const { Pool } = require("pg");
const mariadb = require("mariadb");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function parseMariaDbConfig(urlString) {
  const match = urlString.match(/^mysql:\/\/([^:]+):(.*)@([^:/]+)(?::(\d+))?\/(.*)$/);
  if (!match) throw new Error("Invalid MariaDB connection string format");
  return {
    host: match[3],
    port: Number(match[4] || 3306),
    user: match[1],
    password: match[2],
    database: match[5],
    connectTimeout: 8000,
  };
}

async function removeTravelDeals() {
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mariaConfig = parseMariaDbConfig(process.env.HOSTINGER_MARIADB_URL);
  const mariaConn = await mariadb.createConnection(mariaConfig);

  try {
    console.log("Searching for 'Travel Deals' in PostgreSQL...");
    const pgRes = await pgPool.query(
      'SELECT id, name, slug, "parentId" FROM "Category" WHERE LOWER(name) = LOWER($1) OR slug = LOWER($2)',
      ['Travel Deals', 'travel-deals']
    );

    if (pgRes.rows.length === 0) {
      console.log("Category 'Travel Deals' not found in PostgreSQL.");
    } else {
      for (const cat of pgRes.rows) {
        console.log(`Found "${cat.name}" (${cat.id}) in PG.`);

        // Find fallback category (e.g. Travels & Hotels or general top level)
        const fallback = await pgPool.query(
          'SELECT id, name FROM "Category" WHERE LOWER(name) = LOWER($1) OR (id != $2 AND "parentId" IS NULL) LIMIT 1',
          ['Travels & Hotels', cat.id]
        );
        const fallbackId = fallback.rows[0]?.id;

        // Reassign any deals in Travel Deals
        const deals = await pgPool.query('SELECT count(*)::int as count FROM "Deal" WHERE "categoryId" = $1', [cat.id]);
        if (deals.rows[0].count > 0 && fallbackId) {
          await pgPool.query('UPDATE "Deal" SET "categoryId" = $1 WHERE "categoryId" = $2', [fallbackId, cat.id]);
          console.log(`  Reassigned ${deals.rows[0].count} deals to "${fallback.rows[0].name}" in PG.`);
        }

        // Detach or reassign children
        await pgPool.query('UPDATE "Category" SET "parentId" = $1 WHERE "parentId" = $2', [fallbackId || null, cat.id]);

        // Delete from PG
        await pgPool.query('DELETE FROM "Category" WHERE id = $1', [cat.id]);
        console.log(`  ✅ Deleted "${cat.name}" from PostgreSQL.`);

        // Delete from MariaDB
        console.log(`Syncing deletion of "${cat.name}" (${cat.id}) to MariaDB...`);
        if (fallbackId) {
          await mariaConn.query('UPDATE Deal SET categoryId = ? WHERE categoryId = ?', [fallbackId, cat.id]);
          await mariaConn.query('UPDATE Category SET parentId = ? WHERE parentId = ?', [fallbackId, cat.id]);
        } else {
          await mariaConn.query('UPDATE Category SET parentId = NULL WHERE parentId = ?', [cat.id]);
        }
        await mariaConn.query('DELETE FROM Category WHERE id = ?', [cat.id]);
        console.log(`  ✅ Deleted "${cat.name}" from MariaDB.`);
      }
    }

    // Verify remaining in PG & MariaDB
    const pgCount = await pgPool.query('SELECT count(*)::int as count FROM "Category"');
    const mariaCount = await mariaConn.query('SELECT count(*) as count FROM Category');
    console.log(`Remaining categories: PG = ${pgCount.rows[0].count}, MariaDB = ${mariaCount[0].count}`);
  } finally {
    await pgPool.end();
    await mariaConn.end();
  }
}

removeTravelDeals().catch(console.error);

