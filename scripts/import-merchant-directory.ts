import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function decodeXml(s: string) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeDomain(urlOrDomain: string) {
  if (!urlOrDomain) return "";
  let clean = urlOrDomain.trim().toLowerCase();
  clean = clean.replace(/^(?:https?:\/\/)?(?:www\d*\.)?/i, "");
  clean = clean.split("/")[0].split("?")[0].split("#")[0].trim();
  clean = clean.replace(/[:.]+$/, "");
  return clean;
}

function canonicalizeWebsiteUrl(urlStr: string) {
  if (!urlStr) return "";
  let clean = urlStr.trim();
  if (/^https?:\/\/www[a-z0-9]/i.test(clean) && !/^https?:\/\/www\./i.test(clean)) {
    clean = clean.replace(/^https?:\/\/www/i, "https://www.");
  }
  if (!/^https?:\/\//i.test(clean)) {
    clean = "https://" + clean;
  }
  try {
    const parsed = new URL(clean);
    let pathname = parsed.pathname;
    if (pathname.endsWith("/") && pathname !== "/") {
      pathname = pathname.slice(0, -1);
    }
    let res = `${parsed.protocol}//${parsed.host}${pathname}`;
    if (res.endsWith("/") && parsed.pathname === "/") {
      res = res.slice(0, -1);
    }
    return res;
  } catch {
    return clean;
  }
}

function mapRawCategoryToStandard(raw?: string | null) {
  if (!raw) return "UNCLASSIFIED";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("marketplace")) return "MARKETPLACE";
  if (lower.includes("fashion") || lower.includes("clothing") || lower.includes("footwear") || lower.includes("apparel") || lower.includes("jewellery") || lower.includes("accessories")) return "FASHION";
  if (lower.includes("beauty") || lower.includes("cosmetics") || lower.includes("skincare") || lower.includes("personal care")) return "BEAUTY_PERSONAL_CARE";
  if (lower.includes("electronic") || lower.includes("gadget") || lower.includes("mobiles") || lower.includes("laptop")) return "ELECTRONICS";
  if (lower.includes("grocery") || lower.includes("quick commerce") || lower.includes("food") || lower.includes("dairy")) return "GROCERY";
  if (lower.includes("food delivery") || lower.includes("swiggy") || lower.includes("zomato")) return "FOOD_DELIVERY";
  if (lower.includes("travel") || lower.includes("flight") || lower.includes("hotel") || lower.includes("yatra") || lower.includes("cleartrip") || lower.includes("ixigo")) return "TRAVEL";
  if (lower.includes("furniture") || lower.includes("home") || lower.includes("decor") || lower.includes("interior")) return "ECOMMERCE_RETAILER";
  if (lower.includes("health") || lower.includes("pharmacy") || lower.includes("wellness") || lower.includes("medicine")) return "ECOMMERCE_RETAILER";
  if (lower.includes("baby") || lower.includes("kids") || lower.includes("parenting") || lower.includes("toys")) return "ECOMMERCE_RETAILER";
  if (lower.includes("book") || lower.includes("learning") || lower.includes("stationery")) return "ECOMMERCE_RETAILER";
  if (lower.includes("automotive") || lower.includes("mobility") || lower.includes("auto")) return "ECOMMERCE_RETAILER";
  if (lower.includes("d2c")) return "D2C_BRAND";
  return "OTHER";
}

async function main() {
  console.log("--- Starting Merchant Website Directory Import ---");

  const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:55432/metadeals";
  const adapter = new PrismaPg({
    connectionString: dbUrl,
    max: 5,
    connectionTimeoutMillis: 3000,
  });
  const prisma = new PrismaClient({ adapter });

  const sharedStrXml = fs.readFileSync("d:/Metadeals/.tmp_xlsx/xl/sharedStrings.xml", "utf8");
  const siRegex = /<si\b[^>]*>(.*?)<\/si>/gs;
  const strings: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(sharedStrXml)) !== null) {
    const siInner = m[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let text = "";
    let tm: RegExpExecArray | null;
    while ((tm = tRegex.exec(siInner)) !== null) {
      text += tm[1];
    }
    strings.push(decodeXml(text));
  }

  const sheetXml = fs.readFileSync("d:/Metadeals/.tmp_xlsx/xl/worksheets/sheet1.xml", "utf8");
  const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const rows: Array<{ rowNum: number; cells: Record<string, string> }> = [];
  while ((m = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(m[1], 10);
    const rowContent = m[2];
    const cellRegex = /<c\b[^>]*r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g;
    let cm: RegExpExecArray | null;
    const cells: Record<string, string> = {};
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const col = cm[1];
      const type = cm[2];
      const val = cm[3];
      if (type === "s" && val !== undefined) {
        const idx = parseInt(val, 10);
        cells[col] = strings[idx] !== undefined ? strings[idx] : "";
      } else if (type === "inlineStr") {
        const ism = /<is>.*?<t\b[^>]*>(.*?)<\/t>.*?<\/is>/s.exec(cm[0]);
        cells[col] = ism ? decodeXml(ism[1]) : "";
      } else {
        cells[col] = val !== undefined ? decodeXml(val) : "";
      }
    }
    rows.push({ rowNum, cells });
  }

  const dataRows = rows.slice(1);
  console.log(`Total rows in Excel sheet: ${dataRows.length}`);

  let importedCount = 0;
  let duplicateCount = 0;
  let manualReviewCount = 0;
  let invalidUrlCount = 0;

  const seenDomains = new Set<string>();
  const summaryReport: any[] = [];

  for (const r of dataRows) {
    const merchantCode = (r.cells.A || "").trim();
    let name = (r.cells.B || "").trim();
    let rawUrl = (r.cells.C || "").trim();
    const primaryCat = (r.cells.D || "").trim();
    const productFocus = (r.cells.E || "").trim();
    const businessModel = (r.cells.F || "").trim();
    const notes = (r.cells.Q || "").trim();

    if (!rawUrl) {
      invalidUrlCount++;
      manualReviewCount++;
      summaryReport.push({ row: r.rowNum, name, reason: "Missing URL" });
      continue;
    }

    let needsReview = false;
    if (!name) {
      const rawNoHttp = rawUrl.replace(/^(https?:\/\/)?(www\d*\.)?/i, "");
      const candidateName = rawNoHttp.split(".")[0];
      name = candidateName.charAt(0).toUpperCase() + candidateName.slice(1);
      needsReview = true;
      manualReviewCount++;
    }

    let fixedUrl = rawUrl;
    if (/^https?:\/\/www[a-z0-9]/i.test(fixedUrl) && !/^https?:\/\/www\./i.test(fixedUrl)) {
      fixedUrl = fixedUrl.replace(/^https?:\/\/www/i, "https://www.");
    }

    const domain = normalizeDomain(fixedUrl);
    const canonicalUrl = canonicalizeWebsiteUrl(fixedUrl);
    const standardCategory = mapRawCategoryToStandard(primaryCat || businessModel || name);

    if (seenDomains.has(domain)) {
      duplicateCount++;
      manualReviewCount++;
      console.log(`Skipping duplicate domain in source [${domain}] from row ${r.rowNum} (${name})`);
      summaryReport.push({ row: r.rowNum, name, domain, reason: "Duplicate domain in Excel" });
      continue;
    }
    seenDomains.add(domain);

    const verificationStatus = needsReview ? "NEEDS_REVIEW" : "UNVERIFIED";

    const fullNotes = [notes, primaryCat ? `Original Category: ${primaryCat}` : null]
      .filter(Boolean)
      .join(" | ");

    await prisma.merchantWebsiteDirectory.upsert({
      where: { domain },
      update: {
        name,
        websiteUrl: canonicalUrl,
        category: standardCategory,
        productFocus: productFocus || null,
        businessModel: businessModel || null,
        country: "India",
        notes: fullNotes || null,
      },
      create: {
        merchantCode: merchantCode || null,
        name,
        websiteUrl: canonicalUrl,
        domain,
        category: standardCategory,
        categories: [standardCategory],
        productFocus: productFocus || null,
        businessModel: businessModel || null,
        country: "India",
        status: "ACTIVE",
        verificationStatus,
        source: "EXCEL_IMPORT",
        notes: fullNotes || null,
      },
    });

    importedCount++;
  }

  console.log("\n=============================================");
  console.log("         EXCEL IMPORT SUMMARY REPORT         ");
  console.log("=============================================");
  console.log(`Total rows in source file:       ${dataRows.length}`);
  console.log(`Unique merchants/domains:        ${seenDomains.size}`);
  console.log(`Successfully imported/upserted:  ${importedCount}`);
  console.log(`Duplicate records skipped:       ${duplicateCount}`);
  console.log(`Invalid / missing URLs:          ${invalidUrlCount}`);
  console.log(`Records marked for review:       ${manualReviewCount}`);
  console.log("=============================================\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Import failed:", e);
  process.exit(1);
});

