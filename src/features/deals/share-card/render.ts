/**
 * Draws the deal's share card on a canvas in the visitor's browser (no server cost, no outside service, the same fonts as the site)
 * and returns it as a PNG. One product picture only, never stretched. Browser-only.
 */
import { offerShareLine } from "../bank-offers";
import { formatPaise } from "../currency";
import { minorSavings } from "../validation";
import { chooseLayout, FORMAT_SIZE, GEOM, LAYOUT_VERSION, MIN_FONT, TYPE, type Format, type LayoutInput } from "./layout";
import { pickBestImage, type ImageProbe } from "./select-image";
import type { ShareDealData } from "./types";

export type RenderedCard = { blob: Blob; width: number; height: number; format: Format; imageUrl: string | null };

const C = { purple: "#5815C5", purple2: "#7C3AED", navy: "#1E1B4B", muted: "#6B7280", line: "#E9E3FB", tint: "#F4F0FF", green: "#15803D", greenBg: "#DCFCE7", red: "#DC2626", orange: "#FF8A1F", white: "#FFFFFF" };

/** Loads a same-origin picture; resolves null when it cannot be loaded, so a bad picture never breaks the card. */
function loadImage(src: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.crossOrigin = "anonymous"; // a picture from another site would taint the canvas, so it fails here instead
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0 ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

type Ctx = CanvasRenderingContext2D;
const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

/** Breaks text into lines that fit `maxW`; past `maxLines` the last line ends with an ellipsis. */
function wrap(ctx: Ctx, text: string, maxW: number, maxLines = 99): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

/** The text blocks draw after the canvas exists; they reach it through this holder. */
const ctxRef: { current: Ctx } = { current: null as unknown as Ctx };
type Block = { height: number; draw: (x: number, y: number) => void };

/** Phones get the tall portrait card only (it fills a chat screen and its text stays large); wider screens may get any of the three. */
export const isPhoneScreen = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

export async function renderShareCard(deal: ShareDealData, url: string, phone = isPhoneScreen()): Promise<RenderedCard> {
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const font = (weight: number, px: number) => `${weight} ${px}px ${family}`;
  await document.fonts?.ready;

  // 1. The one picture: the primary one when it is usable, else the best of the rest.
  const loaded = await Promise.all(deal.images.slice(0, 6).map(async (src) => ({ src, img: await loadImage(src) })));
  const probes: ImageProbe[] = loaded.flatMap((l, i) => (l.img ? [{ url: l.src, width: l.img.naturalWidth, height: l.img.naturalHeight, primary: i === 0 }] : []));
  const chosen = pickBestImage(probes);
  const picture = chosen ? loaded.find((l) => l.src === chosen.url)?.img ?? null : null;

  // 2. Text and the shape that suits picture and text together.
  const { savingsMinor, discountPercent } = minorSavings(deal.mrpMinor, deal.priceMinor);
  const offerLines = deal.bankOffers.map(offerShareLine);
  const logos = await Promise.all(deal.bankOffers.map((o) => (o.bankLogoUrl ? loadImage(o.bankLogoUrl, 4000) : Promise.resolve(null))));
  const input: LayoutInput = { imageWidth: chosen?.width ?? 1000, imageHeight: chosen?.height ?? 1000, title: deal.title, storeName: deal.storeName, hasDiscount: savingsMinor > 0, hasCoupon: Boolean(deal.couponCode), offerLines };
  const layout = chooseLayout(input, phone ? ["portrait"] : undefined);
  const base = FORMAT_SIZE[layout.format];

  const measure = document.createElement("canvas").getContext("2d") as Ctx;
  const textWidth = layout.mode === "side" ? base.width - GEOM.pad * 2 - Math.round((base.width - GEOM.pad * 2) * GEOM.sideImageShare) - GEOM.gap : base.width - GEOM.pad * 2;
  const t = TYPE[layout.mode];
  const titleSize = Math.max(MIN_FONT, t.title);
  const offerSize = Math.max(MIN_FONT, t.offer);

  // 3. The text blocks, measured with the real font so nothing can overlap or be cut.
  const blocks: Block[] = [];
  const gap = GEOM.gap;
  measure.font = font(800, titleSize);
  const titleLines = wrap(measure, deal.title, textWidth, 4);
  blocks.push({ height: titleLines.length * titleSize * 1.25, draw: (x, y) => { const c = ctxRef.current; c.font = font(800, titleSize); c.fillStyle = C.navy; c.textBaseline = "top"; titleLines.forEach((l, i) => c.fillText(l, x, y + i * titleSize * 1.25)); } });
  if (deal.storeName) blocks.push({ height: 50, draw: (x, y) => { const c = ctxRef.current; c.font = font(600, 32); c.fillStyle = C.muted; c.textBaseline = "top"; c.fillText(`Available at ${deal.storeName}`, x, y + 6); } });
  blocks.push({ height: 124, draw: (x, y) => {
    const c = ctxRef.current; c.textBaseline = "alphabetic";
    c.font = font(900, 104); c.fillStyle = C.navy; const price = formatPaise(deal.priceMinor); c.fillText(price, x, y + 104);
    if (savingsMinor > 0) { const w = c.measureText(price).width; c.font = font(600, 46); c.fillStyle = C.muted; const mrp = formatPaise(deal.mrpMinor); c.fillText(mrp, x + w + 24, y + 102); const mw = c.measureText(mrp).width; c.fillRect(x + w + 24, y + 84, mw, 3); }
  } });
  if (savingsMinor > 0) blocks.push({ height: 72, draw: (x, y) => {
    const c = ctxRef.current; const text = `You save ${formatPaise(savingsMinor)} (${discountPercent}% OFF)`; c.font = font(800, 36); const w = c.measureText(text).width + 44;
    c.fillStyle = C.greenBg; roundRect(c, x, y, w, 72, 36); c.fill(); c.fillStyle = C.green; c.textBaseline = "middle"; c.fillText(text, x + 22, y + 37);
  } });
  if (deal.couponCode) blocks.push({ height: 104, draw: (x, y) => {
    const c = ctxRef.current; c.font = font(800, 50); const code = deal.couponCode as string; const w = Math.min(textWidth, c.measureText(code).width + 210);
    c.fillStyle = "#F5F0FF"; roundRect(c, x, y, w, 104, 22); c.fill(); c.setLineDash([12, 8]); c.lineWidth = 3; c.strokeStyle = C.purple2; c.stroke(); c.setLineDash([]);
    c.textBaseline = "middle"; c.font = font(800, 26); c.fillStyle = C.purple2; c.fillText("COUPON", x + 24, y + 52); c.font = font(800, 50); c.fillStyle = C.purple; c.fillText(code, x + 186, y + 54);
  } });
  if (offerLines.length) {
    measure.font = font(600, offerSize);
    const rows = offerLines.map((line) => wrap(measure, line, textWidth - 64));
    const rowHeights = rows.map((r) => Math.max(44, r.length * offerSize * 1.35) + 14);
    blocks.push({ height: 56 + rowHeights.reduce((a, b) => a + b, 0), draw: (x, y) => {
      const c = ctxRef.current; c.textBaseline = "top"; c.font = font(800, 30); c.fillStyle = C.purple; c.fillText("BANK OFFERS", x, y + 4);
      let cy = y + 56;
      rows.forEach((r, i) => {
        const name = deal.bankOffers[i].bankName; const logo = logos[i];
        if (logo) { const s = Math.min(44 / logo.naturalWidth, 44 / logo.naturalHeight); const w = logo.naturalWidth * s, h = logo.naturalHeight * s; c.drawImage(logo, x + (44 - w) / 2, cy + (44 - h) / 2, w, h); }
        else { let hue = 0; for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360; c.fillStyle = `hsl(${hue} 55% 40%)`; roundRect(c, x, cy, 44, 44, 9); c.fill(); c.fillStyle = C.white; c.font = font(800, 26); c.textBaseline = "middle"; c.fillText(name.trim().charAt(0).toUpperCase(), x + 13, cy + 23); c.textBaseline = "top"; }
        c.font = font(600, offerSize); c.fillStyle = C.navy; r.forEach((l, k) => c.fillText(l, x + 64, cy + 3 + k * offerSize * 1.35));
        cy += rowHeights[i];
      });
    } });
  }
  const infoHeight = blocks.reduce((a, b) => a + b.height, 0) + gap * (blocks.length - 1);

  // 4. Space: the chosen shape, made taller only when the text really needs it.
  const area = base.height - GEOM.header - GEOM.footer - GEOM.pad;
  let height = base.height, imageBox: { x: number; y: number; w: number; h: number }, infoX: number, infoY: number;
  const top = GEOM.header + GEOM.pad / 2;
  if (layout.mode === "side") {
    const w = Math.round((base.width - GEOM.pad * 2) * GEOM.sideImageShare);
    height = base.height + Math.max(0, infoHeight - area);
    imageBox = { x: GEOM.pad, y: top, w, h: height - GEOM.header - GEOM.footer - GEOM.pad };
    infoX = GEOM.pad + w + gap; infoY = top;
  } else {
    const minImage = GEOM.stackMinImage * area;
    const imageH = Math.min(GEOM.stackMaxImage * area, Math.max(minImage, area - infoHeight - gap));
    height = base.height + Math.max(0, imageH + gap + infoHeight - area);
    imageBox = { x: GEOM.pad, y: top, w: base.width - GEOM.pad * 2, h: imageH };
    infoX = GEOM.pad; infoY = top + imageH + gap;
  }
  height = Math.round(height);

  // 5. Draw.
  const canvas = document.createElement("canvas");
  canvas.width = base.width; canvas.height = height;
  const ctx = canvas.getContext("2d") as Ctx;
  ctxRef.current = ctx;
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, base.width, height);
  ctx.fillStyle = C.purple; ctx.fillRect(0, 0, base.width, GEOM.header);
  ctx.textBaseline = "middle"; ctx.font = font(800, 56); ctx.fillStyle = C.white; ctx.fillText("MetaDeals", GEOM.pad, GEOM.header / 2 + 2);
  const wordmark = ctx.measureText("MetaDeals").width; ctx.fillStyle = C.orange; ctx.fillText("4U", GEOM.pad + wordmark, GEOM.header / 2 + 2);
  const badge = deal.expired ? "EXPIRED" : discountPercent > 0 ? `${discountPercent}% OFF` : "";
  if (badge) { ctx.font = font(800, 42); const w = ctx.measureText(badge).width + 52; ctx.fillStyle = deal.expired ? C.muted : C.red; roundRect(ctx, base.width - GEOM.pad - w, GEOM.header / 2 - 33, w, 66, 33); ctx.fill(); ctx.fillStyle = C.white; ctx.fillText(badge, base.width - GEOM.pad - w + 26, GEOM.header / 2 + 2); }

  ctx.fillStyle = C.white; roundRect(ctx, imageBox.x, imageBox.y, imageBox.w, imageBox.h, 28); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke();
  if (picture) {
    const inner = 28; const s = Math.min((imageBox.w - inner * 2) / picture.naturalWidth, (imageBox.h - inner * 2) / picture.naturalHeight); // contain: never stretched or cropped
    const w = picture.naturalWidth * s, h = picture.naturalHeight * s;
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(picture, imageBox.x + (imageBox.w - w) / 2, imageBox.y + (imageBox.h - h) / 2, w, h);
  } else {
    ctx.fillStyle = C.tint; roundRect(ctx, imageBox.x + 3, imageBox.y + 3, imageBox.w - 6, imageBox.h - 6, 26); ctx.fill();
    ctx.fillStyle = C.purple2; ctx.textBaseline = "middle"; ctx.font = font(800, 44); const label = "MetaDeals4U"; ctx.fillText(label, imageBox.x + (imageBox.w - ctx.measureText(label).width) / 2, imageBox.y + imageBox.h / 2);
  }

  let y = infoY;
  for (const b of blocks) { b.draw(infoX, y); y += b.height + gap; }

  const fy = height - GEOM.footer;
  ctx.fillStyle = C.tint; ctx.fillRect(0, fy, base.width, GEOM.footer);
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = C.purple; ctx.font = font(900, 62); ctx.fillText(deal.expired ? "MetaDeals4U" : "Grab This Deal!", GEOM.pad, fy + 78);
  const shown = url.replace(/^https?:\/\//, "");
  let urlSize = 38; ctx.font = font(600, urlSize); while (urlSize > MIN_FONT && ctx.measureText(shown).width > base.width - GEOM.pad * 2) { urlSize -= 1; ctx.font = font(600, urlSize); }
  ctx.fillStyle = C.navy; ctx.fillText(shown, GEOM.pad, fy + 140);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The share picture could not be created.");
  return { blob, width: base.width, height, format: layout.format, imageUrl: chosen?.url ?? null };
}

/** Cache key: changes whenever anything shown on the card changes. */
export const cardKey = (deal: ShareDealData, url: string, phone = isPhoneScreen()) => JSON.stringify([LAYOUT_VERSION, phone, url, deal.title, deal.priceMinor, deal.mrpMinor, deal.storeName, deal.couponCode, deal.expired, deal.images, deal.bankOffers.map((o) => [o.id, offerShareLine(o), o.bankLogoUrl])]);
