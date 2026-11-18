import "server-only";
import { getDatabase } from "@/server/db/client";
import { can, type AdminRole, type Permission } from "./permissions";
import { effectiveAccess } from "./modules";

/** The person's own checklist (it replaces their role defaults), or null when the role defaults apply. */
export async function resolveAccess(userId: string): Promise<string[] | null> {
  const user = await getDatabase().user.findUnique({
    where: { id: userId },
    select: { role: true, customAccess: true, customAccessUntil: true, permissionGrants: { select: { permission: true } } },
  });
  return effectiveAccess(user ? { role: user.role, customAccess: user.customAccess, customAccessUntil: user.customAccessUntil, grants: user.permissionGrants.map((g) => g.permission) } : null);
}

/** For server code that only holds { id, role }: looks the checklist up, then applies the same rule as can(). */
export async function actorCan(actor: { id: string; role: AdminRole }, permission: Permission): Promise<boolean> {
  return can({ role: actor.role, permissions: await resolveAccess(actor.id) }, permission);
}
