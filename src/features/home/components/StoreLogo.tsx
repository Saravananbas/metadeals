import type { StoreId } from "@/features/deals/types";
import Image from "next/image";

export function StoreLogo({ store, name, logoUrl, logoOnly = false }: { store: StoreId; name?: string; logoUrl?: string | null; logoOnly?: boolean }) {
  if (logoUrl) {
    return (
      <span className="store-logo" aria-label={name ?? store} style={{ display: "inline-flex", alignItems: "center" }}>
        <Image
          src={logoUrl}
          alt={logoOnly ? (name ?? store) : ""}
          width={80}
          height={24}
          unoptimized
          style={{ maxHeight: "24px", maxWidth: "80px", width: "auto", objectFit: "contain", borderRadius: "3px" }}
        />
        {!logoOnly && <span>{name ?? store}</span>}
      </span>
    );
  }
  if (store === "amazon") return <span className="store-logo store-amazon">amazon<span>.in</span><i aria-hidden="true" /></span>;
  if (store === "flipkart") return <span className="store-logo store-flipkart">Flipkart <span aria-hidden="true">⚡</span></span>;
  if (store === "myntra") return <span className="store-logo store-myntra"><i aria-hidden="true">M</i>Myntra</span>;
  if (store === "croma") return <span className="store-logo store-croma">croma</span>;
  return <span className="store-logo">{name ?? store}</span>;
}
