import { ArrowRight } from "lucide-react";
import { stores } from "../catalog";
import { StoreLogo } from "./StoreLogo";

export function PopularStores({ onStore, items = stores }: { onStore: (id: string) => void; items?: readonly {id:string;name:string}[] }) {
  return <div className="store-list">{items.map((store) => <button key={store.id} onClick={() => onStore(store.id)}><StoreLogo store={store.id} name={store.name} /><span>Browse deals <ArrowRight size={16} /></span></button>)}</div>;
}
