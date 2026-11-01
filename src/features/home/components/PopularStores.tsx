import { ArrowRight } from "lucide-react";
import { stores } from "../catalog";
import { StoreLogo } from "./StoreLogo";

export function PopularStores({ onStore }: { onStore: (id: string) => void }) {
  return <div className="store-list">{stores.map((store) => <button key={store.id} onClick={() => onStore(store.id)}><StoreLogo store={store.id} /><span>Browse sample deals <ArrowRight size={16} /></span></button>)}</div>;
}
