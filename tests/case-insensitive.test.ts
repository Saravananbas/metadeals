import assert from "node:assert/strict";
import test from "node:test";
import { ci } from "../src/server/db/case-insensitive";

test("case-insensitive search option is left out on MariaDB (Prisma rejects `mode` there) and kept on PostgreSQL", () => {
  const before = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/x";
    assert.deepEqual({ contains: "acer", ...ci() }, { contains: "acer" });
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/x";
    assert.deepEqual({ contains: "acer", ...ci() }, { contains: "acer", mode: "insensitive" });
  } finally {
    if (before === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = before;
  }
});
