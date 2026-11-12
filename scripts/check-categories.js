const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT count(id)::int as count FROM "Category"');
    console.log("Current Category count in DB:", res.rows[0]);
    const sample = await pool.query('SELECT id, name, slug, "parentId" FROM "Category" ORDER BY name ASC LIMIT 10');
    console.log("Sample 10 categories:", sample.rows);
  } finally {
    await pool.end();
  }
}

check();

