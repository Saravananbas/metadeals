export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR";

export type Permission =
  | "account:create:super-admin"
  | "account:create:admin"
  | "account:create:editor"
  | "account:role:update"
  | "account:suspend"
  | "account:reactivate"
  | "account:read"
  | "audit:read"
  | "security:manage"
  | "deal:create"
  | "deal:edit"
  | "deal:publish"
  | "deal:archive"
  | "merchant:manage"
  | "category:manage"
  | "affiliate:manage"
  | "operations:read"
  | "forum:moderate"
  | "forum:manage";

const rolePermissions: Record<AdminRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set([
    "account:create:super-admin", "account:create:admin", "account:create:editor",
    "account:role:update", "account:suspend", "account:reactivate", "account:read",
    "audit:read", "security:manage", "deal:create", "deal:edit", "deal:publish",
    "deal:archive", "merchant:manage", "category:manage", "affiliate:manage",
    "operations:read", "forum:moderate", "forum:manage",
  ]),
  ADMIN: new Set([
    "account:create:editor", "account:suspend", "account:reactivate", "account:read",
    "deal:create", "deal:edit", "deal:publish", "deal:archive", "merchant:manage",
    "category:manage", "affiliate:manage", "operations:read", "forum:moderate", "forum:manage",
  ]),
  EDITOR: new Set(["deal:create", "deal:edit", "deal:publish"]),
};

export function roleCan(role: AdminRole, permission: Permission): boolean {
  return rolePermissions[role]?.has(permission) ?? false; // unknown roles get nothing
}

export function canAssignRole(actor: AdminRole, target: AdminRole): boolean {
  if (actor === "SUPER_ADMIN") return true;
  return actor === "ADMIN" && target === "EDITOR";
}

export function canChangeRole(actor: AdminRole, targetId: string, actorId: string): boolean {
  return actor === "SUPER_ADMIN" && targetId !== actorId;
}
