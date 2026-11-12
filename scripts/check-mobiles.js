const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT id, name, slug, "parentId" FROM "Category" WHERE LOWER(name) LIKE \'%mobile%\' OR LOWER(name) LIKE \'%tablet%\' OR LOWER(name) LIKE \'%computer%\'');
    console.log("Matching categories:", res.rows);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);

