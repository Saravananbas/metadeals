import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MODERATOR_PERMISSIONS, roleCan, type AdminRole, type Permission } from "../src/server/auth/permissions";

// Written before the moderator services. Every role and every capability is listed explicitly: a new permission must be added here on purpose.
const GENERAL: Permission[] = [
  "account:create:super-admin", "account:create:admin", "account:create:editor", "account:role:update", "account:suspend", "account:reactivate", "account:read",
  "audit:read", "security:manage", "deal:create", "deal:edit", "deal:publish", "deal:archive", "merchant:manage", "category:manage", "affiliate:manage",
  "operations:read", "forum:moderate", "forum:manage", "announcement.publish",
];
const MODERATOR_ONLY: Permission[] = ["mod:queue:read", "mod:post:review", "mod:comment:moderate", "mod:report:handle", "mod:submission:review", "mod:member:warn", "mod:member:restrict", "mod:history:own", "mod:sensitive:hide"];
const ADMIN_ONLY: Permission[] = ["mod:appoint", "mod:appeal:decide", "mod:restriction:manage", "mod:escalation:read"];

test("role and capability matrix", () => {
  // COMMUNITY_MODERATOR: exactly the nine community capabilities, nothing from the general list, nothing administrative
  for (const p of MODERATOR_ONLY) assert.equal(roleCan("COMMUNITY_MODERATOR", p), true, `moderator should have ${p}`);
  for (const p of [...GENERAL, ...ADMIN_ONLY]) assert.equal(roleCan("COMMUNITY_MODERATOR", p), false, `moderator must NOT have ${p}`);
  assert.deepEqual([...MODERATOR_PERMISSIONS].sort(), [...MODERATOR_ONLY].sort());
  // Specific denials called out by the owner
  for (const p of ["deal:publish", "deal:create", "deal:edit", "deal:archive", "account:read", "account:suspend", "security:manage", "merchant:manage", "category:manage", "affiliate:manage", "operations:read", "audit:read", "forum:manage", "forum:moderate", "announcement.publish"] as Permission[])
    assert.equal(roleCan("COMMUNITY_MODERATOR", p), false, p);
  // Administrators keep everything they had, and gain the moderation set
  for (const role of ["ADMIN", "SUPER_ADMIN"] as AdminRole[]) for (const p of [...MODERATOR_ONLY, ...ADMIN_ONLY]) assert.equal(roleCan(role, p), true, `${role} ${p}`);
  assert.equal(roleCan("ADMIN", "forum:manage"), true); assert.equal(roleCan("ADMIN", "deal:publish"), true); assert.equal(roleCan("SUPER_ADMIN", "security:manage"), true);
  // Editors gain no moderation capability
  for (const p of [...MODERATOR_ONLY, ...ADMIN_ONLY, "forum:moderate", "forum:manage"] as Permission[]) assert.equal(roleCan("EDITOR", p), false, `editor ${p}`);
  assert.equal(roleCan("EDITOR", "deal:publish"), true, "existing editor rights are unchanged");
  // Unknown roles get nothing
  assert.equal(roleCan("SOMETHING_ELSE" as AdminRole, "mod:queue:read"), false);
});

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) => (e.name === "generated" ? [] : e.isDirectory() ? sourceFiles(join(directory, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(directory, e.name)] : []));
}

test("source guards: moderator code never reaches deal publishing or account/security services, and generic account creation cannot create a moderator", () => {
  const files = [...sourceFiles("src/server/community"), ...sourceFiles("src/app/api/v1/moderator"), ...sourceFiles("src/app/moderator")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/community\/(announcements|profile|service|composer|notifications|config|http|session|richtext|like-search)\.ts$/.test(file.replace(/\\/g, "/")) || !/moderator|moderation|review/i.test(file)) continue;
    assert.doesNotMatch(text, /changeDealState|"deal:publish"|"affiliate:manage"|"account:|"security:manage"/, `${file} must not use publishing/account/affiliate permissions`);
  }
  const accounts = readFileSync("src/app/api/admin/accounts/route.ts", "utf8");
  assert.match(accounts, /Partial<Record<UserRole, Permission>>/, "no create permission exists for a moderator");
  const service = readFileSync("src/server/auth/service.ts", "utf8");
  assert.match(service, /UserRole\.COMMUNITY_MODERATOR[^]*managed from the moderator appointments page/, "generic role/status changes refuse moderators");
});
