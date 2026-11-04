import "server-only";
import { inflateRawSync } from "node:zlib";
import { readSheet } from "read-excel-file/node";
import { dealInputSchema } from "@/features/deals/validation";
import { rupeesToPaise } from "@/features/deals/currency";
import { DealError } from "./service";

export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if (char === "\n" && !quoted) { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new DealError("Unclosed CSV quote.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
/** Bound actual decompressed content before a workbook parser sees it. No macros/formulas/external relationships. */
export function validateWorkbookZip(buffer: Buffer) {
  let end = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65557); p--) if (buffer.readUInt32LE(p) === 0x06054b50) { end = p; break; }
  if (end < 0) throw new DealError("Invalid XLSX archive.");
  const count = buffer.readUInt16LE(end + 10); let p = buffer.readUInt32LE(end + 16); let total = 0;
  if (count > 100 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new DealError("Workbook is too complex.");
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) throw new DealError("Invalid XLSX directory.");
    const method = buffer.readUInt16LE(p + 10), size = buffer.readUInt32LE(p + 20), outputSize = buffer.readUInt32LE(p + 24), length = buffer.readUInt16LE(p + 28), offset = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + length).toString();
    if (names.has(name) || name.includes("..") || /vba|externalLinks/i.test(name) || buffer.readUInt16LE(p + 8) & 1 || ![0, 8].includes(method) || outputSize > 2_000_000) throw new DealError("Unsupported XLSX content.");
    names.add(name);
    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) throw new DealError("Invalid XLSX entry.");
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    if (start + size > buffer.length) throw new DealError("Invalid XLSX size.");
    const packed = buffer.subarray(start, start + size);
    const bytes = method === 8 ? inflateRawSync(packed, { maxOutputLength: 2_000_000 }) : packed;
    total += bytes.length;
    if (bytes.length !== outputSize || total > 8_000_000) throw new DealError("Workbook expanded size exceeds limits.");
    if (/\.xml$|\.rels$/.test(name) && /<!DOCTYPE|<!ENTITY|<f[\s>]|TargetMode="External"/i.test(bytes.toString())) throw new DealError("Use a values-only workbook without formulas or external links.");
    p += 46 + length + buffer.readUInt16LE(p + 30) + buffer.readUInt16LE(p + 32);
  }
}
export async function parseDealImport(bytes: Buffer, format: string) {
  if (bytes.length > 1_000_000) throw new DealError("Import limit is 1 MB.", 413);
  let rows: unknown[][];
  if (format === "csv") rows = csvRows(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  else if (format === "xlsx") { try { validateWorkbookZip(bytes); rows = await readSheet(bytes); } catch (error) { throw error instanceof DealError ? error : new DealError("Invalid or unsupported workbook."); } }
  else throw new DealError("Use CSV or XLSX.");
  if (rows.length < 2 || rows.length > 101) throw new DealError("Import 1–100 rows at a time.");
  const headers = rows[0].map(String);
  const allowed = ["slug", "title", "brand", "description", "categoryId", "merchantId", "mediaId", "mrpMinor", "priceMinor", "mrp", "price", "productUrl", "affiliateUrl", "rating", "reviewCount", "ratingSource", "publishedAt", "startsAt", "expiresAt", "featured", "trending"];
  if (new Set(headers).size !== headers.length || headers.some((h) => !allowed.includes(h))) throw new DealError("Duplicate or unknown import columns.");
  return rows.slice(1).map((row, index) => {
    const obj = Object.fromEntries(headers.map((key, i) => [key, row[i] instanceof Date ? row[i].toISOString() : row[i] ?? ""]));
    const optional = (key: string) => obj[key] === undefined || obj[key] === "" ? null : obj[key];

    let mrpMinor: number;
    try {
      if (obj.mrp !== undefined && obj.mrp !== "") {
        mrpMinor = rupeesToPaise(String(obj.mrp));
      } else {
        mrpMinor = Number(obj.mrpMinor);
      }
    } catch {
      throw new DealError(`Row ${index + 2}: Invalid MRP value.`);
    }

    let priceMinor: number;
    try {
      if (obj.price !== undefined && obj.price !== "") {
        priceMinor = rupeesToPaise(String(obj.price));
      } else {
        priceMinor = Number(obj.priceMinor);
      }
    } catch {
      throw new DealError(`Row ${index + 2}: Invalid price value.`);
    }

    const parsed = dealInputSchema.safeParse({ ...obj, brand: obj.brand ?? "", currency: "INR", status: "DRAFT", mrpMinor, priceMinor, rating: optional("rating") === null ? null : Number(obj.rating), reviewCount: optional("reviewCount") === null ? null : Number(obj.reviewCount), ratingSource: optional("ratingSource"), affiliateUrl: optional("affiliateUrl"), publishedAt: optional("publishedAt"), startsAt: optional("startsAt"), expiresAt: optional("expiresAt"), featured: String(obj.featured).toLowerCase() === "true", trending: String(obj.trending).toLowerCase() === "true", options: [] });
    if (!parsed.success) throw new DealError(`Row ${index + 2}: ${parsed.error.issues.map((x) => x.path.join(".") + " " + x.message).join("; ")}`);
    return parsed.data;
  });
}
