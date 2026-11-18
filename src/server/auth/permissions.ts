export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "COMMUNITY_MODERATOR";

export type Permission =
  | "account:create:super-admin"
  | "account:create:admin"
  | "account:create:editor"
  | "account:role:update"
  | "account:suspend"
  | "account:reactivate"
  | "account:delete"
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
  | "analytics:view"
  | "intelligence:view"
  | "scraper:use"
  | "affiliate:view"
  | "forum:moderate"
  | "forum:manage"
  | "announcement.publish"
  // Community moderation. A moderator holds ONLY the "mod:" capabilities listed under COMMUNITY_MODERATOR below.
  | "mod:queue:read" | "mod:post:review" | "mod:comment:moderate" | "mod:report:handle" | "mod:submission:review"
  | "mod:member:warn" | "mod:member:restrict" | "mod:history:own" | "mod:sensitive:hide"
  // Administrator-only moderation powers.
  | "mod:appoint" | "mod:appeal:decide" | "mod:restriction:manage" | "mod:escalation:read";

/** What a probationary or confirmed community moderator may do. Nothing else: no deals, accounts, security, affiliate, scraper, analytics or community settings. */
export const MODERATOR_PERMISSIONS = ["mod:queue:read", "mod:post:review", "mod:comment:moderate", "mod:report:handle", "mod:submission:review", "mod:member:warn", "mod:member:restrict", "mod:history:own", "mod:sensitive:hide"] as const satisfies readonly Permission[];
const ADMIN_MODERATION = [...MODERATOR_PERMISSIONS, "mod:appoint", "mod:appeal:decide", "mod:restriction:manage", "mod:escalation:read"] as const satisfies readonly Permission[];

const rolePermissions: Record<AdminRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set([
    "account:create:super-admin", "account:create:admin", "account:create:editor",
    "account:role:update", "account:suspend", "account:reactivate", "account:delete", "account:read",
    "audit:read", "security:manage", "deal:create", "deal:edit", "deal:publish",
    "deal:archive", "merchant:manage", "category:manage", "affiliate:manage",
    "operations:read", "analytics:view", "intelligence:view", "scraper:use", "affiliate:view", "forum:moderate", "forum:manage", "announcement.publish", ...ADMIN_MODERATION,
  ]),
  ADMIN: new Set([
    "account:create:editor", "account:suspend", "account:reactivate", "account:read",
    "deal:create", "deal:edit", "deal:publish", "deal:archive", "merchant:manage",
    "category:manage", "affiliate:manage", "operations:read", "analytics:view", "intelligence:view", "scraper:use", "affiliate:view", "forum:moderate", "forum:manage", "announcement.publish", ...ADMIN_MODERATION,
  ]),
  EDITOR: new Set(["deal:create", "deal:edit", "deal:publish", "scraper:use"]),
  COMMUNITY_MODERATOR: new Set<Permission>(MODERATOR_PERMISSIONS),
};

export function roleCan(role: AdminRole, permission: Permission): boolean {
  return rolePermissions[role]?.has(permission) ?? false; // unknown roles get nothing
}

/** Who is asking. `permissions` is the person's own checklist when an administrator set one (it replaces the role defaults); null or missing means the role defaults apply. */
export type AccessSubject = { role: AdminRole; permissions?: readonly string[] | null };
export function can(subject: AccessSubject, permission: Permission): boolean {
  return subject.permissions ? subject.permissions.includes(permission) : roleCan(subject.role, permission);
}

/** Who may review community deal submissions: moderators and administrators (new capability), and anyone who could already review them through deal publishing (editors). */
export const canReviewSubmissions = (subject: AccessSubject | AdminRole) => {
  const who = typeof subject === "string" ? { role: subject } : subject;
  return can(who, "mod:submission:review") || can(who, "deal:publish");
};
/** Creating the DRAFT for an approved submission needs the normal deal rights, or the moderator's draft-only path below. */
export const canCreateDealsDirectly = (subject: AccessSubject | AdminRole) => can(typeof subject === "string" ? { role: subject } : subject, "deal:create");

export function canAssignRole(actor: AdminRole, target: AdminRole): boolean {
  if (actor === "SUPER_ADMIN") return true;
  return actor === "ADMIN" && target === "EDITOR";
}

export function canChangeRole(actor: AdminRole, targetId: string, actorId: string): boolean {
  return actor === "SUPER_ADMIN" && targetId !== actorId;
}
