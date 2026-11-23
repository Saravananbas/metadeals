import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeImage } from "../src/server/storage/media";

test("an AVIF product image is accepted and stored as WebP; non-images are still refused", async () => {
  const avif = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#cc3333" } }).avif().toBuffer();
  const out = await normalizeImage(avif);
  assert.equal(out.mimeType, "image/webp");
  assert.deepEqual([out.width, out.height], [40, 30]);
  await assert.rejects(normalizeImage(Buffer.from("not an image at all")), /valid image/);
});
