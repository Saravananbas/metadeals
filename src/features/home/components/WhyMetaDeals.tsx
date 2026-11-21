import { Bell, Heart, ShieldCheck, Truck } from "lucide-react";

const benefits = [
  { Icon: Truck, title: "Best Deals from Top Stores", detail: "Amazon, Flipkart and more" },
  { Icon: ShieldCheck, title: "Shop with Confidence", detail: "Check prices at the retailer" },
  { Icon: Bell, title: "More Deals to Discover", detail: "Find your next favourite" },
  { Icon: Heart, title: "Save More, Shop Smarter", detail: "Big savings on your favourite products" },
];

/** Store marks drawn inline (no image download); the apps are not published yet, so they are not links. */
const PlayMark = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path d="M3.6 1.5 14.1 12 3.6 22.5c-.4-.2-.6-.6-.6-1.1V2.6c0-.5.2-.9.6-1.1Z" style={{ fill: "var(--md-blue-600)" }} />
    <path d="M3.6 1.5 17.2 9 14.1 12Z" style={{ fill: "var(--md-green-600)" }} />
    <path d="M3.6 22.5 17.2 15 14.1 12Z" style={{ fill: "var(--md-red-600)" }} />
    <path d="M17.2 9 20.8 11c.5.3.5 1.7 0 2l-3.6 2-3.1-3Z" style={{ fill: "var(--md-amber-600)" }} />
  </svg>
);
const AppleMark = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09ZM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

export function WhyMetaDeals() {
  return (
    <section className="benefits" aria-label="Why MetaDeals4U">
      {benefits.map(({ Icon, title, detail }) => <div className="benefit" key={title}><Icon size={36} strokeWidth={1.5} /><div><h2>{title}</h2><p>{detail}</p></div></div>)}
      <div className="benefit-app" role="group" aria-label="Android and iOS app, coming soon">
        <span className="app-mark" aria-hidden="true"><PlayMark /></span>
        <span className="app-mark" aria-hidden="true"><AppleMark /></span>
        <div><h2>Android &amp; iOS App</h2><span className="app-soon">Coming Soon</span></div>
      </div>
    </section>
  );
}
