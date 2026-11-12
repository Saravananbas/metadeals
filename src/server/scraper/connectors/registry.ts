import type { RetailerConnector } from "../types";
import { CuelinksFeedConnector } from "./cuelinks-feed";
import { AmazonDealsConnector, FlipkartDealsConnector } from "./retailer-generic";

export class ConnectorRegistry {
  private readonly connectors = new Map<string, RetailerConnector>();

  constructor() {
    this.register(new CuelinksFeedConnector());
    this.register(new AmazonDealsConnector());
    this.register(new FlipkartDealsConnector());
  }

  register(connector: RetailerConnector): void {
    this.connectors.set(connector.code, connector);
  }

  get(code: string): RetailerConnector | undefined {
    return this.connectors.get(code);
  }

  getAll(): RetailerConnector[] {
    return Array.from(this.connectors.values());
  }
}

export const connectorRegistry = new ConnectorRegistry();
