/** Choosing the one product picture for the share card. The scoring is plain arithmetic so it can be tested without a browser. */
export type ImageProbe = { url: string; width: number; height: number; primary: boolean };

const MIN_SIDE = 200; // smaller than this is a thumbnail or an icon
const MAX_ASPECT = 3.2; // wider or taller than this (or the reverse) is a banner or a strip, not a product photo

/** null = not usable. The designated primary picture always beats the others when it is usable. */
export function imageScore(p: ImageProbe): number | null {
  if (!p.width || !p.height || Math.min(p.width, p.height) < MIN_SIDE) return null;
  const aspect = p.width / p.height;
  if (aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) return null;
  if (/placeholder/i.test(p.url)) return null;
  const resolution = Math.min((p.width * p.height) / 1_000_000, 2) * 20; // up to 2 megapixels counts
  const proportion = (1 - Math.abs(Math.log(aspect)) / Math.log(MAX_ASPECT)) * 15; // product photos are rarely extreme
  return (p.primary ? 100 : 0) + resolution + proportion;
}

export function pickBestImage(probes: ImageProbe[]): ImageProbe | null {
  const seen = new Set<string>();
  let best: ImageProbe | null = null;
  let bestScore = -Infinity;
  for (const p of probes) {
    if (seen.has(p.url)) continue; // a repeated address is the same picture
    seen.add(p.url);
    const score = imageScore(p);
    if (score !== null && score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
