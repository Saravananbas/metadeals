import type { AccessSubject, Permission } from "./permissions";
import { can } from "./permissions";

/** One entry per part of the admin area whose access can be set person by person. A level lists everything it allows (a higher level includes the lower ones). */
export type AccessLevel = { key: string; label: string; permissions: Permission[] };
export type AccessModule = { key: string; label: string; description: string; path: string; levels: AccessLevel[] };

export const ACCESS_MODULES: AccessModule[] = [
  { key: "deals", label: "Deals", description: "Deal Management: add and edit deals, publish them, archive or delete them.", path: "/admin/deals", levels: [
    { key: "edit", label: "Create and edit", permissions: ["deal:create", "deal:edit"] },
    { key: "publish", label: "Create, edit and publish", permissions: ["deal:create", "deal:edit", "deal:publish"] },
    { key: "full", label: "Full (also archive and delete)", permissions: ["deal:create", "deal:edit", "deal:publish", "deal:archive"] },
  ] },
  { key: "community-deals", label: "Community Deals", description: "Review deals that members submit and approve or reject them.", path: "/admin/submissions", levels: [
    { key: "review", label: "Review submissions", permissions: ["mod:submission:review"] },
  ] },
  { key: "intelligence", label: "Deal Intelligence", description: "Read-only view of discovery, approvals, publishing, competitors and pricing.", path: "/admin/intelligence", levels: [
    { key: "view", label: "View", permissions: ["intelligence:view"] },
  ] },
  { key: "scraper", label: "Deal Scraper", description: "Review scraped candidates; the higher level can also start scans.", path: "/admin/scraper", levels: [
    { key: "review", label: "Review candidates", permissions: ["scraper:use"] },
    { key: "scan", label: "Review and run scans", permissions: ["scraper:use", "operations:read"] },
  ] },
  { key: "categories", label: "Categories", description: "Create, edit and delete categories and subcategories.", path: "/admin/categories", levels: [
    { key: "manage", label: "Manage", permissions: ["category:manage"] },
  ] },
  { key: "merchants", label: "Merchants", description: "Merchant websites and store directory.", path: "/admin/merchant-websites", levels: [
    { key: "manage", label: "Manage", permissions: ["merchant:manage"] },
  ] },
  { key: "affiliate", label: "Affiliate", description: "Affiliate earnings and Cuelinks; the higher level can also change affiliate links.", path: "/admin/cuelinks", levels: [
    { key: "view", label: "View earnings", permissions: ["affiliate:view"] },
    { key: "manage", label: "View and manage links", permissions: ["affiliate:view", "affiliate:manage"] },
  ] },
  { key: "analytics", label: "Analytics", description: "Traffic, audience, deals, engagement, revenue and sources, with CSV export.", path: "/admin/analytics", levels: [
    { key: "view", label: "View", permissions: ["analytics:view"] },
  ] },
];

/** Parts of the admin area that cannot be delegated from this screen: they stay with the person's role. */
export const ROLE_ONLY_MODULES = ["Accounts and access", "Audit log", "Security settings", "Community Management", "Moderators", "Announcements", "Users"];

export const DELEGABLE_PERMISSIONS: ReadonlySet<string> = new Set(ACCESS_MODULES.flatMap((m) => m.levels.flatMap((l) => l.permissions)));

/**
 * What a person may do: null when their role defaults apply, otherwise their own checklist.
 * A Super Administrator is never customised, a ticked list that has run out falls back to the role, and anything that is not delegable is ignored.
 */
export function effectiveAccess(user: { role: string; customAccess: boolean; customAccessUntil: Date | null; grants: readonly string[] } | null, now = new Date()): string[] | null {
  if (!user || user.role === "SUPER_ADMIN" || !user.customAccess) return null;
  if (user.customAccessUntil && user.customAccessUntil <= now) return null;
  return user.grants.filter((p) => DELEGABLE_PERMISSIONS.has(p));
}

/** Highest level of each module that a permission list fully covers, as `{ moduleKey: levelKey }`. */
export function levelsFor(permissions: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of ACCESS_MODULES) {
    for (const l of m.levels) if (l.permissions.every((p) => permissions.includes(p))) out[m.key] = l.key;
  }
  return out;
}

/** Permissions for a `{ moduleKey: levelKey }` choice, rejecting unknown modules and levels. */
export function permissionsFor(choice: Record<string, string>): Permission[] {
  const set = new Set<Permission>();
  for (const [moduleKey, levelKey] of Object.entries(choice)) {
    const level = ACCESS_MODULES.find((m) => m.key === moduleKey)?.levels.find((l) => l.key === levelKey);
    if (!level) throw new Error(`Unknown access choice: ${moduleKey}/${levelKey}`);
    level.permissions.forEach((p) => set.add(p));
  }
  return [...set];
}

/** Can this person open at least one part of the admin area (other than the accounts screen)? */
export const hasAnyModule = (subject: AccessSubject) => ACCESS_MODULES.some((m) => m.levels.some((l) => l.permissions.some((p) => can(subject, p))));

/** The first admin page this person is allowed to open, used when they land somewhere they cannot use. */
export function firstAllowedPath(subject: AccessSubject): string {
  if (can(subject, "account:read")) return "/admin";
  return ACCESS_MODULES.find((m) => m.levels.some((l) => l.permissions.some((p) => can(subject, p))))?.path ?? "/admin/login";
}
