import { ci } from "@/server/db/case-insensitive";
import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { MerchantDirectoryStatus, MerchantDirectoryVerification, type Prisma } from "@/generated/prisma/client";
import { MERCHANT_DIRECTORY_CATEGORIES, MerchantDirectoryCategory } from "@/features/merchants/types";

export { MERCHANT_DIRECTORY_CATEGORIES };
export type { MerchantDirectoryCategory };

export function mapRawCategoryToStandard(raw?: string | null): MerchantDirectoryCategory {
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

export function normalizeDomain(urlOrDomain: string): string {
  if (!urlOrDomain) return "";
  let clean = urlOrDomain.trim().toLowerCase();
  clean = clean.replace(/^(?:https?:\/\/)?(?:www\d*\.)?/i, "");
  clean = clean.split("/")[0].split("?")[0].split("#")[0].trim();
  // Strip trailing periods or colons if any
  clean = clean.replace(/[:.]+$/, "");
  return clean;
}

export function canonicalizeWebsiteUrl(urlStr: string): string {
  if (!urlStr) return "";
  let clean = urlStr.trim();
  // Fix common typo like https://wwwkalkifashion.com -> https://www.kalkifashion.com
  if (/^https?:\/\/www[a-z0-9]/i.test(clean) && !/^https?:\/\/www\./i.test(clean)) {
    clean = clean.replace(/^https?:\/\/www/i, "https://www.");
  }
  if (!/^https?:\/\//i.test(clean)) {
    clean = "https://" + clean;
  }
  try {
    const parsed = new URL(clean);
    // Strip query parameters and hashes for canonical root website
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

export const merchantWebsiteDirectorySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
  websiteUrl: z.string().trim().min(4, "Website URL is required").max(2048),
  category: z.string().trim().default("UNCLASSIFIED"),
  productFocus: z.string().trim().max(255).optional().nullable(),
  businessModel: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  country: z.string().trim().default("India"),
  status: z.nativeEnum(MerchantDirectoryStatus).default(MerchantDirectoryStatus.ACTIVE),
  verificationStatus: z.nativeEnum(MerchantDirectoryVerification).default(MerchantDirectoryVerification.UNVERIFIED),
  logoMediaId: z.string().trim().max(100).optional().nullable(),
  logoUrl: z.string().trim().max(2048).optional().nullable(),
  source: z.string().trim().default("MANUAL"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type MerchantWebsiteDirectoryInput = z.infer<typeof merchantWebsiteDirectorySchema>;

export interface MerchantWebsiteDirectoryFilter {
  search?: string;
  category?: string;
  status?: MerchantDirectoryStatus;
  verificationStatus?: MerchantDirectoryVerification;
  page?: number;
  limit?: number;
  sortBy?: "name" | "createdAt" | "status" | "domain";
  sortOrder?: "asc" | "desc";
}

export class MerchantWebsiteDirectoryService {
  static async list(filters: MerchantWebsiteDirectoryFilter = {}) {
    const db = getDatabase();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantWebsiteDirectoryWhereInput = {};

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, ...ci() } },
        { domain: { contains: q, ...ci() } },
        { productFocus: { contains: q, ...ci() } },
      ];
    }

    if (filters.category && filters.category !== "ALL") {
      where.category = filters.category;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }

    const orderByField = filters.sortBy || "name";
    const orderDirection = filters.sortOrder || "asc";

    const [items, total, stats] = await Promise.all([
      db.merchantWebsiteDirectory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByField]: orderDirection },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          domain: true,
          category: true,
          productFocus: true,
          logoMediaId: true,
          logoUrl: true,
          status: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.merchantWebsiteDirectory.count({ where }),
      this.getStats(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      stats,
    };
  }

  static async getStats() {
    const db = getDatabase();
    // Use an efficient single-pass GROUP BY query instead of 7 round-trips
    const [statusGroups, verificationGroups, total] = await Promise.all([
      db.merchantWebsiteDirectory.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      db.merchantWebsiteDirectory.groupBy({
        by: ["verificationStatus"],
        _count: { _all: true },
      }),
      db.merchantWebsiteDirectory.count(),
    ]);

    const statusMap = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
    const verifMap = Object.fromEntries(verificationGroups.map((g) => [g.verificationStatus, g._count._all]));

    return {
      total,
      active: statusMap[MerchantDirectoryStatus.ACTIVE] || 0,
      inactive: statusMap[MerchantDirectoryStatus.INACTIVE] || 0,
      underReview: statusMap[MerchantDirectoryStatus.UNDER_REVIEW] || 0,
      verified: verifMap[MerchantDirectoryVerification.VERIFIED] || 0,
      unverified: verifMap[MerchantDirectoryVerification.UNVERIFIED] || 0,
      needsReview: verifMap[MerchantDirectoryVerification.NEEDS_REVIEW] || 0,
    };
  }

  static async getById(id: string) {
    const db = getDatabase();
    return db.merchantWebsiteDirectory.findUnique({ where: { id } });
  }

  static async getByDomain(domain: string) {
    const db = getDatabase();
    const normalized = normalizeDomain(domain);
    if (!normalized) return null;
    return db.merchantWebsiteDirectory.findUnique({ where: { domain: normalized } });
  }

  static async create(input: unknown) {
    const db = getDatabase();
    const parsed = merchantWebsiteDirectorySchema.parse(input);
    const domain = normalizeDomain(parsed.websiteUrl);

    if (!domain) {
      throw new Error("Invalid website URL or unable to determine domain.");
    }

    const existing = await db.merchantWebsiteDirectory.findUnique({ where: { domain } });
    if (existing) {
      throw new Error(`A merchant website with domain '${domain}' already exists (${existing.name}).`);
    }

    const canonicalUrl = canonicalizeWebsiteUrl(parsed.websiteUrl);

    return db.merchantWebsiteDirectory.create({
      data: {
        name: parsed.name,
        websiteUrl: canonicalUrl,
        domain,
        category: parsed.category,
        categories: [parsed.category],
        productFocus: parsed.productFocus || null,
        businessModel: parsed.businessModel || null,
        description: parsed.description || null,
        country: parsed.country || "India",
        status: parsed.status,
        verificationStatus: parsed.verificationStatus,
        logoMediaId: parsed.logoMediaId || null,
        logoUrl: parsed.logoUrl || (parsed.logoMediaId ? `/api/v1/media/${parsed.logoMediaId}` : null),
        source: parsed.source || "MANUAL",
        notes: parsed.notes || null,
      },
    });
  }

  static async update(id: string, input: Partial<MerchantWebsiteDirectoryInput>) {
    const db = getDatabase();
    const current = await db.merchantWebsiteDirectory.findUnique({ where: { id } });
    if (!current) throw new Error("Merchant website record not found.");

    let newDomain = current.domain;
    let canonicalUrl = current.websiteUrl;

    if (input.websiteUrl && input.websiteUrl !== current.websiteUrl) {
      newDomain = normalizeDomain(input.websiteUrl);
      if (!newDomain) throw new Error("Invalid website URL.");
      canonicalUrl = canonicalizeWebsiteUrl(input.websiteUrl);

      if (newDomain !== current.domain) {
        const existing = await db.merchantWebsiteDirectory.findUnique({ where: { domain: newDomain } });
        if (existing && existing.id !== id) {
          throw new Error(`Domain '${newDomain}' is already used by another merchant (${existing.name}).`);
        }
      }
    }

    return db.merchantWebsiteDirectory.update({
      where: { id },
      data: {
        name: input.name ?? current.name,
        websiteUrl: canonicalUrl,
        domain: newDomain,
        category: input.category ?? current.category,
        productFocus: input.productFocus !== undefined ? input.productFocus : current.productFocus,
        businessModel: input.businessModel !== undefined ? input.businessModel : current.businessModel,
        description: input.description !== undefined ? input.description : current.description,
        country: input.country ?? current.country,
        status: input.status ?? current.status,
        verificationStatus: input.verificationStatus ?? current.verificationStatus,
        logoMediaId: input.logoMediaId !== undefined ? input.logoMediaId : current.logoMediaId,
        logoUrl: input.logoUrl !== undefined ? input.logoUrl : input.logoMediaId ? `/api/v1/media/${input.logoMediaId}` : current.logoUrl,
        notes: input.notes !== undefined ? input.notes : current.notes,
      },
    });
  }

  static async toggleStatus(id: string, newStatus: MerchantDirectoryStatus) {
    const db = getDatabase();
    return db.merchantWebsiteDirectory.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  static async softDelete(id: string) {
    return this.toggleStatus(id, MerchantDirectoryStatus.INACTIVE);
  }

  static async delete(id: string) {
    const db = getDatabase();
    return db.merchantWebsiteDirectory.delete({
      where: { id },
    });
  }

  static async syncToOperationalMerchant(id: string) {
    const db = getDatabase();
    const directoryItem = await db.merchantWebsiteDirectory.findUnique({ where: { id } });
    if (!directoryItem) throw new Error("Merchant not found in directory.");

    const slug = directoryItem.domain.replace(/\.[a-z]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    
    // Upsert into operational Merchant table so it appears in live stores & catalog
    const operational = await db.merchant.upsert({
      where: { slug },
      update: {
        name: directoryItem.name,
        websiteUrl: directoryItem.websiteUrl,
      },
      create: {
        slug,
        name: directoryItem.name,
        websiteUrl: directoryItem.websiteUrl,
        affiliateHosts: [directoryItem.domain],
      },
    });

    return { directoryItem, operational };
  }
}
