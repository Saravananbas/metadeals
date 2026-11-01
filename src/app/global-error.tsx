"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="en-IN"><body><main>
    <h1>MetaDeals4U is temporarily unavailable</h1>
    <p>Please try again in a moment.</p>
    <button onClick={reset}>Try again</button>
  </main></body></html>;
}
