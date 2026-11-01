import { Bell, Heart, ShieldCheck, Truck } from "lucide-react";

const benefits = [
  { Icon: Truck, title: "Best Deals from Top Stores", detail: "Amazon, Flipkart and more" },
  { Icon: ShieldCheck, title: "Shop with Confidence", detail: "Check prices at the retailer" },
  { Icon: Bell, title: "More Deals to Discover", detail: "Find your next favourite" },
  { Icon: Heart, title: "Save More, Shop Smarter", detail: "Big savings on your favourite products" },
];

export function WhyMetaDeals() {
  return <section className="benefits" aria-label="Why MetaDeals4U">{benefits.map(({ Icon, title, detail }) => <div className="benefit" key={title}><Icon size={36} strokeWidth={1.5} /><div><h2>{title}</h2><p>{detail}</p></div></div>)}</section>;
}
