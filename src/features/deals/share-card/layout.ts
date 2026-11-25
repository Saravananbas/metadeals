/**
 * Deciding the share card's shape. The picture's proportions AND the amount of text both count: each of the three formats is
 * scored on how well the picture fits its box and how comfortably the text fits beside or below it, and the best one wins.
 * Plain arithmetic (no canvas), so it is the same on the server, in tests and in the browser.
 */
export type Format = "portrait" | "landscape" | "square";
export const LAYOUT_VERSION = 1; // bump when the drawing changes, so cached cards are redrawn
export const FORMAT_SIZE: Record<Format, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1350, height: 1080 },
  square: { width: 1080, height: 1080 },
};
/** Shared by the scorer and the renderer so their idea of the space is the same. */
export const GEOM = { pad: 48, header: 112, footer: 184, gap: 28, sideImageShare: 0.42, stackMinImage: 0.38, stackMaxImage: 0.62 };
/** Text sizes in pixels on the full-size card (about 12 to 16 px on a phone screen, never smaller than MIN_FONT). */
export const TYPE = { stack: { title: 56, offer: 36 }, side: { title: 48, offer: 33 } };
export const MIN_FONT = 24;

export type LayoutInput = {
  imageWidth: number; imageHeight: number; title: string; storeName?: string | null;
  hasDiscount: boolean; hasCoupon: boolean; offerLines: string[];
};
export type LayoutCandidate = { format: Format; mode: "stack" | "side"; score: number; fits: boolean; infoNeeded: number; infoAvailable: number; imageCoverage: number };

/** Average glyph width of the bold card font, as a fraction of the font size. A little generous, so estimates err towards "needs more room". */
const CHAR_W = 0.56;
const lineCount = (text: string, fontPx: number, widthPx: number, maxLines = 99) => Math.min(maxLines, Math.max(1, Math.ceil((text.length * CHAR_W * fontPx) / widthPx)));

export function infoHeight(input: LayoutInput, mode: "stack" | "side", textWidth: number): number {
  const t = TYPE[mode];
  let h = lineCount(input.title, t.title, textWidth, 4) * t.title * 1.25;
  if (input.storeName) h += 50;
  h += GEOM.gap + 124; // selling price and MRP
  if (input.hasDiscount) h += GEOM.gap + 72; // savings pill
  if (input.hasCoupon) h += GEOM.gap + 104;
  if (input.offerLines.length) h += GEOM.gap + 56 + input.offerLines.reduce((sum, line) => sum + Math.max(44, lineCount(line, t.offer, textWidth - 64) * t.offer * 1.35) + 14, 0);
  return h;
}

/** 1 when the picture's shape matches its box exactly; it drops as they differ (the picture is never stretched, so a poor match means wasted space). */
export const coverage = (imageW: number, imageH: number, boxW: number, boxH: number) => {
  const a = imageW / imageH, b = boxW / boxH;
  return Math.min(a / b, b / a);
};

export function scoreLayouts(input: LayoutInput, allowed: Format[] = ["portrait", "square", "landscape"]): LayoutCandidate[] {
  return allowed.map((format) => {
    const { width, height } = FORMAT_SIZE[format];
    const area = height - GEOM.header - GEOM.footer - GEOM.pad;
    let mode: "stack" | "side", infoNeeded: number, infoAvailable: number, boxW: number, boxH: number;
    if (format === "landscape") {
      mode = "side";
      boxW = Math.round((width - GEOM.pad * 2) * GEOM.sideImageShare);
      boxH = area;
      infoAvailable = area;
      infoNeeded = infoHeight(input, mode, width - GEOM.pad * 2 - boxW - GEOM.gap);
    } else {
      mode = "stack";
      const textWidth = width - GEOM.pad * 2;
      infoNeeded = infoHeight(input, mode, textWidth);
      const minImage = GEOM.stackMinImage * area;
      infoAvailable = area - minImage - GEOM.gap;
      boxW = textWidth;
      boxH = Math.min(GEOM.stackMaxImage * area, Math.max(minImage, area - infoNeeded - GEOM.gap));
    }
    const fits = infoNeeded <= infoAvailable;
    const fill = infoNeeded / infoAvailable;
    // A card may grow taller to fit its text, so a small overflow costs little and a large one a lot.
    const overflow = Math.max(0, infoNeeded - infoAvailable);
    const fit = 1 - Math.min(1, overflow / (0.25 * height));
    const balance = fits ? Math.max(0, 1 - Math.abs(fill - 0.7)) : 0; // very empty or very full is less balanced
    const cover = coverage(input.imageWidth, input.imageHeight, boxW, boxH);
    // A picture's own shape is a strong hint (a portrait photo suits a portrait card), but never decisive: text that does not fit pulls the score down.
    const aspect = input.imageWidth / input.imageHeight;
    const natural: Format = aspect < 0.85 ? "portrait" : aspect > 1.18 ? "landscape" : "square";
    let score = 25 * Math.sqrt(cover) + 35 * fit + 15 * balance + (format === natural ? 25 : 0) - (format === "landscape" ? 5 : 0);
    score += format === "portrait" ? 4 : format === "square" ? 2 : 0; // on a tie, taller cards read better on a phone (the picture is shown full width, so a narrower card means larger text)
    return { format, mode, score, fits, infoNeeded, infoAvailable, imageCoverage: cover };
  });
}

/** `allowed` limits the choice, e.g. phones only ever get the portrait card. */
export function chooseLayout(input: LayoutInput, allowed?: Format[]): LayoutCandidate {
  return scoreLayouts(input, allowed).reduce((best, c) => (c.score > best.score ? c : best));
}
