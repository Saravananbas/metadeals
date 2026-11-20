"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/features/home/components/Header";
import { useSavedDeals } from "@/features/home/saved-store";

type Category = { id: string; name: string; slug: string; parentId?: string | null };

/** The same site header as the home page, for pages that are not the home page: every choice opens the home page with that filter. */
export function SiteHeader({ categories, communityEnabled }: { categories: Category[]; communityEnabled: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const saved = useSavedDeals();
  return (
    <Header
      query={query}
      onQuery={setQuery}
      onSearch={(text) => { const q = text.trim(); router.push(q ? `/?q=${encodeURIComponent(q)}` : "/"); }}
      communityEnabled={communityEnabled}
      categories={categories}
      onCategory={(slug) => router.push(`/?category=${encodeURIComponent(slug)}`)}
      savedCount={saved.ids.length}
      onHome={() => router.push("/")}
      onView={(view) => router.push(view === "top" ? "/" : `/?view=${view}`)}
      onPanel={(panel) => router.push(panel === "saved" ? "/account?tab=saved" : panel === "notifications" ? "/account?tab=notifications" : "/account")}
    />
  );
}
