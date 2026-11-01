import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-xl space-y-5 px-6 py-24">
    <h1 className="text-3xl font-bold">Page not found</h1>
    <p>The page you requested is unavailable.</p>
    <Link className="text-primary underline underline-offset-4" href="/">Return to MetaDeals4U</Link>
  </main>;
}
