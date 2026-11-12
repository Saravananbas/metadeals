// One-off: copies all rows from local PostgreSQL to local MariaDB (same table/column names, case-insensitive table match).
// Usage: PGURL=... MYURL=... node scripts/copy-pg-to-mariadb.cjs [--apply]   (dry run prints counts only)
const { Client, types } = require("pg");
const mysql = require("mysql2/promise");
types.setTypeParser(1114, (v) => v); // timestamp without tz: keep raw UTC string
types.setTypeParser(1184, (v) => v);
const apply = process.argv.includes("--apply");
(async () => {
  const pg = new Client({ connectionString: process.env.PGURL }); await pg.connect();
  const my = await mysql.createConnection({ uri: process.env.MYURL, timezone: "Z", multipleStatements: false });
  const [myTables] = await my.query("select table_name n from information_schema.tables where table_schema=database() and table_name<>'_prisma_migrations'");
  const pgTables = (await pg.query("select table_name from information_schema.tables where table_schema='public' and table_name<>'_prisma_migrations'")).rows.map((r) => r.table_name);
  if (apply) await my.query("SET FOREIGN_KEY_CHECKS=0");
  for (const { n } of myTables) {
    const pt = pgTables.find((t) => t.toLowerCase() === n.toLowerCase());
    if (!pt) { console.log(n, "no postgres table"); continue; }
    const [mc] = await my.query("select column_name c from information_schema.columns where table_schema=database() and table_name=?", [n]);
    const pc = (await pg.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [pt])).rows.map((r) => r.column_name);
    const cols = mc.map((r) => r.c).filter((c) => pc.includes(c));
    const missing = pc.filter((c) => !mc.some((r) => r.c === c));
    const rows = (await pg.query(`select ${cols.map((c) => `"${c}"`).join(",")} from "${pt}"`)).rows;
    console.log(n, rows.length, "rows", missing.length ? `(pg-only columns skipped: ${missing})` : "");
    if (!apply || !rows.length) continue;
    const conv = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);
    for (const row of rows) {
      await my.query(`insert into \`${n}\` (${cols.map((c) => `\`${c}\``).join(",")}) values (${cols.map(() => "?").join(",")})`, cols.map((c) => conv(row[c])));
    }
  }
  if (apply) await my.query("SET FOREIGN_KEY_CHECKS=1");
  await pg.end(); await my.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
