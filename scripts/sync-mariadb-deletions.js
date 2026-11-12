const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const TO_DELETE = [
  'cmw1dk4fx0003c0fag39zp1ag', // Fashion (Men)
  'cmw1dk4h40004c0fajtq4tv2b', // Fashion (Women)
  'c169dc67f48f546923ffa3047', // Wallet
  'cmw1dk4b10000c0falytnemkt', // Mobiles & Tablets
  'c94d1a690ed8669fdd16b17f4', // Mobiles & Computers
];

async function syncMariaDbDeletions() {
  if (process.env.ALLOW_MARIADB_CATEGORY_DELETE !== "true" || !process.argv.includes("--confirm-delete")) {
    throw new Error("Refusing to delete categories. Set ALLOW_MARIADB_CATEGORY_DELETE=true and pass --confirm-delete after reviewing the target database.");
  }

  const connectionString = process.env.MARIADB_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MARIADB_DATABASE_URL must be configured outside the script.");
  }

  const url = new URL(connectionString);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: true }
  });

  try {
    console.log("Connected to MariaDB Staging.");
    for (const id of TO_DELETE) {
      const [rows] = await conn.execute('SELECT id, name FROM Category WHERE id = ?', [id]);
      if (rows.length > 0) {
        console.log(`Deleting ${rows[0].name} (${id}) from MariaDB...`);
        // Reassign deals if any
        await conn.execute('UPDATE Deal SET categoryId = (SELECT id FROM Category WHERE id != ? AND parentId IS NULL LIMIT 1) WHERE categoryId = ?', [id, id]);
        // Detach children
        await conn.execute('UPDATE Category SET parentId = NULL WHERE parentId = ?', [id]);
        // Delete
        await conn.execute('DELETE FROM Category WHERE id = ?', [id]);
        console.log(`Deleted ${rows[0].name}`);
      }
    }
    const [count] = await conn.execute('SELECT count(*) as count FROM Category');
    console.log("MariaDB Category count:", count[0].count);
  } finally {
    await conn.end();
  }
}

syncMariaDbDeletions().catch(console.error);

