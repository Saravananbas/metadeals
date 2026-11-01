import { TopDealsSection, type DealsSectionProps } from "./TopDealsSection";

export function LatestDeals(props: DealsSectionProps) {
  return <TopDealsSection {...props} title="Latest Deals" subtitle="Explore the newest additions to our demo collection" />;
}
