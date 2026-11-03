export interface AffiliateConversionContext {
  dealId: string;
  subId?: string;
  channel?: string;
}

export interface ConvertedLinkResult {
  url: string;
  provider: string;
  isAffiliate: boolean;
}

export interface AffiliateProviderAdapter {
  readonly name: string;
  canHandle(url: string, merchantHost: string): boolean;
  convertUrl(originalUrl: string, context: AffiliateConversionContext): ConvertedLinkResult;
  parseTransactionReport(raw: unknown): unknown[];
}

