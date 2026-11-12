import { z } from "zod";
import { isPublicHttpsUrl } from "@/features/deals/validation";

export const LIMITS = { title: 200, body: 10_000, comment: 3_000, maxLinksPost: 3, maxLinksComment: 1, maxCommentDepth: 2, bio: 280 } as const;
export const POST_TYPES = ["DEAL", "DISCUSSION", "QUESTION"] as const;
export const REPORT_CATEGORIES = ["SPAM", "SCAM", "HARASSMENT", "HATE", "ILLEGAL", "PRIVACY", "IMPERSONATION", "OFF_TOPIC", "OTHER"] as const;
export const REPORT_LABELS: Record<(typeof REPORT_CATEGORIES)[number], string> = {
  SPAM: "Spam or advertising", SCAM: "Scam or phishing", HARASSMENT: "Harassment or threats", HATE: "Hate or abuse", ILLEGAL: "Illegal goods or activity",
  PRIVACY: "Shares personal details", IMPERSONATION: "Impersonation", OFF_TOPIC: "Off topic", OTHER: "Something else",
};
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
  title: text(5, LIMITS.title, "Title"),
  body: text(0, LIMITS.body, "Text").default(""),
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
}).strict().refine((v) => v.title !== undefined || v.body !== undefined, "Nothing to change.");

export const commentInputSchema = z.object({
  body: text(1, LIMITS.comment, "Comment"),
  parentId: z.string().min(1).max(40).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (findUrls(value.body).length > LIMITS.maxLinksComment) ctx.addIssue({ code: "custom", path: ["body"], message: `Use at most ${LIMITS.maxLinksComment} link in a comment.` });
});
export const commentEditSchema = z.object({ version: z.number().int().positive(), body: text(1, LIMITS.comment, "Comment") }).strict();

export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) }).strict();

export const reportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT", "PROFILE"]),
  targetId: z.string().trim().min(1).max(120),
  category: z.enum(REPORT_CATEGORIES),
  details: text(0, 500, "Details").nullable().optional(),
}).strict();

export const handleSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3 to 30 letters, numbers or underscores.").refine((h) => !RESERVED_HANDLES.has(h), "That name is reserved.");
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
