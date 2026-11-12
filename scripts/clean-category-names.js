const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function exactMatchUpdate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Exact name alignment to spreadsheet
    await pool.query(`UPDATE "Category" SET name = 'Laptops', slug = 'laptops' WHERE name = 'Laptops & Computers' OR slug = 'laptops-computers'`);
    await pool.query(`UPDATE "Category" SET name = 'Beauty & Personal Care', slug = 'beauty-personal-care' WHERE slug = 'beauty'`);
    await pool.query(`UPDATE "Category" SET name = 'Home & Kitchen', slug = 'home-kitchen' WHERE slug = 'home'`);
    await pool.query(`UPDATE "Category" SET name = 'Sports & Fitness', slug = 'sports-fitness' WHERE slug = 'sports'`);
    await pool.query(`UPDATE "Category" SET name = 'Electronics', slug = 'electronics' WHERE slug = 'electronics'`);

    console.log("Updated exact category names.");
  } finally {
    await pool.end();
  }
}

exactMatchUpdate();

