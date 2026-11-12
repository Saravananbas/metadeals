import type { RetailerConnector, ConnectorHealthResult, RetailerProductListing } from "../types";

export class AmazonDealsConnector implements RetailerConnector {
  readonly code = "amazon-deals";
  readonly name = "Amazon India Electronics Connector";

  get isLive(): boolean {
    return Boolean(
      (process.env.AMAZON_PAAPI_KEY || process.env.AMAZON_PAAPI_ACCESS_KEY) &&
      (process.env.AMAZON_PAAPI_SECRET || process.env.AMAZON_PAAPI_SECRET_KEY) &&
      process.env.AMAZON_PAAPI_TAG
    );
  }

  async checkHealth(): Promise<ConnectorHealthResult> {
    const hasCredentials = this.isLive;
    return {
      code: this.code,
      status: hasCredentials ? "LIVE_CONNECTED" : "FIXTURE_MODE",
      isHealthy: hasCredentials,
      isLive: hasCredentials,
      message: hasCredentials
        ? "Amazon PA-API v5 credentials configured for live deal discovery."
        : "Running in fixture mode without live credentials. Amazon PA-API v5 credentials (AMAZON_PAAPI_KEY / AMAZON_PAAPI_SECRET / AMAZON_PAAPI_TAG) are required for live deal discovery. Direct HTML scraping is prohibited by Amazon conditions of use and robot policy.",
      lastCheckedAt: new Date(),
    };
  }

  async discoverListings(): Promise<RetailerProductListing[]> {
    // Note: Automated live scraping of amazon.in is prohibited without Amazon PA-API authorization.
    // Static curated fixture items for development & testing only.
    return [
      {
        sourceUrl: "https://www.amazon.in/dp/B0BDK62PDX",
        sourcePlatform: "amazon",
        externalId: "B0BDK62PDX",
        rawTitle: "Apple iPhone 14 (128 GB) - Blue",
        brand: "Apple",
        categorySlug: "electronics",
        observedPriceMinor: 5299900, // ₹52,999
        observedMrpMinor: 6990000,  // ₹69,900
        currency: "INR",
        imageUrl: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop",
        sellerName: "Appario Retail Private Ltd",
        inStock: true,
        isMockOrFixture: true,
      },
      {
        sourceUrl: "https://www.amazon.in/dp/B09G9BL5CP",
        sourcePlatform: "amazon",
        externalId: "B09G9BL5CP",
        rawTitle: "Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones",
        brand: "Sony",
        categorySlug: "electronics",
        observedPriceMinor: 2699000, // ₹26,990
        observedMrpMinor: 3499000,  // ₹34,990
        currency: "INR",
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop",
        sellerName: "Appario Retail Private Ltd",
        inStock: true,
        isMockOrFixture: true,
      },
    ];
  }
}

export class FlipkartDealsConnector implements RetailerConnector {
  readonly code = "flipkart-deals";
  readonly name = "Flipkart Electronics Connector";

  get isLive(): boolean {
    return Boolean(
      process.env.FLIPKART_AFFILIATE_ID &&
      (process.env.FLIPKART_AFFILIATE_TOKEN || process.env.FLIPKART_AFFILIATE_SECRET)
    );
  }

  async checkHealth(): Promise<ConnectorHealthResult> {
    const hasCredentials = this.isLive;
    return {
      code: this.code,
      status: hasCredentials ? "LIVE_CONNECTED" : "FIXTURE_MODE",
      isHealthy: hasCredentials,
      isLive: hasCredentials,
      message: hasCredentials
        ? "Flipkart Affiliate API credentials configured for live deal discovery."
        : "Running in fixture mode without live credentials. Flipkart Affiliate API credentials (FLIPKART_AFFILIATE_ID / FLIPKART_AFFILIATE_TOKEN) are required for live deal discovery. Automated HTML scraping of dynamic prices is restricted.",
      lastCheckedAt: new Date(),
    };
  }

  async discoverListings(): Promise<RetailerProductListing[]> {
    // Note: Live automated scraping of dynamic flipkart.com prices is restricted.
    // Static curated fixture items for development & testing only.
    return [
      {
        sourceUrl: "https://www.flipkart.com/samsung-galaxy-s23-5g-phantom-black-128-gb/p/itm2122112",
        sourcePlatform: "flipkart",
        externalId: "MOBGTAGG4GZSTXAY",
        rawTitle: "SAMSUNG Galaxy S23 5G (Phantom Black, 128 GB) (8 GB RAM)",
        brand: "Samsung",
        categorySlug: "electronics",
        observedPriceMinor: 4499900, // ₹44,999
        observedMrpMinor: 7499900,  // ₹74,999
        currency: "INR",
        imageUrl: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop",
        sellerName: "RetailNet",
        inStock: true,
        isMockOrFixture: true,
      },
      {
        sourceUrl: "https://www.flipkart.com/lg-7-kg-5-star-inverter-touch-control-fully-automatic-front-load-washing-machine/p/itm0987654",
        sourcePlatform: "flipkart",
        externalId: "WASHMACHINE-LG-7KG",
        rawTitle: "LG 7 Kg 5 Star Inverter Fully Automatic Front Load Washing Machine with In-Built Heater",
        brand: "LG",
        categorySlug: "appliances",
        observedPriceMinor: 2899000, // ₹28,990
        observedMrpMinor: 4399000,  // ₹43,990
        currency: "INR",
        imageUrl: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&auto=format&fit=crop",
        sellerName: "OmniTech Retail",
        inStock: true,
        isMockOrFixture: true,
      },
    ];
  }
}
