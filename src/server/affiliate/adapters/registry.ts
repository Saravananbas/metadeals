import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";
import { CuelinksAdapter } from "./cuelinks";
import { AmazonAdapter } from "./amazon";
import { FlipkartAdapter } from "./flipkart";
import { buildOwnLink, type RetailerAffiliateConfig } from "../retailer-config";

/**
 * Cuelinks V3 is the primary and consolidated affiliate monetization provider for MetaDeals4U.
 * All retailer links (Amazon, Flipkart, Myntra, Tata CLiQ, Croma, Reliance Digital, AJIO, etc.)
 * route through the one Cuelinks adapter (links go through linksredirect.com with the channel id). Direct retailer adapters serve only as fallback.
 * The old clnk.in/r?id=<publisher id> adapter was removed: that "id" is a short-link id, so Myntra, AJIO, Tata CLiQ, Croma, Reliance Digital and Nykaa
 * visitors were sent to an unrelated page.
 */
const adapters: AffiliateProviderAdapter[] = [
  new CuelinksAdapter(),
  new AmazonAdapter(),
  new FlipkartAdapter(),
];

export function getProviderAdapter(name: string): AffiliateProviderAdapter | undefined {
  return adapters.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

export function convertMerchantUrl(
  originalUrl: string,
  merchantHost: string,
  context: AffiliateConversionContext,
  config?: RetailerAffiliateConfig | null
): ConvertedLinkResult {
  // The retailer's own setting comes first: our own account, or switched off. Anything else (no setting, or Cuelinks) is the old behaviour.
  if (config?.mode === "NONE") return { url: originalUrl, provider: "direct", isAffiliate: false };
  if (config?.mode === "OWN") {
    const own = buildOwnLink(config, originalUrl, context.subId);
    if (own) return own;
  }
  for (const adapter of adapters) {
    if (adapter.canHandle(originalUrl, merchantHost)) {
      return adapter.convertUrl(originalUrl, context);
    }
  }
  return { url: originalUrl, provider: "direct", isAffiliate: false };
}

