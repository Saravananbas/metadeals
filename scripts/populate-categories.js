/**
 * Script to populate hierarchical Categories in PostgreSQL (and sync to MariaDB if requested).
 */
const { Pool: PgPool } = require("pg");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// User specified hierarchy
const TAXONOMY = [
  {
    name: "Baby Care",
    children: [
      "Toys",
      "Diapers",
      "Strollers & Prams"
    ]
  },
  {
    name: "Beauty & Personal Care",
    children: [
      "Personal Care"
    ]
  },
  {
    name: "Electronics",
    children: [
      "TV",
      "Headphones",
      "Refrigerators",
      "Wearable Devices",
      "Kitchen Appliances",
      "Gaming Consoles",
      "Cameras",
      "Home Entertainment System",
      "Washing Machine",
      "Air Purifier",
      "Air Conditioners"
    ]
  },
  {
    name: "Fashion & Apparel",
    children: [
      "Kids Fashion",
      "Men's Fashion",
      "Shoes",
      "Shirts & T-shirts",
      "Bags & Luggage",
      "Women's Fashion",
      "Sportswear",
      "Jewellery",
      "Jeans",
      "Watches",
      "Innerwear",
      "Sunglasses"
    ]
  },
  {
    name: "Food & Beverage Service",
    children: [
      "Food Delivery",
      "Grocery",
      "Dining Out & Restaurants",
      "Pizza"
    ]
  },
  {
    name: "Home & Kitchen",
    children: [
      "Cookware",
      "Storage Containers",
      "Pet Lovers",
      "Furniture",
      "Home Decor",
      "Bedsheets",
      "Indoor Lighting",
      "Garden & Outdoor"
    ]
  },
  {
    name: "Mobiles & Computers",
    children: [
      "Mobile Phones",
      "Tablets",
      "Laptops",
      "Printers",
      "Hard Drive",
      "Monitors",
      "Desktops",
      "Power Banks"
    ]
  },
  {
    name: "Movies & Entertainment",
    children: [
      "Movies",
      "Music",
      "OTA",
      "Games"
    ]
  },
  {
    name: "Recharge & Utility Bill Payments",
    children: [
      "Prepaid Recharge",
      "Postpaid Recharge",
      "Utility Bill Payments",
      "DTH Recharge",
      "Metro Card Recharge"
    ]
  },
  {
    name: "Sports & Fitness",
    children: [
      "Exercise & Gym",
      "Protein Powders",
      "Cricket",
      "Badminton",
      "Cycles",
      "Football"
    ]
  },
  {
    name: "Travels & Hotels",
    children: [
      "Cabs",
      "Flights",
      "Bus Tickets",
      "Hotels",
      "Train Tickets"
    ]
  },
  {
    name: "Wallet",
    children: []
  }
];

function generateCuid() {
  return "c" + crypto.randomBytes(12).toString("hex");
}

async function run() {
  const pg = new PgPool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Connected to PostgreSQL. Reading current categories...");
    const existing = await pg.query('SELECT id, slug, name, "parentId" FROM "Category"');
    const bySlug = new Map(existing.rows.map(r => [r.slug, r]));
    const byName = new Map(existing.rows.map(r => [r.name.toLowerCase().trim(), r]));

    console.log(`Found ${existing.rows.length} existing categories in PostgreSQL.`);

    let insertedCount = 0;
    let updatedCount = 0;

    for (const group of TAXONOMY) {
      const parentSlug = slugify(group.name);
      let parent = bySlug.get(parentSlug) || byName.get(group.name.toLowerCase().trim());

      if (!parent) {
        const id = generateCuid();
        const res = await pg.query(
          'INSERT INTO "Category" (id, slug, name, "parentId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, slug, name, "parentId"',
          [id, parentSlug, group.name, null]
        );
        parent = res.rows[0];
        bySlug.set(parentSlug, parent);
        byName.set(group.name.toLowerCase().trim(), parent);
        insertedCount++;
        console.log(`+ Created Parent Category: "${group.name}" (slug: ${parentSlug})`);
      } else {
        // Ensure name is clean and parentId is null for top-level if needed
        if (parent.parentId !== null) {
          await pg.query('UPDATE "Category" SET "parentId" = NULL, "updatedAt" = NOW() WHERE id = $1', [parent.id]);
          parent.parentId = null;
          updatedCount++;
        }
        console.log(`= Existing Parent Category: "${parent.name}" (slug: ${parent.slug})`);
      }

      // Children subcategories
      for (const childName of group.children) {
        // To avoid slug collision across different parents (e.g. "Personal Care" vs "Beauty & Personal Care"), prefix or ensure unique
        let childSlug = slugify(childName);
        let child = bySlug.get(childSlug);

        // If a child exists with this slug but has a different parent or is a top-level, make the slug unique if needed
        if (child && child.parentId && child.parentId !== parent.id) {
          childSlug = `${parentSlug}-${childSlug}`;
          child = bySlug.get(childSlug);
        }

        if (!child) {
          const id = generateCuid();
          const res = await pg.query(
            'INSERT INTO "Category" (id, slug, name, "parentId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, slug, name, "parentId"',
            [id, childSlug, childName, parent.id]
          );
          child = res.rows[0];
          bySlug.set(childSlug, child);
          byName.set(childName.toLowerCase().trim(), child);
          insertedCount++;
          console.log(`  + Created Subcategory: "${childName}" -> Parent: "${group.name}" (slug: ${childSlug})`);
        } else {
          // Link to parent if not linked
          if (child.parentId !== parent.id) {
            await pg.query('UPDATE "Category" SET "parentId" = $1, "updatedAt" = NOW() WHERE id = $2', [parent.id, child.id]);
            child.parentId = parent.id;
            updatedCount++;
            console.log(`  ~ Updated Parent for Subcategory: "${child.name}" -> Parent: "${group.name}"`);
          } else {
            console.log(`  = Existing Subcategory: "${child.name}" -> Parent: "${group.name}"`);
          }
        }
      }
    }

    const totalNow = await pg.query('SELECT COUNT(*) FROM "Category"');
    console.log(`\n🎉 Taxonomy population complete!`);
    console.log(`Created: ${insertedCount}, Updated: ${updatedCount}, Total in DB: ${totalNow.rows[0].count}`);
  } catch (err) {
    console.error("Error populating categories:", err);
  } finally {
    await pg.end();
  }
}

run();

