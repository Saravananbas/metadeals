import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
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

export async function GET() {
  const authorization = await authorize("account:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const users = await getDatabase().user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      totpEnabledAt: true,
      createdAt: true,
    },
  });
  return Response.json({ users });
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

  const createPermissions: Record<UserRole, Permission> = {
    [UserRole.SUPER_ADMIN]: "account:create:super-admin",
    [UserRole.ADMIN]: "account:create:admin",
    [UserRole.EDITOR]: "account:create:editor",
  };
  const createPermission = createPermissions[parsed.data.role];
  if (!roleCan(authorization.context.user.role, createPermission) ||
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
