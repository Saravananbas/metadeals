import type { StoreId } from "@/features/deals/types";

export function StoreLogo({ store }: { store: StoreId }) {
  if (store === "amazon") return <span className="store-logo store-amazon">amazon<span>.in</span><i aria-hidden="true" /></span>;
  if (store === "flipkart") return <span className="store-logo store-flipkart">Flipkart <span aria-hidden="true">⚡</span></span>;
  return <span className="store-logo store-myntra"><i aria-hidden="true">M</i>Myntra</span>;
}
