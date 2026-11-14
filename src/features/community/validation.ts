import { z } from "zod";
import { isPublicHttpsUrl } from "@/features/deals/validation";

export const LIMITS = { title: 200, newPostTitle: 120, richBody: 5_000, richComment: 2_000, maxImages: 3, body: 10_000, comment: 3_000, maxLinksPost: 3, maxLinksComment: 1, maxCommentDepth: 2, bio: 280 } as const;
export const POST_TYPES = ["DEAL", "DISCUSSION", "QUESTION"] as const;
export const REPORT_CATEGORIES = ["SPAM", "SCAM", "HARASSMENT", "HATE", "ILLEGAL", "PRIVACY", "IMPERSONATION", "OFF_TOPIC", "OTHER"] as const;
export const REPORT_LABELS: Record<(typeof REPORT_CATEGORIES)[number], string> = {
  SPAM: "Spam or advertising", SCAM: "Scam or phishing", HARASSMENT: "Harassment or threats", HATE: "Hate or abuse", ILLEGAL: "Illegal goods or activity",
  PRIVACY: "Shares personal details", IMPERSONATION: "Impersonation", OFF_TOPIC: "Off topic", OTHER: "Something else",
};
// Digits and symbols people swap for letters, plus Cyrillic and Greek letters that look like Latin ones.
const LOOKALIKES: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i",
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "ѕ": "s", "у": "y", "н": "h", "м": "m", "т": "t", "к": "k",
  "ο": "o", "α": "a", "ε": "e", "ι": "i", "ν": "v", "ρ": "p", "κ": "k", "τ": "t", "υ": "u", "η": "n",
};
const STAFF_WORDS = ["admin", "admins", "administrator", "moderator", "moderators", "staff", "official", "support", "system"];
const fold = (text: string, symbolsAsLetters = true) => {
  const base = text.normalize("NFKD").toLowerCase().replace(/[\p{M}\p{Cf}]/gu, "").replace(/[^\p{L}\p{N}@$! ]/gu, " ");
  return base.replace(/./gu, (c) => (LOOKALIKES[c] !== undefined && (symbolsAsLetters || !/[0-9@$!]/.test(c)) ? LOOKALIKES[c] : /[0-9@$!]/.test(c) && !symbolsAsLetters ? " " : c)).replace(/l/g, "i");
};
const STAFF_FOLDED = STAFF_WORDS.map((w) => fold(w));
/**
 * True when a free-text display name tries to look like staff. Case, symbols, spacing, look-alike digits and common Cyrillic/Greek look-alikes are ignored.
 * Matching is by whole word (so "Stafford" or "Supporter" are fine); the brand name is matched anywhere, and letters spaced out ("A d m i n") are joined.
 */
export function looksLikeStaffName(name: string): boolean {
  // Two readings: "Adm1n" (digits are letters) and "Admin1" (digits are decoration).
  return [true, false].some((symbolsAsLetters) => {
    const folded = fold(name, symbolsAsLetters);
    const words = folded.split(" ").filter(Boolean);
    const joined = words.length > 1 && words.every((w) => w.length === 1) ? words.join("") : "";
    if (folded.replace(/ /g, "").includes(fold("metadeals"))) return true;
    return [...words, joined].some((w) => w && STAFF_FOLDED.includes(w));
  });
}
export const RESERVED_HANDLES = new Set(["admin", "administrator", "moderator", "mod", "metadeals", "metadeals4u", "support", "staff", "official", "system", "help", "deleted", "removed", "anonymous", "guest", "null"]);

/** Text is stored and rendered as plain text (React escapes it); only control characters are removed. */
export function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
export const findUrls = (text: string) => text.match(URL_PATTERN) ?? [];

const text = (min: number, max: number, label: string) =>
  z.string().transform(cleanText).pipe(z.string().min(min, `${label} is too short.`).max(max, `${label} is too long.`));

export const postInputSchema = z.object({
  type: z.enum(POST_TYPES),
  communitySlug: z.string().trim().toLowerCase().min(2).max(40),
  title: text(5, LIMITS.newPostTitle, "Title"),
  body: text(0, LIMITS.body, "Text").default(""),
  // Written in the editor: sanitized again on the server, which also derives the plain text in `body`.
  bodyHtml: z.string().max(30_000).optional(),
  imageIds: z.array(z.string().min(1).max(40)).max(LIMITS.maxImages).optional(),
  notifyReplies: z.boolean().optional(),
  url: z.string().trim().max(2048).refine(isPublicHttpsUrl, "Use a public HTTPS link (no logins, ports or IP addresses).").nullable().optional(),
  merchantName: text(0, 100, "Store name").nullable().optional(),
  priceMinor: z.number().int().min(100, "Price must be at least ₹1.").max(2_000_000_000).nullable().optional(),
  mrpMinor: z.number().int().min(100).max(2_000_000_000).nullable().optional(),
  couponCode: text(0, 50, "Coupon").nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === "DEAL") {
    if (!value.url) ctx.addIssue({ code: "custom", path: ["url"], message: "A deal needs a link to the store's product page." });
    if (value.priceMinor == null) ctx.addIssue({ code: "custom", path: ["priceMinor"], message: "A deal needs the price you saw." });
  } else if (value.body.length < 10) {
    ctx.addIssue({ code: "custom", path: ["body"], message: "Add a few words so others can respond (at least 10 characters)." });
  }
  if (value.mrpMinor != null && value.priceMinor != null && value.priceMinor > value.mrpMinor) ctx.addIssue({ code: "custom", path: ["priceMinor"], message: "Deal price cannot be higher than the MRP." });
  if (findUrls(value.body).length > LIMITS.maxLinksPost) ctx.addIssue({ code: "custom", path: ["body"], message: `Use at most ${LIMITS.maxLinksPost} links in a post.` });
});
export type PostInput = z.infer<typeof postInputSchema>;

export const postEditSchema = z.object({
  version: z.number().int().positive(),
  title: text(5, LIMITS.title, "Title").optional(),
  body: text(0, LIMITS.body, "Text").optional(),
  bodyHtml: z.string().max(30_000).optional(),
}).strict().refine((v) => v.title !== undefined || v.body !== undefined, "Nothing to change.");

export const commentInputSchema = z.object({
  body: text(1, LIMITS.comment, "Comment"),
  // Written in the editor: sanitized on the server, which also derives the plain text in `body`.
  bodyHtml: z.string().max(12_000).optional(),
  parentId: z.string().min(1).max(40).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (findUrls(value.body).length > LIMITS.maxLinksComment) ctx.addIssue({ code: "custom", path: ["body"], message: `Use at most ${LIMITS.maxLinksComment} link in a comment.` });
});
export const commentEditSchema = z.object({ version: z.number().int().positive(), body: text(1, LIMITS.comment, "Comment"), bodyHtml: z.string().max(12_000).optional() }).strict();

export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) }).strict();

export const reportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT", "PROFILE"]),
  targetId: z.string().trim().min(1).max(120),
  category: z.enum(REPORT_CATEGORIES),
  details: text(0, 500, "Details").nullable().optional(),
}).strict();

export const handleSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3 to 30 letters, numbers or underscores.").refine((h) => !RESERVED_HANDLES.has(h) && !looksLikeStaffName(h.replace(/_/g, " ")), "That name is reserved.");
export const forumProfileSchema = z.object({ handle: handleSchema, bio: text(0, LIMITS.bio, "Bio").nullable().optional() }).strict();

export const feedQuerySchema = z.object({
  sort: z.enum(["new", "top"]).default("new"),
  window: z.enum(["day", "week", "month", "all"]).default("week"),
  community: z.string().trim().toLowerCase().max(40).optional(),
  type: z.enum(POST_TYPES).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

/** Splits plain text into text and safe-link parts for rendering; unsafe or non-public links stay as plain text. */
export function linkifyParts(input: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let last = 0;
  for (const match of input.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    const raw = match[0].replace(/[.,;:!?)\]]+$/, "");
    if (index > last) parts.push({ text: input.slice(last, index) });
    parts.push(isPublicHttpsUrl(raw) ? { text: raw, href: raw } : { text: raw });
    last = index + raw.length;
  }
  if (last < input.length) parts.push({ text: input.slice(last) });
  return parts;
}
