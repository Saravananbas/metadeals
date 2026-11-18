import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { canReviewSubmissions } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { SubmissionsReview } from "./SubmissionsReview";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!canReviewSubmissions(context.user)) redirect(firstAllowedPath(context.user));
  return <SubmissionsReview />;
}
