// Builds the clean upload folder for Hostinger (no secrets, no personal files) next to the repo: ../Metadeals-staging-pkg
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve("..", "Metadeals-staging-pkg");
if (!out.endsWith("Metadeals-staging-pkg")) throw new Error("Unexpected output path");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const item of ["src", "public"]) cpSync(item, join(out, item), { recursive: true });
for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "components.json", ".nvmrc", "prisma.config.ts", "next-env.d.ts"]) cpSync(file, join(out, file));
mkdirSync(join(out, "prisma"));
for (const item of ["schema.prisma", "schema.mariadb.prisma", "schema.postgresql.prisma", "migrations", "migrations_mariadb"]) cpSync(join("prisma", item), join(out, "prisma", item), { recursive: true });
// Images the site already uses; uploads made on staging live in MEDIA_DIR instead.
if (existsSync(".local/media")) {
  mkdirSync(join(out, "seed-media"));
  for (const f of readdirSync(".local/media").filter((n) => n.endsWith(".webp"))) cpSync(join(".local/media", f), join(out, "seed-media", f));
}
console.log(`Staging package ready: ${out}`);
