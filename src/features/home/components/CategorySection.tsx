import { ChevronRight, WashingMachine } from "lucide-react";
import { useRef } from "react";
import { categories } from "../catalog";

export function CategorySection({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  return <section className="category-section" id="categories" aria-labelledby="category-heading"><div className="category-inner">
    <h2 id="category-heading">Shop by<br /><span>Category</span></h2>
    <div className="category-list" ref={listRef}>{categories.map((category) => <button className={`category-item ${selected === category.id ? "selected" : ""}`} key={category.id} onClick={() => onSelect(selected === category.id ? "" : category.id)} aria-pressed={selected === category.id}>
      <span className="category-image" aria-hidden="true">{category.id === "appliances" ? <WashingMachine className="category-appliance-icon" size={38} strokeWidth={1.6} /> : category.icon}</span><span>{category.label}</span>
    </button>)}</div>
    <button className="category-next icon-button" aria-label="Scroll categories to the right" onClick={() => listRef.current?.scrollBy({ left: 280, behavior: "smooth" })}><ChevronRight size={19} /></button>
  </div></section>;
}
