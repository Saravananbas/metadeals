const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const TO_DELETE = [
  "Fashion (Men)",
  "Fashion (Women)",
  "Mobile & Tablets",
  "Mobile & Computers",
  "Wallet",
];

async function removeSpecificCategories() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("Searching for categories to remove:", TO_DELETE);

    for (const name of TO_DELETE) {
      const match = await pool.query(
        'SELECT id, name, slug, "parentId" FROM "Category" WHERE LOWER(name) = LOWER($1) OR slug = LOWER($2)',
        [name, name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")]
      );

      if (match.rows.length === 0) {
        console.log(`- Not found: "${name}"`);
        continue;
      }

      for (const cat of match.rows) {
        console.log(`Processing "${cat.name}" (ID: ${cat.id})...`);

        // Check if there are deals attached
        const deals = await pool.query('SELECT count(*)::int as count FROM "Deal" WHERE "categoryId" = $1', [cat.id]);
        if (deals.rows[0].count > 0) {
          // Find fallback category (e.g. Fashion & Apparel or Mobiles & Computers or general)
          const fallback = await pool.query(
            'SELECT id, name FROM "Category" WHERE id != $1 AND "parentId" IS NULL LIMIT 1',
            [cat.id]
          );
          if (fallback.rows.length > 0) {
            await pool.query('UPDATE "Deal" SET "categoryId" = $1 WHERE "categoryId" = $2', [fallback.rows[0].id, cat.id]);
            console.log(`  Reassigned ${deals.rows[0].count} deals from "${cat.name}" to fallback "${fallback.rows[0].name}".`);
          }
        }

        // Check if there are children attached; reassign them to null or parent
        const children = await pool.query('SELECT id, name FROM "Category" WHERE "parentId" = $1', [cat.id]);
        if (children.rows.length > 0) {
          console.log(`  Found ${children.rows.length} subcategories under "${cat.name}". Detaching...`);
          await pool.query('UPDATE "Category" SET "parentId" = NULL WHERE "parentId" = $1', [cat.id]);
        }

        // Delete the category
        await pool.query('DELETE FROM "Category" WHERE id = $1', [cat.id]);
        console.log(`  ✅ Deleted category: "${cat.name}"`);
      }
    }

    const total = await pool.query('SELECT count(*)::int as count FROM "Category"');
    console.log("Remaining categories count:", total.rows[0].count);
  } finally {
    await pool.end();
  }
}

removeSpecificCategories().catch(console.error);

