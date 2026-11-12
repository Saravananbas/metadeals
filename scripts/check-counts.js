const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function check() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [a, b] = await Promise.all([
      p.query('SELECT count(*)::int as c FROM "Category" WHERE "parentId" IS NULL'),
      p.query('SELECT count(*)::int as c FROM "Category" WHERE "parentId" IS NOT NULL'),
    ]);
    console.log("Parents:", a.rows[0].c, "Subcategories:", b.rows[0].c);
  } finally {
    await p.end();
  }
}

check().catch(console.error);

