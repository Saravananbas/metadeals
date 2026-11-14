import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { canPublish } from "@/server/community/announcements";
import { AnnouncementsAdmin } from "./AnnouncementsAdmin";

export const dynamic = "force-dynamic";

export default async function AnnouncementsAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  // ADMIN and SUPER_ADMIN by role; anyone else only with an explicit announcement.publish grant. The API checks again on every action.
  if (!(await canPublish({ id: context.user.id, role: context.user.role }))) redirect("/admin");
  return <AnnouncementsAdmin canGrant={roleCan(context.user.role, "security:manage")} />;
}
