/**
 * The one place that builds and reads deal addresses (pure, no database, safe on server and client):
 *   /deal/{primary-category-slug}/{product-slug}-{publicId}
 * The publicId (d + 8 characters) is generated once per deal and is what identifies the deal; the words in front of it are only for people and search engines.
 */
export const PUBLIC_ID_PATTERN = /^d[0-9a-z]{8}$/;
const ID_AT_END = /(?:^|-)(d[0-9a-z]{8})$/;
const MAX_SLUG = 90;

/** Lower-case ASCII words joined with hyphens. Accents are folded, a few symbols are spelled out, everything else is dropped. */
export function slugWords(text: string): string[] {
  const folded = text
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/%/g, " percent ")
    .replace(/['’`]/g, "");
  return folded.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Removes a word or phrase that is immediately repeated ("pigeon pigeon popular", "blue heaven blue heaven makeup"). Longest phrase first. */
export function collapseRepeats(words: string[]): string[] {
  let out = words.slice();
  for (let n = Math.min(4, Math.floor(out.length / 2)); n >= 1; n--) {
    for (let i = 0; i + 2 * n <= out.length; ) {
      if (out.slice(i, i + n).join(" ") === out.slice(i + n, i + 2 * n).join(" ")) out.splice(i + n, n);
      else i++;
    }
  }
  return out;
}

/** Product part of the address: about 50 to 90 characters where the title allows. Cuts only between words, and never below one word. */
export function productSlug(title: string, brand?: string | null): string {
  let words = collapseRepeats(slugWords(title));
  // A title that does not mention the brand gets it in front (brand and model are the product's identity).
  const brandWords = collapseRepeats(slugWords(brand ?? ""));
  if (brandWords.length && !words.join(" ").includes(brandWords.join(" "))) words = [...brandWords, ...words];
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG && slug) break;
    slug = next;
  }
  return slug.slice(0, 120) || "deal";
}

export type CategoryLike = { id: string; slug: string; parentId: string | null };

/** The top-level (primary) category: a deal filed under a sub-category uses its parent's slug. Returns null when the category is unknown. */
export function primaryCategorySlug(categories: Map<string, CategoryLike>, categoryId: string | null | undefined): string | null {
  let current = categoryId ? categories.get(categoryId) : undefined;
  for (let depth = 0; current && depth < 5; depth++) {
    if (!current.parentId) return normaliseCategorySlug(current.slug);
    current = categories.get(current.parentId);
  }
  return null;
}

export function normaliseCategorySlug(slug: string): string | null {
  const clean = slugWords(slug).join("-");
  return clean || null;
}

/** null when there is no usable category: the caller keeps the old address and flags the deal instead of publishing a misleading one. */
export function canonicalPath(input: { categorySlug: string | null; title: string; brand?: string | null; publicId: string }): string | null {
  if (!input.categorySlug || !PUBLIC_ID_PATTERN.test(input.publicId)) return null;
  return `/deal/${input.categorySlug}/${productSlug(input.title, input.brand)}-${input.publicId}`;
}

/** The deal id at the end of the last address part, or null. */
export function publicIdFromSlugPart(part: string): string | null {
  const match = ID_AT_END.exec(part.toLowerCase());
  return match ? match[1] : null;
}

/** Address to link to from the site: the stored canonical address, or the old one for a deal that has not been migrated yet (it redirects). */
export function dealHref(deal: { canonicalPath?: string | null; path?: string | null; slug?: string | null; id: string }): string {
  return deal.path || deal.canonicalPath || `/deal/${encodeURIComponent(deal.slug || deal.id)}`;
}
