const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const IDS_TO_DELETE = [
  'cmw1dk4b10000c0falytnemkt', // Mobiles & Tablets
  'c94d1a690ed8669fdd16b17f4', // Mobiles & Computers
];

async function deleteMobileCats() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const id of IDS_TO_DELETE) {
      const match = await pool.query('SELECT id, name FROM "Category" WHERE id = $1', [id]);
      if (match.rows.length === 0) {
        console.log("Not found ID:", id);
        continue;
      }
      const cat = match.rows[0];
      console.log(`Deleting "${cat.name}" (${cat.id})...`);

      // Reassign deals if any
      const deals = await pool.query('SELECT count(*)::int as count FROM "Deal" WHERE "categoryId" = $1', [id]);
      if (deals.rows[0].count > 0) {
        const fallback = await pool.query('SELECT id, name FROM "Category" WHERE id != $1 AND "parentId" IS NULL LIMIT 1', [id]);
        if (fallback.rows.length > 0) {
          await pool.query('UPDATE "Deal" SET "categoryId" = $1 WHERE "categoryId" = $2', [fallback.rows[0].id, id]);
          console.log(`Reassigned ${deals.rows[0].count} deals to ${fallback.rows[0].name}`);
        }
      }

      // Detach children if any
      await pool.query('UPDATE "Category" SET "parentId" = NULL WHERE "parentId" = $1', [id]);

      // Delete category
      await pool.query('DELETE FROM "Category" WHERE id = $1', [id]);
      console.log(`✅ Successfully deleted ${cat.name}`);
    }

    // Verify all requested categories:
    // Fashion (Men), Fashion (Women), Mobile & Tablets, Mobile & Computers, Wallet
    const verify = await pool.query(`
      SELECT id, name, slug FROM "Category" 
      WHERE LOWER(name) IN ('fashion (men)', 'fashion (women)', 'mobile & tablets', 'mobiles & tablets', 'mobile & computers', 'mobiles & computers', 'wallet')
    `);
    console.log("Remaining matching categories (should be empty):", verify.rows);
  } finally {
    await pool.end();
  }
}

deleteMobileCats().catch(console.error);

