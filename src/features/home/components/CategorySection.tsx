import {
  ChevronRight,
  WashingMachine,
  Tv,
  Baby,
  Sparkles,
  Shirt,
  UtensilsCrossed,
  Home,
  Film,
  Zap,
  Dumbbell,
  Plane,
  Grid,
} from "lucide-react";
import { useRef } from "react";
import { categories } from "../catalog";

const categoryIconMap: Record<string, React.ReactNode> = {
  appliances: <WashingMachine className="category-appliance-icon" size={32} strokeWidth={1.8} />,
  "baby-care": <Baby size={30} strokeWidth={1.8} color="var(--md-store-myntra)" />,
  "beauty-personal-care": <Sparkles size={30} strokeWidth={1.8} color="var(--md-purple-400)" />,
  electronics: <Tv size={30} strokeWidth={1.8} color="var(--md-store-flipkart)" />,
  "fashion-apparel": <Shirt size={30} strokeWidth={1.8} color="var(--md-color-focus)" />,
  "food-beverage-service": <UtensilsCrossed size={30} strokeWidth={1.8} color="var(--md-orange-500)" />,
  "home-kitchen": <Home size={30} strokeWidth={1.8} color="var(--md-green-600)" />,
  "movies-entertainment": <Film size={30} strokeWidth={1.8} color="var(--md-red-600)" />,
  "recharges-payments": <Zap size={30} strokeWidth={1.8} color="var(--md-amber-600)" />,
  "sports-fitness": <Dumbbell size={30} strokeWidth={1.8} color="var(--md-promo-flipkart-start)" />,
  "travels-hotels": <Plane size={30} strokeWidth={1.8} color="var(--md-promo-flipkart-start)" />,
};

export function CategorySection({
  selected,
  onSelect,
  items = categories,
}: {
  selected: string;
  onSelect: (id: string) => void;
  items?: { id: string; label: string; icon: string }[];
}) {
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <section className="category-section" id="categories" aria-labelledby="category-heading">
      <div className="category-inner">
        <h2 id="category-heading">
          Shop by
          <br />
          <span>Category</span>
        </h2>
        <div className="category-list" ref={listRef}>
          {items.map((category) => (
            <button
              className={`category-item ${selected === category.id ? "selected" : ""}`}
              key={category.id}
              onClick={() => onSelect(selected === category.id ? "" : category.id)}
              aria-pressed={selected === category.id}
            >
              <span className="category-image" aria-hidden="true">
                {categoryIconMap[category.id] ?? (
                  category.icon && category.icon !== "◇" ? (
                    category.icon
                  ) : (
                    <Grid size={28} strokeWidth={1.6} color="var(--md-color-focus)" />
                  )
                )}
              </span>
              <span>{category.label}</span>
            </button>
          ))}
        </div>
        <button
          className="category-next icon-button"
          aria-label="Scroll categories to the right"
          onClick={() => listRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
        >
          <ChevronRight size={19} />
        </button>
      </div>
    </section>
  );
}

