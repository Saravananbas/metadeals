import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">M0 · Application foundation</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">MetaDeals<span className="text-orange-600">4U</span></h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
        The application foundation is ready for development. The approved deals homepage will be implemented in M1.
      </p>
      <div><Button asChild><a href="/api/health">View application health</a></Button></div>
    </main>
  );
}
