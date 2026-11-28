import { ci } from "@/server/db/case-insensitive";
import { searchStaffIdsMariaDb, usesMariaDb } from "@/server/community/like-search";
import { z } from "zod";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { authorize } from "@/server/auth/authorization";
import { createAccountSetupToken, AuthenticationFailure } from "@/server/auth/service";
import { canAssignRole, roleCan, type Permission } from "@/server/auth/permissions";
import { assertSameOrigin, getRequestMetadata } from "@/server/auth/request";
import { parseRequestBody, authFailureResponse } from "@/server/auth/http";

const createAccountSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(UserRole),
  emailDeliveryVerified: z.literal(true),
});

export async function GET(request: Request) {
  const authorization = await authorize("account:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const params = new URL(request.url).searchParams;
  const query = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    search: z.string().trim().max(254).default(""),
  }).parse(Object.fromEntries(params));
  const db = getDatabase();
  const staffRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR];
  const search = query.search.trim();
  // Deleted accounts stay in the database but are not shown. Timed suspensions that have run out go back to Active.
  await db.user.updateMany({ where: { status: UserStatus.SUSPENDED, suspendedUntil: { lte: new Date() } }, data: { status: UserStatus.ACTIVE, suspendedFrom: null, suspendedUntil: null, suspensionReason: null } });
  const where = {
    role: { in: staffRoles },
    status: { not: UserStatus.DELETED },
    ...(search ? (usesMariaDb() ? { id: { in: await searchStaffIdsMariaDb(search) } } : { OR: [
      { email: { contains: search, ...ci() } },
      { name: { contains: search, ...ci() } },
    ] }) : {}),
  };
  const [users, total, totalAccounts, activeAccounts, suspendedAccounts, mfaEnabled] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        totpEnabledAt: true,
        createdAt: true,
        suspendedFrom: true,
        suspendedUntil: true,
        suspensionReason: true,
        customAccess: true,
        customAccessUntil: true,
      },
    }),
    db.user.count({ where }),
    db.user.count({ where: { role: { in: staffRoles }, status: { not: UserStatus.DELETED } } }),
    db.user.count({ where: { role: { in: staffRoles }, status: UserStatus.ACTIVE } }),
    db.user.count({ where: { role: { in: staffRoles }, status: UserStatus.SUSPENDED } }),
    db.user.count({ where: { role: { in: staffRoles }, status: { not: UserStatus.DELETED }, totpEnabledAt: { not: null } } }),
  ]);
  const accountIds = users.map((user) => user.id);
  const creationEvents = accountIds.length ? await db.auditEvent.findMany({
    where: { action: "admin.account.created", targetId: { in: accountIds } },
    orderBy: { createdAt: "asc" },
    select: {
      targetId: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  }) : [];
  const creatorByAccount = new Map<string, { id: string; name: string | null; email: string | null }>();
  for (const event of creationEvents) {
    if (event.targetId && event.actor && !creatorByAccount.has(event.targetId)) creatorByAccount.set(event.targetId, event.actor);
  }
  return Response.json({
    users: users.map((user) => ({ ...user, createdBy: creatorByAccount.get(user.id) ?? null })),
    page: query.page,
    pageSize: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    counts: { total: totalAccounts, active: activeAccounts, suspended: suspendedAccounts, mfaEnabled },
  });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const authorization = await authorize("account:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const parsed = await parseRequestBody(request, createAccountSchema);
  if (parsed.response) return parsed.response;

  // A community moderator is never created here: it needs an invitation that the invited customer accepts while signed in (see server/community/moderators.ts).
  const createPermissions: Partial<Record<UserRole, Permission>> = {
    [UserRole.SUPER_ADMIN]: "account:create:super-admin",
    [UserRole.ADMIN]: "account:create:admin",
    [UserRole.EDITOR]: "account:create:editor",
  };
  const createPermission = createPermissions[parsed.data.role];
  if (!createPermission || !roleCan(authorization.context.user.role, createPermission) ||
      !canAssignRole(authorization.context.user.role, parsed.data.role)) {
    return Response.json({ error: "You are not permitted to create an account with that role." }, { status: 403 });
  }

  try {
    const result = await createAccountSetupToken({
      email: parsed.data.email,
      role: parsed.data.role,
      emailDeliveryVerified: parsed.data.emailDeliveryVerified,
      actorId: authorization.context.user.id,
      metadata: getRequestMetadata(request),
    });
    const setupUrl = new URL("/admin/setup", getAuthEnv().NEXTAUTH_URL);
    setupUrl.searchParams.set("token", result.token);
    return Response.json({ userId: result.userId, setupUrl: setupUrl.toString() }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationFailure) return authFailureResponse(error, 409);
    throw error;
  }
}
