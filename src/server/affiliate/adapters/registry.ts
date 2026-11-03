import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";
import { AmazonAdapter } from "./amazon";
import { FlipkartAdapter } from "./flipkart";
import { CuelinksAdapter } from "./cuelinks";

const adapters: AffiliateProviderAdapter[] = [
  new AmazonAdapter(),
  new FlipkartAdapter(),
  new CuelinksAdapter(),
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

