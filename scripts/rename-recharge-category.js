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

async function renameCategory() {
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mariaConfig = parseMariaDbConfig(process.env.HOSTINGER_MARIADB_URL);
  const mariaConn = await mariadb.createConnection(mariaConfig);

  const newName = "Recharges & Payments";
  const newSlug = "recharges-payments";

  try {
    console.log("Searching for 'Recharge & Utility' in PostgreSQL...");
    const res = await pgPool.query(
      `SELECT id, name, slug FROM "Category" WHERE LOWER(name) LIKE '%recharge%'`
    );
    console.log("Found matches in PG:", res.rows);

    for (const cat of res.rows) {
      if (cat.name.includes("Utility") || cat.name.includes("Payments") || cat.name.includes("Bill")) {
        console.log(`Renaming "${cat.name}" -> "${newName}" in PG...`);
        await pgPool.query(
          `UPDATE "Category" SET name = $1, slug = $2, "updatedAt" = NOW() WHERE id = $3`,
          [newName, newSlug, cat.id]
        );
        console.log(`Renaming "${cat.name}" -> "${newName}" in MariaDB...`);
        await mariaConn.query(
          `UPDATE Category SET name = ?, slug = ?, updatedAt = NOW() WHERE id = ?`,
          [newName, newSlug, cat.id]
        );
        console.log(`✅ Renamed category ${cat.id} successfully.`);
      }
    }
  } finally {
    await pgPool.end();
    await mariaConn.end();
  }
}

renameCategory().catch(console.error);

