/** JSON for an inline <script type="application/ld+json">: "<" and line separators are escaped so deal text can never close the tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** For links built from third-party data (scraped pages, affiliate feeds): only https addresses are clickable. */
export function safeHttpsHref(value: unknown): string {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; }
}
