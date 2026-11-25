/**
 * Draws the deal's share card on a canvas in the visitor's browser (no server cost, no outside service, the site's own font) and
 * returns it as a PNG. It follows the approved design: a bordered rounded card with the product photo on the left (discount badge on
 * its corner) and the title beside it, a lavender price panel (Deal Price | MRP | You Save), the coupon when there is one, bold-named
 * bank offers, and a small "Follow Us" line. No logo, no button, no banner. One product picture only, never stretched.
 * The card is always square: 1080 x 1080 by default, growing (still square) only when the content needs it. Browser-only.
 */
import { offerShareLine } from "../bank-offers";
import { formatPaise } from "../currency";
import { minorSavings } from "../validation";
import { chooseProductImageBitmap } from "./select-image";
import type { ShareDealData } from "./types";

export type RenderedCard = { blob: Blob; width: number; height: number; imageUrl: string | null };

export const CARD_VERSION = 4; // bump when the drawing changes, so cached cards are redrawn
const BASE_W = 1080;
const PAD = 46;
const C = { purple: "#5815C5", purple2: "#7C3AED", navy: "#1E1B4B", muted: "#6B7280", panel: "#EEE8FF", border: "#B79CF0", divider: "#D6D2E4", green: "#15803D", greenBg: "#CDF4D3", red: "#DC2626", white: "#FFFFFF" };

type Ctx = CanvasRenderingContext2D;
const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

type Word = { text: string; bold: boolean };
/** Breaks words (some bold, some regular) into lines that fit `maxW`, measuring each in its own weight. */
function wrapRich(ctx: Ctx, words: Word[], maxW: number, fontFor: (bold: boolean) => string): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0;
  const measure = (w: Word) => { ctx.font = fontFor(w.bold); return ctx.measureText(`${w.text} `).width; };
  for (const w of words) {
    const wide = measure(w);
    if (line.length && width + wide > maxW + ctx.measureText(" ").width) { lines.push(line); line = []; width = 0; }
    line.push(w); width += wide;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Plain-text wrap in the current font; past `maxLines` the last line ends with an ellipsis. */
function wrap(ctx: Ctx, text: string, maxW: number, maxLines = 99): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
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

type Plan = { width: number; height: number; contentHeight: number; draw: (ctx: Ctx) => void };

/** Lays the whole card out for a square of side `W` and reports its content height; drawing happens later with the same numbers. */
function plan(deal: ShareDealData, picture: ImageBitmap | null, family: string, imgH = 330, extra = 0, W = BASE_W): Plan {
  const font = (weight: number, px: number) => `${weight} ${px}px ${family}`;
  const m = document.createElement("canvas").getContext("2d") as Ctx;
  const { savingsMinor, discountPercent } = minorSavings(deal.mrpMinor, deal.priceMinor);
  const innerW = W - PAD * 2;
  let y = 42;

  // A. Product: photo left, a thin divider, then the title and store.
  const imgW = Math.round(innerW * 0.5);
  const dividerX = PAD + imgW + 22, titleX = dividerX + 28, titleW = W - PAD - titleX;
  m.font = font(800, 40);
  const titleLines = wrap(m, deal.title, titleW, 6);
  const titleLead = 49;
  const titleBlockH = titleLines.length * titleLead + (deal.storeName ? 52 : 0);
  const productTop = y;
  const productH = Math.max(imgH, titleBlockH);
  y += productH + 26 + extra;

  // B. Price panel: Deal Price | MRP | You Save, in one row.
  const showSave = savingsMinor > 0;
  const price = formatPaise(deal.priceMinor), mrp = formatPaise(deal.mrpMinor), save = `${formatPaise(savingsMinor)} (${discountPercent}%)`;
  let priceSize = 70, otherSize = 38;
  const widths = () => {
    m.font = font(900, priceSize); const a = m.measureText(price).width;
    m.font = font(700, otherSize); const b = showSave ? m.measureText(mrp).width : 0, c = showSave ? m.measureText(save).width : 0;
    return { a, b, c };
  };
  const panelInner = innerW - 44;
  // The three parts shrink together (never below a readable size) until the row fits the panel.
  for (let { a, b, c } = widths(); showSave && a + b + c + 40 + 90 > panelInner && priceSize > 50; { a, b, c } = widths()) { priceSize -= 3; otherSize = Math.max(30, otherSize - 2); }
  const w = widths();
  const panelH = 150;
  const panelTop = y;
  y += panelH + 20 + extra;

  // C. Coupon (only when there is one).
  const couponH = deal.couponCode ? 66 : 0;
  const couponTop = y;
  if (couponH) y += couponH + 22 + extra;

  // D. Bank offers (only when there are some): bold bank name, regular conditions, wrapped, never cut.
  const offerSize = 31, offerLead = 42;
  const offerRows = deal.bankOffers.map((o) => {
    const head = `${o.bankName}:`;
    const rest = offerShareLine(o).slice(head.length).trim();
    const words: Word[] = [...head.split(" ").map((t) => ({ text: t, bold: true })), ...rest.split(" ").filter(Boolean).map((t) => ({ text: t, bold: false }))];
    return wrapRich(m, words, innerW - 40, (bold) => font(bold ? 800 : 500, offerSize));
  });
  const offersH = offerRows.length ? 58 + offerRows.reduce((s, r) => s + r.length * offerLead + 8, 0) : 0;
  const offersTop = y;
  if (offersH) y += offersH + 14;

  // E. Divider and a small "Follow Us" line, centred, no banner.
  const footTop = y;
  y += 76;
  const height = Math.max(W, Math.ceil(y + 24)); // square unless the content really cannot fit
  const footY = height - 44;

  return { width: W, height, contentHeight: y + 24, draw: (ctx) => {
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, height);
    // Outer rounded border.
    ctx.lineWidth = 3; ctx.strokeStyle = C.border; roundRect(ctx, 10, 10, W - 20, height - 20, 44); ctx.stroke();

    // A
    if (picture) {
      const s = Math.min(imgW / picture.width, imgH / picture.height); // contain: never stretched or cropped
      const pw = picture.width * s, ph = picture.height * s;
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(picture, PAD + (imgW - pw) / 2, productTop + (imgH - ph) / 2, pw, ph);
    } else {
      ctx.fillStyle = C.panel; roundRect(ctx, PAD, productTop, imgW, imgH, 22); ctx.fill();
      ctx.fillStyle = C.muted; ctx.textBaseline = "middle"; ctx.font = font(700, 30); const t = "No photo"; ctx.fillText(t, PAD + (imgW - ctx.measureText(t).width) / 2, productTop + imgH / 2);
    }
    const badge = deal.expired ? "EXPIRED" : discountPercent > 0 ? `${discountPercent}% OFF` : "";
    if (badge) { ctx.font = font(800, 38); const bw = ctx.measureText(badge).width + 44; ctx.fillStyle = deal.expired ? C.muted : C.red; roundRect(ctx, PAD + imgW - bw, productTop + 6, bw, 62, 31); ctx.fill(); ctx.fillStyle = C.white; ctx.textBaseline = "middle"; ctx.fillText(badge, PAD + imgW - bw + 22, productTop + 38); }
    ctx.fillStyle = C.divider; ctx.fillRect(dividerX, productTop + 4, 2, productH - 8);
    ctx.textBaseline = "top"; ctx.fillStyle = C.navy; ctx.font = font(800, 40);
    titleLines.forEach((l, i) => ctx.fillText(l, titleX, productTop + 2 + i * titleLead));
    if (deal.storeName) { ctx.font = font(500, 32); ctx.fillStyle = C.muted; ctx.fillText(`Available at ${deal.storeName}`, titleX, productTop + 2 + titleLines.length * titleLead + 10); }

    // B
    ctx.fillStyle = C.panel; roundRect(ctx, PAD, panelTop, innerW, panelH, 34); ctx.fill();
    let x = PAD + 28;
    ctx.textBaseline = "alphabetic";
    ctx.font = font(800, 32); ctx.fillStyle = C.purple; ctx.fillText("Deal Price:", x, panelTop + 46);
    ctx.font = font(900, priceSize); ctx.fillText(price, x, panelTop + 46 + priceSize * 0.98);
    x += w.a + 28;
    if (showSave) {
      ctx.fillStyle = C.divider; ctx.fillRect(x, panelTop + 26, 2, panelH - 52); x += 26;
      ctx.font = font(700, 32); ctx.fillStyle = C.muted; ctx.fillText("MRP:", x, panelTop + 56);
      ctx.font = font(700, otherSize); const my = panelTop + 56 + otherSize * 1.15; ctx.fillText(mrp, x, my); ctx.fillRect(x, my - otherSize * 0.32, w.b, 3);
      const pillW = Math.max(w.c, 0) + 48, pillX = W - PAD - 16 - pillW;
      ctx.fillStyle = C.greenBg; roundRect(ctx, pillX, panelTop + 18, pillW, panelH - 36, 26); ctx.fill();
      ctx.fillStyle = C.green; ctx.font = font(800, 32); const yl = "You Save"; ctx.fillText(yl, pillX + (pillW - ctx.measureText(yl).width) / 2, panelTop + 62);
      ctx.font = font(800, otherSize); ctx.fillText(save, pillX + (pillW - w.c) / 2, panelTop + 62 + otherSize * 1.25);
    }

    // C
    if (couponH) {
      ctx.font = font(800, 36); const label = `Coupon: ${deal.couponCode}`; const cw = Math.min(innerW, ctx.measureText(label).width + 118);
      ctx.fillStyle = C.panel; roundRect(ctx, PAD, couponTop, cw, couponH, 22); ctx.fill();
      // A small ticket icon drawn with lines (no emoji font needed).
      ctx.strokeStyle = C.purple; ctx.lineWidth = 3; roundRect(ctx, PAD + 24, couponTop + couponH / 2 - 14, 46, 28, 6); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(PAD + 47, couponTop + couponH / 2 - 10); ctx.lineTo(PAD + 47, couponTop + couponH / 2 + 10); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.navy; ctx.textBaseline = "middle"; ctx.fillText(label, PAD + 90, couponTop + couponH / 2 + 2);
    }

    // D
    if (offersH) {
      ctx.textBaseline = "middle"; ctx.fillStyle = C.purple; ctx.strokeStyle = C.purple; ctx.lineWidth = 3;
      const hx = PAD + 4, hy = offersTop + 24; // a small bank icon: roof, pillars, base
      ctx.beginPath(); ctx.moveTo(hx, hy - 6); ctx.lineTo(hx + 18, hy - 20); ctx.lineTo(hx + 36, hy - 6); ctx.closePath(); ctx.fill();
      [4, 15, 26].forEach((dx) => ctx.fillRect(hx + dx, hy - 2, 6, 17)); ctx.fillRect(hx, hy + 18, 36, 5);
      ctx.fillStyle = C.navy; ctx.font = font(800, 38); ctx.fillText("Bank Offers:", PAD + 56, offersTop + 22);
      let oy = offersTop + 58;
      offerRows.forEach((rows) => {
        ctx.fillStyle = C.purple; ctx.beginPath(); ctx.arc(PAD + 14, oy + offerLead * 0.52, 6.5, 0, Math.PI * 2); ctx.fill();
        rows.forEach((words, k) => {
          let wx = PAD + 40;
          words.forEach((wd) => { ctx.font = font(wd.bold ? 800 : 500, offerSize); ctx.fillStyle = C.navy; ctx.textBaseline = "top"; ctx.fillText(wd.text, wx, oy + k * offerLead + 4); wx += ctx.measureText(`${wd.text} `).width; });
        });
        oy += rows.length * offerLead + 8;
      });
    }

    // E
    ctx.fillStyle = C.divider; ctx.fillRect(PAD, Math.max(footTop + 6, footY - 40), innerW, 2);
    ctx.font = font(700, 30); ctx.fillStyle = C.purple; ctx.textBaseline = "alphabetic"; const f = "Follow Us for More Deals!";
    ctx.fillText(f, (W - ctx.measureText(f).width) / 2, Math.max(footTop + 56, footY));
  } };
}

export async function renderShareCard(deal: ShareDealData, _url: string): Promise<RenderedCard> {
  void _url; // the link travels in the message, not in the picture
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  await document.fonts?.ready;
  const chosen = await chooseProductImageBitmap(deal.images);
  const bitmap = chosen?.bitmap ?? null;

  // The card is always square. Text stays full size; when the content is taller than the square, the whole square grows (wider lines
  // wrap less), so the picture keeps its 1:1 shape instead of turning into a tall strip that chat apps crop.
  let side = BASE_W;
  let p = plan(deal, bitmap, family, 330, 0, side);
  // a little slack in each step, so wider lines cannot push the content back over the edge
  for (let i = 0; i < 6 && p.contentHeight > side; i++) { side = Math.ceil((p.contentHeight + 24) / 8) * 8; p = plan(deal, bitmap, family, 330, 0, side); }
  if (p.contentHeight < side) {
    // Short content: give the photo more room first, then spread the rest of the space between the sections, so the square has no empty band.
    const imgH = Math.min(440, 330 + Math.round((side - p.contentHeight) * 0.6));
    p = plan(deal, bitmap, family, imgH, 0, side);
    if (p.contentHeight < side) p = plan(deal, bitmap, family, imgH, Math.min(34, Math.floor((side - p.contentHeight) / 5)), side);
  }
  const canvas = document.createElement("canvas");
  canvas.width = p.width; canvas.height = p.height;
  p.draw(canvas.getContext("2d") as Ctx);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The share picture could not be created.");
  return { blob, width: p.width, height: p.height, imageUrl: chosen?.url ?? null };
}

/** Cache key: changes whenever anything shown on the card changes. */
export const cardKey = (deal: ShareDealData, url: string) => JSON.stringify([CARD_VERSION, url, deal.title, deal.priceMinor, deal.mrpMinor, deal.storeName, deal.couponCode, deal.expired, deal.images, deal.bankOffers.map((o) => [o.id, offerShareLine(o)])]);
