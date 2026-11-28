import "server-only";
import sanitizeHtml from "sanitize-html";
import { isPublicHttpsUrl } from "@/features/deals/validation";
import { cleanText } from "@/features/community/validation";

/** Longest post text (without formatting) the composer accepts. */
export const RICH_TEXT_LIMIT = 5_000;

const REL = "nofollow ugc noopener noreferrer";
const BLOCK_END = /<\/(p|li|h2|h3|blockquote|pre|tr)>|<br\s*\/?>/gi;
const CELL_END = /<\/(td|th)>(?=<(?:td|th))/gi;

/**
 * Allow-list sanitizer for posts and comments written in the editor. Only simple formatting survives: no scripts, styles, classes,
 * images, forms or event attributes. Links must be public https links and always get rel="nofollow ugc noopener noreferrer".
 */
export function sanitizeRichHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "code", "pre", "table", "thead", "tbody", "tfoot", "tr", "th", "td"],
    // Tables (pasted spec sheets) keep their cell spans only; no styles, classes or widths.
    allowedAttributes: { a: ["href", "rel", "target"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      h1: "h2", h4: "h3", h5: "h3", h6: "h3", b: "strong", i: "em", strike: "s", del: "s",
      // Closing tags pass through here too (with no attributes), so every branch keeps the tag name "a"; unsafe links lose their address and are unwrapped below.
      a: (_tag, attribs): sanitizeHtml.Tag => (attribs.href && isPublicHttpsUrl(attribs.href.trim())
        ? { tagName: "a", attribs: { href: attribs.href.trim(), rel: REL, target: "_blank" } }
        : { tagName: "a", attribs: {} as Record<string, string> }),
    },
  }).replace(/<a>([^<]*)<\/a>/g, "$1").trim();
}

const decode = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Plain text of sanitized HTML (line breaks kept). Used for search, previews, duplicate checks and length limits. */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(CELL_END, " ").replace(BLOCK_END, (m) => (m.startsWith("<br") || m === "</tr>" ? "\n" : "\n\n"));
  return cleanText(decode(sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })));
}

/** Sanitize once, then derive the plain text that every other part of the community already understands. */
export function prepareRichBody(rawHtml: string): { html: string; text: string } {
  const html = sanitizeRichHtml(rawHtml);
  return { html, text: htmlToText(html) };
}
