const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function check() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await p.query(`
      SELECT c.id, c.name, c.slug, c."parentId", count(d.id)::int as count 
      FROM "Category" c 
      LEFT JOIN "Deal" d ON d."categoryId" = c.id 
      GROUP BY c.id, c.name, c.slug, c."parentId" 
      HAVING count(d.id) > 0
    `);
    console.log("Categories with deals:", r.rows);
  } finally {
    await p.end();
  }
}

check().catch(console.error);

