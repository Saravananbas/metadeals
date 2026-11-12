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

const TO_DELETE = [
  'cmw1dk4fx0003c0fag39zp1ag', // Fashion (Men)
  'cmw1dk4h40004c0fajtq4tv2b', // Fashion (Women)
  'c169dc67f48f546923ffa3047', // Wallet
  'cmw1dk4b10000c0falytnemkt', // Mobiles & Tablets
  'c94d1a690ed8669fdd16b17f4', // Mobiles & Computers
];

async function cleanMariaDb() {
  const mariaUrl = process.env.HOSTINGER_MARIADB_URL;
  const config = parseMariaDbConfig(mariaUrl);
  const conn = await mariadb.createConnection(config);
  try {
    console.log("Connected to Hostinger MariaDB via mariadb driver.");
    // Reassign any deals in these categories
    for (const id of TO_DELETE) {
      const deals = await conn.query("SELECT count(*) as count FROM Deal WHERE categoryId = ?", [id]);
      if (deals[0].count > 0) {
        const fallback = await conn.query("SELECT id FROM Category WHERE id NOT IN (?, ?, ?, ?, ?) AND parentId IS NULL LIMIT 1", TO_DELETE);
        if (fallback.length > 0) {
          await conn.query("UPDATE Deal SET categoryId = ? WHERE categoryId = ?", [fallback[0].id, id]);
          console.log(`Reassigned ${deals[0].count} deals for ${id}`);
        }
      }
      await conn.query("UPDATE Category SET parentId = NULL WHERE parentId = ?", [id]);
      await conn.query("DELETE FROM Category WHERE id = ?", [id]);
      console.log(`Deleted category ID: ${id}`);
    }
    const count = await conn.query("SELECT count(*) as count FROM Category");
    console.log("MariaDB Category Count now:", count[0].count);
  } finally {
    await conn.end();
  }
}

cleanMariaDb().catch(console.error);

