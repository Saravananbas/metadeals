import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { SubmissionsReview } from "./SubmissionsReview";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "deal:publish")) redirect("/admin");
  return <SubmissionsReview />;
}
