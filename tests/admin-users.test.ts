import assert from "node:assert/strict";
import test from "node:test";
import { roleCan } from "@/server/auth/permissions";
import { parseUsersQuery, toMemberRow, assertCanViewUsers } from "@/server/admin/users";

test("only Super Administrators and Administrators may see the Users list", () => {
  assert.equal(roleCan("SUPER_ADMIN", "users:view"), true);
  assert.equal(roleCan("ADMIN", "users:view"), true);
  assert.equal(roleCan("EDITOR", "users:view"), false);
  assert.equal(roleCan("COMMUNITY_MODERATOR", "users:view"), false);
  assert.throws(() => assertCanViewUsers("EDITOR"), { status: 403 });
  assert.doesNotThrow(() => assertCanViewUsers("ADMIN"));
});

test("the member row never carries a password, date of birth, sex or location", () => {
  const row = toMemberRow({
    id: "c1", name: "Asha", email: "asha@example.com", createdAt: new Date("2026-11-20T10:00:00Z"), emailVerifiedAt: new Date(), disabledAt: null, passwordHash: "$argon2id$secret",
    identities: [{ provider: "google" }, { provider: "apple" }], forumProfile: { handle: "asha", lastSeenAt: null, status: "ACTIVE" },
    _count: { dealComments: 2, dealVotes: 3, savedDeals: 1, submissions: 0 },
  } as never);
  const text = JSON.stringify(row);
  assert.ok(!/argon2|passwordHash|dateOfBirth|sex|location/i.test(text));
  assert.deepEqual(row.signInMethods, ["Email and password", "Google", "Apple"]);
  assert.equal(row.status, "Active");
  assert.equal(toMemberRow({ ...({} as never), id: "c2", name: "B", email: "b@x.in", createdAt: new Date(), emailVerifiedAt: null, disabledAt: new Date(), passwordHash: null, identities: [], forumProfile: null, _count: { dealComments: 0, dealVotes: 0, savedDeals: 0, submissions: 0 } }).status, "Disabled");
});

test("the list query is bounded", () => {
  assert.deepEqual(parseUsersQuery("http://x/api?page=3&q=%20asha%20&days=30"), { page: 3, q: "asha", days: 30 });
  assert.deepEqual(parseUsersQuery("http://x/api"), { page: 1, q: "", days: 7 });
  assert.throws(() => parseUsersQuery("http://x/api?page=0"));
  assert.throws(() => parseUsersQuery("http://x/api?days=365"));
  assert.throws(() => parseUsersQuery("http://x/api?q=" + "a".repeat(81)));
});
