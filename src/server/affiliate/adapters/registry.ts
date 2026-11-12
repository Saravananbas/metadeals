import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";
import { CuelinksAdapter } from "./cuelinks";
import { CuelinksMcpAdapter } from "./cuelinks-mcp";
import { AmazonAdapter } from "./amazon";
import { FlipkartAdapter } from "./flipkart";

/**
 * Cuelinks V3 is the primary and consolidated affiliate monetization provider for MetaDeals4U.
 * All retailer links (Amazon, Flipkart, Myntra, Tata CLiQ, Croma, Reliance Digital, AJIO, etc.)
 * route through Cuelinks. Direct retailer adapters serve only as fallback.
 */
const adapters: AffiliateProviderAdapter[] = [
  new CuelinksMcpAdapter(),
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
  context: AffiliateConversionContext
): ConvertedLinkResult {
  for (const adapter of adapters) {
    if (adapter.canHandle(originalUrl, merchantHost)) {
      return adapter.convertUrl(originalUrl, context);
    }
  }
  return { url: originalUrl, provider: "direct", isAffiliate: false };
}

