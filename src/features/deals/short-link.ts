/** Short share links for deals: /d/<code>, where the code is the last 8 characters of the deal id (random in a cuid). Plain module: used by the browser and the server. */
export const DEAL_CODE_LENGTH = 8;
export const DEAL_CODE_PATTERN = /^[a-z0-9]{6,12}$/i;

export function dealShortCode(id: string): string | null {
  return /^[a-z0-9]{16,}$/i.test(id) ? id.slice(-DEAL_CODE_LENGTH).toLowerCase() : null;
}

/** The link to copy or send: short when the deal has a real id, otherwise the full deal page address. */
export function dealShareUrl(origin: string, deal: { id: string; slug?: string | null }): string {
  const code = dealShortCode(deal.id);
  return code ? `${origin}/d/${code}` : `${origin}/deal/${encodeURIComponent(deal.slug || deal.id)}`;
}
