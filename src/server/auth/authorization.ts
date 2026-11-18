import "server-only";
import { can, type Permission } from "./permissions";
import { getCurrentAuthContext } from "./session";

export async function authorize(permission: Permission) {
  const context = await getCurrentAuthContext();
  if (!context) return { context: null, status: 401 as const };
  if (!can(context.user, permission)) return { context: null, status: 403 as const };
  return { context, status: null };
}
