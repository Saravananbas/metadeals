export interface AllowedDomainInfo {
  domain: string;
  retailerName: string;
  retailerSlug: string;
  adapterId: string;
  categoryHint?: string;
}

export const ALLOWED_RETAILER_DOMAINS: AllowedDomainInfo[] = [
  // Amazon India
  { domain: "amazon.in", retailerName: "Amazon India", retailerSlug: "amazon", adapterId: "amazon-india" },
  { domain: "www.amazon.in", retailerName: "Amazon India", retailerSlug: "amazon", adapterId: "amazon-india" },
  { domain: "amzn.to", retailerName: "Amazon India", retailerSlug: "amazon", adapterId: "amazon-india" },
  { domain: "amzn.in", retailerName: "Amazon India", retailerSlug: "amazon", adapterId: "amazon-india" },

  // Flipkart
  { domain: "flipkart.com", retailerName: "Flipkart", retailerSlug: "flipkart", adapterId: "flipkart" },
  { domain: "www.flipkart.com", retailerName: "Flipkart", retailerSlug: "flipkart", adapterId: "flipkart" },
  { domain: "dl.flipkart.com", retailerName: "Flipkart", retailerSlug: "flipkart", adapterId: "flipkart" },
  { domain: "fkrt.it", retailerName: "Flipkart", retailerSlug: "flipkart", adapterId: "flipkart" },

  // Myntra
  { domain: "myntra.com", retailerName: "Myntra", retailerSlug: "myntra", adapterId: "myntra" },
  { domain: "www.myntra.com", retailerName: "Myntra", retailerSlug: "myntra", adapterId: "myntra" },

  // Croma
  { domain: "croma.com", retailerName: "Croma", retailerSlug: "croma", adapterId: "croma" },
  { domain: "www.croma.com", retailerName: "Croma", retailerSlug: "croma", adapterId: "croma" },
  { domain: "reliancedigital.in", retailerName: "Reliance Digital", retailerSlug: "reliancedigital", adapterId: "generic-structured-data" },
  { domain: "www.reliancedigital.in", retailerName: "Reliance Digital", retailerSlug: "reliancedigital", adapterId: "generic-structured-data" },
  { domain: "tatacliq.com", retailerName: "Tata CLiQ / Partner", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.tatacliq.com", retailerName: "Tata CLiQ / Partner", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "ajio.com", retailerName: "AJIO", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.ajio.com", retailerName: "AJIO", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "nykaa.com", retailerName: "Nykaa", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.nykaa.com", retailerName: "Nykaa", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "jiomart.com", retailerName: "JioMart", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.jiomart.com", retailerName: "JioMart", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "bigbasket.com", retailerName: "BigBasket", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.bigbasket.com", retailerName: "BigBasket", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "vijaysales.com", retailerName: "Vijay Sales", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
  { domain: "www.vijaysales.com", retailerName: "Vijay Sales", retailerSlug: "cuelinks", adapterId: "generic-structured-data" },
];

export function findAllowedDomain(hostname: string): AllowedDomainInfo | undefined {
  const normalized = hostname.toLowerCase().trim();
  return ALLOWED_RETAILER_DOMAINS.find(
    (item) => item.domain === normalized || normalized.endsWith(`.${item.domain}`)
  );
}

export function isAllowedRetailerDomain(hostname: string): boolean {
  if (process.env.NODE_ENV === "test" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return true;
  }
  return !!findAllowedDomain(hostname);
}
