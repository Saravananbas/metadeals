import { TopDealsSection, type DealsSectionProps } from "./TopDealsSection";

export function FeaturedDeals(props: DealsSectionProps) {
  return <TopDealsSection {...props} title="Featured Deals" subtitle="A few favourites from our sample collection" />;
}
