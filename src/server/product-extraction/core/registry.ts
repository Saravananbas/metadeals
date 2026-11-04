import type { RetailerAdapter } from "./types";
import { AmazonIndiaAdapter } from "../adapters/amazon-india";
import { FlipkartAdapter } from "../adapters/flipkart";
import { CromaAdapter } from "../adapters/croma";
import { MyntraAdapter } from "../adapters/myntra";
import { GenericStructuredDataAdapter } from "../adapters/generic-structured-data";

class AdapterRegistry {
  private adapters: RetailerAdapter[] = [];

  constructor() {
    this.register(new AmazonIndiaAdapter());
    this.register(new FlipkartAdapter());
    this.register(new CromaAdapter());
    this.register(new MyntraAdapter());
    this.register(new GenericStructuredDataAdapter());
  }

  register(adapter: RetailerAdapter): void {
    const existingIndex = this.adapters.findIndex((a) => a.id === adapter.id);
    if (existingIndex >= 0) {
      this.adapters[existingIndex] = adapter;
    } else {
      this.adapters.push(adapter);
    }
  }

  findAdapterForUrl(url: URL): RetailerAdapter | undefined {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }
    return undefined;
  }

  getAdapterById(id: string): RetailerAdapter | undefined {
    return this.adapters.find((a) => a.id === id);
  }

  listAdapters(): Array<{ id: string; name: string; domains: string[] }> {
    return this.adapters.map((a) => ({
      id: a.id,
      name: a.name,
      domains: a.domains,
    }));
  }
}

export const adapterRegistry = new AdapterRegistry();
