/**
 * Draws the deal's share card on a canvas in the visitor's browser (no server cost, no outside service, the site's own font) and
 * returns it as a PNG. It follows the approved design: a bordered rounded card with the product photo on the left (discount badge on
 * its corner) and the title beside it, a lavender price panel (Deal Price | MRP | You Save), the coupon when there is one, and bold-named
 * bank offers. A lavender stripe across the top carries the MetaDeals4U logo and the "Follow Us" line. No button. One product picture
 * only, never stretched. Brand, category and a short About appear beside the photo only when the title leaves room, and are left out when the deal lacks them.
 * The card is always square: 1080 x 1080 by default, growing (still square) only when the content needs it. Browser-only.
 */
import { offerShareLine } from "../bank-offers";
import { formatPaise } from "../currency";
import { minorSavings } from "../validation";
import { chooseProductImageBitmap } from "./select-image";
import type { ShareDealData } from "./types";

export type RenderedCard = { blob: Blob; width: number; height: number; imageUrl: string | null };

export const CARD_VERSION = 11; // bump when the drawing changes, so cached cards are redrawn
const BASE_W = 1080;
const PAD = 46;
const C = { orange: "#FF8A1F", purple: "#5815C5", purple2: "#7C3AED", navy: "#1E1B4B", muted: "#6B7280", panel: "#EEE8FF", border: "#B79CF0", divider: "#D6D2E4", green: "#15803D", greenBg: "#CDF4D3", red: "#DC2626", white: "#FFFFFF" };

type Ctx = CanvasRenderingContext2D;
const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

type Icon = "tag" | "layers" | "info";
/** Small line icons in the brand purple, drawn with paths so no icon font is needed. `x` is the left edge, `cy` the vertical centre. */
function drawIcon(ctx: Ctx, icon: Icon, x: number, cy: number, size: number) {
  ctx.save(); ctx.strokeStyle = C.purple; ctx.fillStyle = C.purple; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
  const r = size / 2, cx = x + r;
  ctx.beginPath();
  if (icon === "tag") { ctx.moveTo(x + 2, cy - r + 3); ctx.lineTo(x + size - 8, cy - r + 3); ctx.lineTo(x + size - 2, cy + 3); ctx.lineTo(x + size - 12, cy + r - 2); ctx.lineTo(x + 2, cy + r - 2); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 9, cy - 2, 2.5, 0, 7); ctx.fill(); }
  else if (icon === "layers") { for (const dy of [4, -2, -8]) { ctx.moveTo(cx, cy + dy - 9); ctx.lineTo(cx + r - 2, cy + dy - 3); ctx.lineTo(cx, cy + dy + 3); ctx.lineTo(cx - r + 2, cy + dy - 3); ctx.closePath(); } ctx.stroke(); }
  else { ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 1); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy - r * 0.45, 2, 0, 7); ctx.fill(); }
  ctx.restore();
}

/** The MetaDeals4U mark: an orange-to-purple tile with a white shopping bag and three speed lines, as on the website. */
function drawLogo(ctx: Ctx, x: number, y: number, size: number) {
  ctx.save();
  ctx.strokeStyle = C.orange; ctx.lineWidth = 4; ctx.lineCap = "round";
  [[-14, 0.78, 12], [-10, 0.58, 18], [-14, 0.38, 12]].forEach(([dx, f, len]) => { ctx.beginPath(); ctx.moveTo(x + dx, y + size * f); ctx.lineTo(x + dx + len, y + size * f); ctx.stroke(); });
  const g = ctx.createLinearGradient(x, y, x + size, y + size); g.addColorStop(0, "#FFB547"); g.addColorStop(0.45, C.orange); g.addColorStop(1, C.purple);
  ctx.fillStyle = g; roundRect(ctx, x, y, size, size, size * 0.26); ctx.fill();
  ctx.strokeStyle = C.white; ctx.lineWidth = size * 0.07; ctx.lineJoin = "round";
  const bx = x + size * 0.24, by = y + size * 0.36, bw = size * 0.52, bh = size * 0.42;
  roundRect(ctx, bx, by, bw, bh, size * 0.06); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + size / 2, by, size * 0.14, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

/** Cuts text to about `max` characters at a word boundary, adding an ellipsis when something was removed. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd().replace(/[,;:.\-]+$/, "")}…`;
}

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
  const HEADER = 118;
  let y = HEADER + 28;

  // A. Product: photo left, a thin divider, then the title and store.
  // The photo column is only as wide as the photo needs (up to 44% of the card), so a tall photo does not leave an empty margin and the title gets the room.
  const imgW = Math.min(Math.round(innerW * 0.44), Math.max(300, Math.round(imgH * (picture ? picture.width / picture.height : 1)) + 12));
  const dividerX = PAD + imgW + 22, titleX = dividerX + 28, titleW = W - PAD - titleX;
  // One title size for every card, so "how many lines" means the same thing on each: it decides what goes under the title (below).
  const storeH = deal.storeName ? 46 : 0;
  const titleSize = 44;
  m.font = font(800, titleSize);
  const titleLines = wrap(m, deal.title, titleW, 6);
  const titleLead = Math.round(titleSize * 1.2);
  // What goes under the title depends on how many lines the title takes (never invented; a missing fact is skipped):
  // 1 line: brand, category and a ~200 character "About"; 2 lines: the same with ~100 characters; 3 lines: brand and category; 4 or more: nothing.
  const n = titleLines.length;
  const brand = deal.brand?.trim(), category = deal.categoryName?.trim();
  const facts: { icon: Icon; label: string; value: string }[] = [];
  if (n <= 3 && brand) facts.push({ icon: "tag", label: "Brand:", value: brand });
  if (n <= 3 && category) facts.push({ icon: "layers", label: "Category:", value: category });
  const aboutMax = n === 1 ? 200 : n === 2 ? 100 : 0;
  const aboutText = aboutMax && deal.description ? clip(deal.description.replace(/\s+/g, " ").trim(), aboutMax) : "";
  const FACT_LEAD = 46, ABOUT_SIZE = 28, ABOUT_LEAD = 37;
  const aboutRows = aboutText ? wrapRich(m, [{ text: "About:", bold: true }, ...aboutText.split(" ").map((t) => ({ text: t, bold: false }))], titleW - 46, (bold) => font(bold ? 800 : 500, ABOUT_SIZE)) : [];
  const detailsH = facts.length * FACT_LEAD + (aboutRows.length ? aboutRows.length * ABOUT_LEAD + 8 : 0);
  const titleBlockH = titleLines.length * titleLead + storeH + (detailsH ? 14 + detailsH : 0);
  const productTop = y;
  const productH = Math.max(imgH, titleBlockH);
  y += productH + 26 + extra;

  // B. Price panel: Deal Price | MRP | You Save, in one row.
  const showSave = savingsMinor > 0;
  const price = deal.headline || formatPaise(deal.priceMinor), mrp = formatPaise(deal.mrpMinor), save = `${formatPaise(savingsMinor)} (${discountPercent}%)`;
  let priceSize = 70, otherSize = 38;
  const widths = () => {
    m.font = font(900, priceSize); const a = m.measureText(price).width;
    m.font = font(700, otherSize); const b = showSave ? m.measureText(mrp).width : 0, c = showSave ? m.measureText(save).width : 0;
    return { a, b, c };
  };
  const panelInner = innerW - 44;
  // The three parts shrink together (never below a readable size) until the row fits the panel.
  for (let { a, b, c } = widths(); showSave && a + b + c + 40 + 90 > panelInner && priceSize > 50; { a, b, c } = widths()) { priceSize -= 3; otherSize = Math.max(30, otherSize - 2); }
  // A headline replaces the price and can be long: shrink it to fit the panel.
  if (deal.headline) while (widths().a > panelInner && priceSize > 28) priceSize -= 2;
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

  y += 14;
  const height = Math.max(W, Math.ceil(y + 22)); // square unless the content really cannot fit

  return { width: W, height, contentHeight: y + 22, draw: (ctx) => {
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, height);
    // Outer rounded border.
    // Top stripe: logo, then the follow line. It is clipped to the card's rounded corners.
    ctx.save(); roundRect(ctx, 10, 10, W - 20, height - 20, 44); ctx.clip();
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, HEADER); ctx.restore();
    drawLogo(ctx, PAD + 4, 26, 64);
    ctx.textBaseline = "middle"; ctx.font = font(850, 54); ctx.fillStyle = C.purple; ctx.fillText("MetaDeals", PAD + 84, HEADER / 2 + 2);
    const mw = ctx.measureText("MetaDeals").width; ctx.fillStyle = C.orange; ctx.fillText("4U", PAD + 84 + mw, HEADER / 2 + 2);
    const wordW = mw + ctx.measureText("4U").width;
    const divX = PAD + 84 + wordW + 26;
    ctx.fillStyle = C.divider; ctx.fillRect(divX, 30, 2, HEADER - 60);
    const fx = divX + 26, fw = W - PAD - fx;
    let fs = 36; ctx.font = font(800, fs); while (fs > 26 && ctx.measureText("Follow Us for More Deals!").width > fw) { fs -= 1; ctx.font = font(800, fs); }
    ctx.fillStyle = C.purple; ctx.textBaseline = "alphabetic"; ctx.fillText("Follow Us for More Deals!", fx, HEADER / 2 - 2);
    let ts = 24; ctx.font = font(500, ts); while (ts > 18 && ctx.measureText("Discover amazing offers and save more every day.").width > fw) { ts -= 1; ctx.font = font(500, ts); }
    ctx.fillStyle = C.navy; ctx.fillText("Discover amazing offers and save more every day.", fx, HEADER / 2 + 30);
    ctx.lineWidth = 3; ctx.strokeStyle = C.border; roundRect(ctx, 10, 10, W - 20, height - 20, 44); ctx.stroke();

    // A
    if (picture) {
      const s = Math.min(imgW / picture.width, imgH / picture.height); // contain: never stretched or cropped
      const pw = picture.width * s, ph = picture.height * s;
      ctx.imageSmoothingQuality = "high";
      ctx.save(); roundRect(ctx, PAD + (imgW - pw) / 2, productTop + (imgH - ph) / 2, pw, ph, 22); ctx.clip();
      ctx.drawImage(picture, PAD + (imgW - pw) / 2, productTop + (imgH - ph) / 2, pw, ph); ctx.restore();
    } else {
      ctx.fillStyle = C.panel; roundRect(ctx, PAD, productTop, imgW, imgH, 22); ctx.fill();
      ctx.fillStyle = C.muted; ctx.textBaseline = "middle"; ctx.font = font(700, 30); const t = "No photo"; ctx.fillText(t, PAD + (imgW - ctx.measureText(t).width) / 2, productTop + imgH / 2);
    }
    const badge = deal.expired ? "EXPIRED" : discountPercent > 0 ? `${discountPercent}% OFF` : "";
    if (badge) { ctx.font = font(800, 38); const bw = ctx.measureText(badge).width + 44; ctx.fillStyle = deal.expired ? C.muted : C.red; roundRect(ctx, PAD + imgW - bw, productTop + 6, bw, 62, 31); ctx.fill(); ctx.fillStyle = C.white; ctx.textBaseline = "middle"; ctx.fillText(badge, PAD + imgW - bw + 22, productTop + 38); }
    ctx.fillStyle = C.divider; ctx.fillRect(dividerX, productTop + 4, 2, productH - 8);
    // The title block sits in the middle of the photo's height, so a short title is balanced beside the picture.
    const blockTop = productTop + Math.max(2, Math.floor((productH - titleBlockH) / 2));
    ctx.textBaseline = "top"; ctx.fillStyle = C.navy; ctx.font = font(800, titleSize);
    titleLines.forEach((l, i) => ctx.fillText(l, titleX, blockTop + i * titleLead));
    let fy = blockTop + titleLines.length * titleLead;
    if (deal.storeName) { ctx.font = font(500, 32); ctx.fillStyle = C.muted; ctx.textBaseline = "top"; ctx.fillText(`Available at ${deal.storeName}`, titleX, fy + 4); fy += storeH; }
    fy += detailsH ? 14 : 0;
    facts.forEach((f, i) => {
      const cy = fy + i * FACT_LEAD + FACT_LEAD / 2;
      drawIcon(ctx, f.icon, titleX, cy, 30);
      ctx.textBaseline = "middle"; ctx.font = font(800, 31); ctx.fillStyle = C.navy; ctx.fillText(f.label, titleX + 46, cy + 1);
      const lw = ctx.measureText(`${f.label} `).width; ctx.font = font(500, 31); ctx.fillText(f.value, titleX + 46 + lw, cy + 1);
    });
    if (aboutRows.length) {
      const ay = fy + facts.length * FACT_LEAD + 4;
      drawIcon(ctx, "info", titleX, ay + ABOUT_LEAD / 2, 30);
      aboutRows.forEach((row, k) => {
        let wx = titleX + 46; ctx.textBaseline = "middle";
        row.forEach((wd) => { ctx.font = font(wd.bold ? 800 : 500, ABOUT_SIZE); ctx.fillStyle = C.navy; ctx.fillText(wd.text, wx, ay + k * ABOUT_LEAD + ABOUT_LEAD / 2 + 1); wx += ctx.measureText(`${wd.text} `).width; });
      });
    }

    // B
    ctx.fillStyle = C.panel; roundRect(ctx, PAD, panelTop, innerW, panelH, 34); ctx.fill();
    let x = PAD + 28;
    ctx.textBaseline = "alphabetic";
    ctx.font = font(800, 32); ctx.fillStyle = C.purple; ctx.fillText(deal.headline ? "Offer:" : "Deal Price:", x, panelTop + 46);
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
    const imgH = Math.min(520, 330 + Math.round((side - p.contentHeight) * 0.85));
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
export const cardKey = (deal: ShareDealData, url: string) => JSON.stringify([CARD_VERSION, url, deal.title, deal.priceMinor, deal.mrpMinor, deal.headline ?? "", deal.storeName, deal.couponCode, deal.expired, deal.images, deal.bankOffers.map((o) => [o.id, offerShareLine(o)])]);
