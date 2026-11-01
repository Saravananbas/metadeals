"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-5 px-6 py-24" role="alert">
    <h1 className="text-3xl font-bold">Something went wrong</h1>
    <p>Please try again. If this continues, contact support{error.digest ? ` with reference ${error.digest}` : ""}.</p>
    <Button onClick={reset}>Try again</Button>
  </main>;
}
