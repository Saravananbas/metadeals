// Copies locally stored images (.local/media) to the S3-compatible bucket and flips media.provider to "s3".
// Dry run by default: `npm run media:to-s3` reports only. Add `-- --apply` to upload and update rows.
// Needs S3_* in .env. Local files are kept (never deleted) so the step is reversible.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { getStorage } from "../src/server/storage/client";

const apply = process.argv.includes("--apply");
const db = getDatabase();
async function main() {
  const rows = await db.media.findMany({ where: { provider: "local" }, select: { id: true, storageKey: true, mimeType: true } });
  console.log(`${rows.length} media rows use local storage. ${apply ? "APPLYING" : "Dry run (add --apply)"}`);

  let uploaded = 0, missing = 0, failed = 0;
  if (apply) {
    const { client, bucket } = getStorage();
    for (const row of rows) {
      if (!/^[a-f0-9-]{36}\.webp$/.test(row.storageKey)) { failed++; continue; }
      let bytes: Buffer;
      try { bytes = await readFile(join(process.cwd(), ".local", "media", row.storageKey)); } catch { missing++; continue; }
      const Key = `media/${row.storageKey}`;
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: bytes, ContentType: "image/webp" }));
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key })); // confirm it landed before flipping the row
        await db.media.update({ where: { id: row.id }, data: { provider: "s3" } });
        uploaded++;
      } catch { failed++; }
    }
  }
  console.log({ uploaded, missingLocalFile: missing, failed });
  await disconnectDatabase();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
