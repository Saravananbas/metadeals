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

async function updateMariaDbSchema() {
  const mariaUrl = process.env.HOSTINGER_MARIADB_URL;
  const config = parseMariaDbConfig(mariaUrl);
  const conn = await mariadb.createConnection(config);
  try {
    console.log("Connected to Hostinger MariaDB.");
    
    const custCols = await conn.query("SHOW COLUMNS FROM Customer LIKE 'image'");
    if (custCols.length === 0) {
      console.log("Adding 'image' column to Customer table...");
      await conn.query("ALTER TABLE Customer ADD COLUMN image VARCHAR(1024) NULL");
    } else {
      console.log("'image' column already exists on Customer.");
    }

    await conn.query("ALTER TABLE Customer MODIFY COLUMN emailVerifiedAt DATETIME(3) NULL");
    console.log("Modified emailVerifiedAt to be nullable.");

    const identEmail = await conn.query("SHOW COLUMNS FROM CustomerIdentity LIKE 'email'");
    if (identEmail.length === 0) {
      console.log("Adding 'email', 'name', 'avatarUrl', 'createdAt', 'updatedAt' to CustomerIdentity...");
      await conn.query("ALTER TABLE CustomerIdentity ADD COLUMN email VARCHAR(255) NULL");
      await conn.query("ALTER TABLE CustomerIdentity ADD COLUMN name VARCHAR(255) NULL");
      await conn.query("ALTER TABLE CustomerIdentity ADD COLUMN avatarUrl VARCHAR(1024) NULL");
      await conn.query("ALTER TABLE CustomerIdentity ADD COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
      await conn.query("ALTER TABLE CustomerIdentity ADD COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)");
    } else {
      console.log("CustomerIdentity columns already updated.");
    }

    console.log("✅ MariaDB Schema successfully synchronized.");
  } finally {
    await conn.end();
  }
}

updateMariaDbSchema().catch(console.error);
