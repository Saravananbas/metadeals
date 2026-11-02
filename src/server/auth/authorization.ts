import "server-only";
import { roleCan, type Permission } from "./permissions";
import { getCurrentAuthContext } from "./session";

export async function authorize(permission: Permission) {
  const context = await getCurrentAuthContext();
  if (!context) return { context: null, status: 401 as const };
  if (!roleCan(context.user.role, permission)) return { context: null, status: 403 as const };
  return { context, status: null };
}
