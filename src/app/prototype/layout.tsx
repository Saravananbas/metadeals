import { notFound } from "next/navigation";

// Design prototypes use made-up numbers (likes, reviews); never serve them on a production site.
export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
