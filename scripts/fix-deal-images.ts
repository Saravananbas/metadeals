import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";

async function main() {
  const db = getDatabase();

  // Create a new unique webp file for cmw0cxq230004tgfaj0kmmnjd
  const newStorageKey = `${randomUUID()}.webp`;
  const src = join(process.cwd(), ".local", "media", "7c406185-1b15-4b00-9d21-d03a84084078.webp");
  const dst = join(process.cwd(), ".local", "media", newStorageKey);
  await copyFile(src, dst);

  await db.media.update({
    where: { id: "cmw0cxq230004tgfaj0kmmnjd" },
    data: {
      storageKey: newStorageKey,
      provider: "local",
      mimeType: "image/webp",
    },
  });
  console.log("Updated cmw0cxq230004tgfaj0kmmnjd storageKey to", newStorageKey);

  const phoneMedia = "cmw1dk4xz000cc0fatpcbtatw";
  const laptopMedia = "cmw1dk540000dc0fam3o0bswc";
  const audioMedia = "cmw1dk5a1000ec0fapc4dub4e";
  const applianceMedia = "cmw1dk5ff000fc0farmzl0cug";
  const shoesMedia = "cmw1dk5kr000gc0faubh1b5g8";

  const deals = await db.deal.findMany({
    select: { id: true, title: true, brand: true, category: { select: { slug: true } } },
  });

  let remapped = 0;
  for (const deal of deals) {
    const titleLower = deal.title.toLowerCase();
    let targetMedia = phoneMedia;

    if (
      titleLower.includes("macbook") ||
      titleLower.includes("laptop") ||
      titleLower.includes("thinkpad") ||
      titleLower.includes("dell")
    ) {
      targetMedia = laptopMedia;
    } else if (
      titleLower.includes("wh-1000xm5") ||
      titleLower.includes("headphone") ||
      titleLower.includes("earphone") ||
      titleLower.includes("airpods") ||
      titleLower.includes("buds")
    ) {
      targetMedia = audioMedia;
    } else if (
      titleLower.includes("tv") ||
      titleLower.includes("oled") ||
      titleLower.includes("bravia") ||
      titleLower.includes("washing machine") ||
      titleLower.includes("refrigerator") ||
      titleLower.includes("air fryer") ||
      deal.category?.slug === "appliances"
    ) {
      targetMedia = applianceMedia;
    } else if (
      titleLower.includes("shoes") ||
      titleLower.includes("backpack") ||
      titleLower.includes("daypack") ||
      titleLower.includes("trolley") ||
      titleLower.includes("rucksack") ||
      deal.category?.slug === "travel"
    ) {
      targetMedia = shoesMedia;
    } else if (
      titleLower.includes("galaxy") ||
      titleLower.includes("iphone") ||
      titleLower.includes("pixel") ||
      titleLower.includes("oneplus") ||
      titleLower.includes("tab") ||
      titleLower.includes("phone") ||
      deal.category?.slug === "mobiles"
    ) {
      targetMedia = phoneMedia;
    }

    await db.deal.update({
      where: { id: deal.id },
      data: { mediaId: targetMedia },
    });
    remapped++;
  }

  console.log(`Successfully remapped ${remapped} deals to appropriate media.`);
}

main()
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  })
  .finally(disconnectDatabase);
