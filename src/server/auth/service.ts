import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { AuthTokenPurpose, UserRole, UserStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "./audit";
import { canAssignRole, canChangeRole, roleCan } from "./permissions";
import {
  createOpaqueToken,
  createRecoveryCodes,
  createTotpSecret,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  hashOpaqueToken,
  hashPassword,
  hashRateLimitSubject,
  hashRecoveryCode,
  validatePassword,
  verifyPassword,
  verifyTotp,
} from "./crypto";
import { ABSOLUTE_SESSION_TIMEOUT_MS, getSessionExpiry } from "./session-policy";
import { suspensionBlocks, suspensionEnded } from "./suspension";

export const BOOTSTRAP_EMAIL_APPROVED = "saran.be.2005@gmail.com";
const BOOTSTRAP_STATE_ID = "initial-super-admin";
const SETUP_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));

export type RequestAuditMetadata = {
  ipHash: string | null;
  userAgent: string | null;
  requestId: string;
};

export class AuthenticationFailure extends Error {}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function authTokenHash(token: string): string {
  return hashOpaqueToken(token, getAuthEnv().AUTH_SESSION_SECRET);
}

async function getValidToken(token: string, purpose: AuthTokenPurpose | AuthTokenPurpose[]) {
  const purposes = Array.isArray(purpose) ? purpose : [purpose];
  const row = await getDatabase().authToken.findUnique({ where: { tokenHash: authTokenHash(token) } });
  if (!row || !purposes.includes(row.purpose) || row.completedAt || row.revokedAt || row.expiresAt <= new Date()) {
    return null;
  }
  return row;
}

function loginRateLimitHashes(email: string, network: string, pepper: string): string[] {
  return [
    hashRateLimitSubject(`email:${email}`, pepper),
    hashRateLimitSubject(`network:${network}`, pepper),
    hashRateLimitSubject(`pair:${email}\0${network}`, pepper),
  ];
}

async function recordLoginFailure(subjectHashes: string[], userId: string | null, metadata: RequestAuditMetadata) {
  const db = getDatabase();
  await Promise.all(subjectHashes.map(async (subjectHash) => {
    const updated = await db.authRateLimit.upsert({
      where: { subjectHash },
      create: { subjectHash, failures: 1 },
      update: { failures: { increment: 1 } },
      select: { failures: true },
    });
    const failures = Math.min(updated.failures, 16);
    const delaySeconds = failures < 5 ? 0 : Math.min(15 * 60, 2 ** Math.min(failures - 5, 9));
    const lockedUntil = delaySeconds ? new Date(Date.now() + delaySeconds * 1000) : null;
    await db.authRateLimit.updateMany({
      where: { subjectHash, failures: { lte: updated.failures } },
      data: { lockedUntil },
    });
  }));
  await writeAudit({
    actorId: null,
    targetId: userId,
    action: "auth.login.failed",
    success: false,
    ...metadata,
    metadata: { reason: "invalid_credentials_or_mfa" },
  });
}

async function consumeRecoveryCode(userId: string, code: string, tx: Prisma.TransactionClient) {
  const candidateHash = hashRecoveryCode(code, getAuthEnv().AUTH_SESSION_SECRET);
  const row = await tx.recoveryCode.findFirst({ where: { userId, codeHash: candidateHash, usedAt: null } });
  if (!row) return false;
  const updated = await tx.recoveryCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count === 1;
}

export async function authenticate(input: {
  email: string;
  password: string;
  mfaCode: string;
  metadata: RequestAuditMetadata;
}): Promise<{ userId: string; token: string }> {
  const email = normalizedEmail(input.email);
  const db = getDatabase();
  const env = getAuthEnv();
  const network = input.metadata.ipHash ?? "unknown-network";
  const subjectHashes = loginRateLimitHashes(email, network, env.AUTH_SESSION_SECRET);
  const limiters = await db.authRateLimit.findMany({ where: { subjectHash: { in: subjectHashes } } });
  const now = new Date();
  if (limiters.some((limiter) => limiter.lockedUntil && limiter.lockedUntil > now)) {
    await writeAudit({
      action: "auth.login.failed",
      targetId: null,
      success: false,
      ...input.metadata,
      metadata: { reason: "rate_limited" },
    });
    throw new AuthenticationFailure("Invalid email, password, or authenticator code.");
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, passwordHash: true, role: true, status: true,
      totpSecretEncrypted: true, totpEnabledAt: true, lastTotpStep: true, suspendedFrom: true, suspendedUntil: true,
    },
  });
  if (user && suspensionEnded(user, now)) {
    // A timed suspension has run out: put the account back to normal before the checks below.
    await db.user.updateMany({ where: { id: user.id, status: UserStatus.SUSPENDED }, data: { status: UserStatus.ACTIVE, suspendedFrom: null, suspendedUntil: null, suspensionReason: null } });
    user.status = UserStatus.ACTIVE;
  }
  const passwordMatches = await verifyPassword(user?.passwordHash ?? await DUMMY_HASH, input.password);
  if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE || suspensionBlocks(user, now) || !user.totpEnabledAt || !user.totpSecretEncrypted) {
    await recordLoginFailure(subjectHashes, user?.id ?? null, input.metadata);
    throw new AuthenticationFailure("Invalid email, password, or authenticator code.");
  }

  const secret = decryptTotpSecret(user.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY);
  const acceptedStep = verifyTotp(secret, input.mfaCode);
  const isRecovery = acceptedStep === null && input.mfaCode.length >= 16;
  if (acceptedStep === null && !isRecovery) {
    await recordLoginFailure(subjectHashes, user.id, input.metadata);
    await writeAudit({
      actorId: user.id,
      targetId: user.id,
      action: "auth.mfa.failed",
      success: false,
      ...input.metadata,
      metadata: { method: "totp" },
    });
    throw new AuthenticationFailure("Invalid email, password, or authenticator code.");
  }

  const rawSessionToken = createOpaqueToken(32);
  const tokenHash = hashOpaqueToken(rawSessionToken, env.AUTH_SESSION_SECRET);
  const sessionNow = new Date();
  const absoluteExpiresAt = new Date(sessionNow.getTime() + ABSOLUTE_SESSION_TIMEOUT_MS);
  const expiresAt = getSessionExpiry(sessionNow, absoluteExpiresAt);

  try {
    await db.$transaction(async (tx) => {
      if (acceptedStep !== null) {
        const replayGuard = await tx.user.updateMany({
          where: { id: user.id, status: UserStatus.ACTIVE, lastTotpStep: { lt: BigInt(acceptedStep) } },
          data: { lastTotpStep: BigInt(acceptedStep) },
        });
        if (replayGuard.count !== 1) throw new AuthenticationFailure("TOTP code was already used.");
      } else if (!(await consumeRecoveryCode(user.id, input.mfaCode, tx))) {
        throw new AuthenticationFailure("Recovery code was already used.");
      }

      await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash,
          lastActivityAt: sessionNow,
          expiresAt,
          absoluteExpiresAt,
          ipHash: input.metadata.ipHash,
          userAgent: input.metadata.userAgent,
        },
      });
      await tx.authRateLimit.deleteMany({ where: { subjectHash: { in: subjectHashes } } });
      await writeAudit({
        actorId: user.id,
        targetId: user.id,
        action: "auth.login.succeeded",
        success: true,
        ...input.metadata,
        metadata: { role: user.role, method: acceptedStep === null ? "recovery_code" : "totp" },
      }, tx);
    });
  } catch (error) {
    if (error instanceof AuthenticationFailure) {
      await recordLoginFailure(subjectHashes, user.id, input.metadata);
      await writeAudit({
        actorId: user.id,
        targetId: user.id,
        action: "auth.mfa.failed",
        success: false,
        ...input.metadata,
        metadata: { method: acceptedStep === null ? "recovery_code" : "totp" },
      });
      throw new AuthenticationFailure("Invalid email, password, or authenticator code.");
    }
    throw error;
  }

  return { userId: user.id, token: rawSessionToken };
}

export async function beginSetup(token: string, password: string): Promise<{ qrCodeDataUrl: string; secret: string }> {
  const row = await getValidToken(token, [AuthTokenPurpose.ACCOUNT_SETUP, AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP]);
  if (!row) throw new AuthenticationFailure("Setup link is invalid or expired.");
  const passwordError = validatePassword(password, row.email);
  if (passwordError) throw new AuthenticationFailure(passwordError);
  const env = getAuthEnv();

  let secret: string;
  if (row.startedAt) {
    if (!row.totpSecretEncrypted || !row.passwordHash) throw new Error("Incomplete setup state");
    if (!(await verifyPassword(row.passwordHash, password))) {
      throw new AuthenticationFailure("Setup has already started with a different password.");
    }
    secret = decryptTotpSecret(row.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY);
  } else {
    secret = createTotpSecret();
    const updated = await getDatabase().authToken.updateMany({
      where: { id: row.id, startedAt: null, completedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: {
        startedAt: new Date(),
        passwordHash: await hashPassword(password),
        totpSecretEncrypted: encryptTotpSecret(secret, env.AUTH_TOTP_ENCRYPTION_KEY),
      },
    });
    if (updated.count !== 1) {
      const current = await getDatabase().authToken.findUnique({ where: { id: row.id } });
      if (!current || current.completedAt || current.revokedAt || current.expiresAt <= new Date() ||
          !current.totpSecretEncrypted || !current.passwordHash) {
        throw new AuthenticationFailure("Setup link is invalid or expired.");
      }
      if (!(await verifyPassword(current.passwordHash, password))) {
        throw new AuthenticationFailure("Setup has already started with a different password.");
      }
      secret = decryptTotpSecret(current.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY);
    }
  }

  const uri = createTotpUri(secret, row.email);
  return { qrCodeDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }), secret };
}

export async function completeSetup(token: string, code: string, metadata: RequestAuditMetadata): Promise<string[]> {
  const row = await getValidToken(token, [AuthTokenPurpose.ACCOUNT_SETUP, AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP]);
  if (!row || !row.startedAt || !row.passwordHash || !row.totpSecretEncrypted || !row.userId) {
    throw new AuthenticationFailure("Setup link is invalid or expired.");
  }
  const env = getAuthEnv();
  const secret = decryptTotpSecret(row.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY);
  const step = verifyTotp(secret, code);
  if (step === null) {
    await writeAudit({
      actorId: row.createdById,
      targetId: row.userId,
      action: "auth.mfa.enrollment.failed",
      success: false,
      ...metadata,
      metadata: { reason: "invalid_totp" },
    });
    throw new AuthenticationFailure("Authenticator code is invalid.");
  }
  const recoveryCodes = createRecoveryCodes();
  const now = new Date();
  await getDatabase().$transaction(async (tx) => {
    const activated = await tx.user.updateMany({
      where: { id: row.userId!, status: UserStatus.PENDING_SETUP, lastTotpStep: { lt: BigInt(step) } },
      data: {
        passwordHash: row.passwordHash!,
        totpSecretEncrypted: row.totpSecretEncrypted!,
        totpEnabledAt: now,
        lastTotpStep: BigInt(step),
        status: UserStatus.ACTIVE,
        emailVerified: row.emailDeliveryVerified || row.purpose === AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP ? now : null,
      },
    });
    if (activated.count !== 1) throw new AuthenticationFailure("Account setup is no longer available.");
    await tx.recoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: row.userId!,
        codeHash: hashRecoveryCode(code, env.AUTH_SESSION_SECRET),
      })),
    });
    const completed = await tx.authToken.updateMany({
      where: { id: row.id, completedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { completedAt: now, passwordHash: null, totpSecretEncrypted: null },
    });
    if (completed.count !== 1) throw new AuthenticationFailure("Setup link is no longer available.");
    if (row.purpose === AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP) {
      await tx.bootstrapState.upsert({
        where: { id: BOOTSTRAP_STATE_ID },
        create: { id: BOOTSTRAP_STATE_ID, completedAt: now },
        update: { completedAt: now },
      });
    }
    await writeAudit({
      actorId: row.createdById,
      targetId: row.userId,
      action: row.purpose === AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP ? "auth.bootstrap.completed" : "auth.account.setup.completed",
      success: true,
      ...metadata,
      metadata: { role: row.role },
    }, tx);
  });
  return recoveryCodes;
}

export async function createBootstrapSetup(): Promise<{ token: string; userId: string }> {
  const env = getAuthEnv();
  if (!env.AUTH_BOOTSTRAP_ENABLED || process.env.NODE_ENV === "production") {
    throw new Error("Local super-admin bootstrap is disabled");
  }
  const email = normalizedEmail(env.AUTH_BOOTSTRAP_EMAIL);
  if (email !== BOOTSTRAP_EMAIL_APPROVED) throw new Error("AUTH_BOOTSTRAP_EMAIL does not match the approved initial administrator");

  const token = createOpaqueToken(32);
  const db = getDatabase();
  const result = await db.$transaction(async (tx) => {
    const state = await tx.bootstrapState.findUnique({ where: { id: BOOTSTRAP_STATE_ID } });
    const existingSuperAdmin = await tx.user.findFirst({ where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } });
    if (state?.completedAt || existingSuperAdmin) throw new Error("Initial super-admin bootstrap has already been completed");
    let user = await tx.user.findUnique({ where: { email } });
    if (user && (user.role !== UserRole.SUPER_ADMIN || user.status !== UserStatus.PENDING_SETUP)) {
      throw new Error("Approved bootstrap email already belongs to a non-bootstrap account");
    }
    if (!user) {
      user = await tx.user.create({ data: { email, role: UserRole.SUPER_ADMIN, status: UserStatus.PENDING_SETUP } });
    }
    const priorTokens = await tx.authToken.findMany({
      where: { purpose: AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP, completedAt: null, revokedAt: null },
      select: { id: true },
    });
    if (priorTokens.length) {
      await tx.authToken.updateMany({
        where: { id: { in: priorTokens.map((item) => item.id) } },
        data: { revokedAt: new Date() },
      });
    }
    await tx.authToken.create({
      data: {
        tokenHash: authTokenHash(token),
        purpose: AuthTokenPurpose.SUPER_ADMIN_BOOTSTRAP,
        email,
        userId: user.id,
        role: UserRole.SUPER_ADMIN,
        expiresAt: new Date(Date.now() + SETUP_TOKEN_LIFETIME_MS),
      },
    });
    await writeAudit({
      actorId: null,
      targetId: user.id,
      action: "auth.bootstrap.issued",
      success: true,
      metadata: { method: "local_cli", expiresInMinutes: SETUP_TOKEN_LIFETIME_MS / 60_000 },
    }, tx);
    await tx.bootstrapState.upsert({
      where: { id: BOOTSTRAP_STATE_ID },
      create: { id: BOOTSTRAP_STATE_ID },
      update: {},
    });
    return user.id;
  }, { isolationLevel: "Serializable" });
  return { token, userId: result };
}

export async function createAccountSetupToken(input: {
  email: string;
  role: UserRole;
  emailDeliveryVerified: boolean;
  actorId: string;
  metadata: RequestAuditMetadata;
}): Promise<{ token: string; userId: string }> {
  const email = normalizedEmail(input.email);
  const token = createOpaqueToken(32);
  const result = await getDatabase().$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true, role: true, status: true },
    });
    if (existing && (existing.status !== UserStatus.PENDING_SETUP || existing.role !== input.role)) {
      throw new AuthenticationFailure("An account with that email already exists.");
    }
    const user = existing ?? await tx.user.create({
      data: { email, role: input.role, status: UserStatus.PENDING_SETUP },
      select: { id: true },
    });
    if (existing) {
      await tx.authToken.updateMany({
        where: {
          userId: existing.id,
          purpose: AuthTokenPurpose.ACCOUNT_SETUP,
          completedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    await tx.authToken.create({
      data: {
        tokenHash: authTokenHash(token),
        purpose: AuthTokenPurpose.ACCOUNT_SETUP,
        email,
        userId: user.id,
        role: input.role,
        createdById: input.actorId,
        emailDeliveryVerified: input.emailDeliveryVerified,
        expiresAt: new Date(Date.now() + SETUP_TOKEN_LIFETIME_MS),
      },
    });
    await writeAudit({
      actorId: input.actorId,
      targetId: user.id,
      action: existing ? "admin.account.setup_reissued" : "admin.account.created",
      success: true,
      ...input.metadata,
      metadata: { role: input.role, verifiedEmailAttested: input.emailDeliveryVerified },
    }, tx);
    return user.id;
  }, { isolationLevel: "Serializable" });
  return { token, userId: result };
}

export async function createManualPasswordReset(emailInput: string): Promise<{ userId: string; token: string }> {
  const email = normalizedEmail(emailInput);
  const user = await getDatabase().user.findFirst({
    where: { email, emailVerified: { not: null }, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  if (!user) throw new AuthenticationFailure("No active account with a verified email was found.");
  const token = createOpaqueToken(32);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_LIFETIME_MS);
  await getDatabase().$transaction(async (tx) => {
    const now = new Date();
    await tx.authToken.updateMany({
      where: {
        userId: user.id,
        purpose: AuthTokenPurpose.PASSWORD_RESET,
        completedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await tx.authToken.create({
      data: {
        tokenHash: authTokenHash(token),
        purpose: AuthTokenPurpose.PASSWORD_RESET,
        email,
        userId: user.id,
        expiresAt,
      },
    });
    await writeAudit({
      actorId: null,
      targetId: user.id,
      action: "auth.password_reset.operator_issued",
      success: true,
      metadata: { method: "local_cli", expiresInMinutes: PASSWORD_RESET_TOKEN_LIFETIME_MS / 60_000 },
    }, tx);
  }, { isolationLevel: "Serializable" });
  return { userId: user.id, token };
}

export async function completePasswordReset(token: string, password: string, metadata: RequestAuditMetadata): Promise<void> {
  const row = await getValidToken(token, AuthTokenPurpose.PASSWORD_RESET);
  if (!row?.userId) throw new AuthenticationFailure("Reset link is invalid or expired.");
  const userId = row.userId;
  const passwordError = validatePassword(password, row.email);
  if (passwordError) throw new AuthenticationFailure(passwordError);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await getDatabase().$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, status: UserStatus.ACTIVE, emailVerified: { not: null } },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw new AuthenticationFailure("Reset link is invalid or expired.");
    const consumed = await tx.authToken.updateMany({
      where: { id: row.id, purpose: AuthTokenPurpose.PASSWORD_RESET, completedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { completedAt: now, passwordHash: null },
    });
    if (consumed.count !== 1) throw new AuthenticationFailure("Reset link is invalid or expired.");
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.authToken.updateMany({
      where: { userId, purpose: AuthTokenPurpose.PASSWORD_RESET, completedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeAudit({
      actorId: userId,
      targetId: userId,
      action: "auth.password_reset.completed",
      success: true,
      ...metadata,
      metadata: {},
    }, tx);
  });
}

export async function updateAccount(input: {
  actorId: string;
  actorRole: UserRole;
  targetId: string;
  role?: UserRole;
  status?: UserStatus;
  metadata: RequestAuditMetadata;
}): Promise<void> {
  if (!input.role && !input.status) throw new AuthenticationFailure("No account changes were provided.");
  if (input.actorId === input.targetId) throw new AuthenticationFailure("You cannot change your own role or status.");
  const db = getDatabase();
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: input.targetId },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new AuthenticationFailure("Account not found.");
    // Moderators are appointed, confirmed and revoked only through the moderator appointment workflow, which keeps the invitation, probation and audit history.
    if (input.role === UserRole.COMMUNITY_MODERATOR || target.role === UserRole.COMMUNITY_MODERATOR) {
      throw new AuthenticationFailure("Community moderators are managed from the moderator appointments page.");
    }
    if (input.status && input.status !== UserStatus.ACTIVE && input.status !== UserStatus.SUSPENDED) {
      throw new AuthenticationFailure("Requested account status is not allowed.");
    }

    if (input.role) {
      if (input.role === target.role ||
          !roleCan(input.actorRole, "account:role:update") ||
          !canAssignRole(input.actorRole, input.role) ||
          !canChangeRole(input.actorRole, target.id, input.actorId)) {
        throw new AuthenticationFailure("You are not permitted to change this account's role.");
      }
    }

    if (input.status) {
      const permission = input.status === UserStatus.SUSPENDED ? "account:suspend" : "account:reactivate";
      if (!roleCan(input.actorRole, permission) ||
          (input.actorRole === UserRole.ADMIN && target.role !== UserRole.EDITOR)) {
        throw new AuthenticationFailure("You are not permitted to change this account's status.");
      }
      if ((target.status === UserStatus.SUSPENDED && input.status === UserStatus.SUSPENDED) ||
          (target.status === UserStatus.ACTIVE && input.status === UserStatus.ACTIVE) ||
          target.status === UserStatus.PENDING_SETUP) {
        throw new AuthenticationFailure("Account status transition is not allowed.");
      }
    }

    const nextRole = input.role ?? target.role;
    const nextStatus = input.status ?? target.status;
    if (target.role === UserRole.SUPER_ADMIN && target.status === UserStatus.ACTIVE &&
        (nextRole !== UserRole.SUPER_ADMIN || nextStatus !== UserStatus.ACTIVE)) {
      const activeAdmins = await tx.user.count({ where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } });
      if (activeAdmins <= 1) throw new AuthenticationFailure("The last active super administrator cannot be removed.");
    }

    await tx.user.update({
      where: { id: target.id },
      data: { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) },
    });
    if (input.status === UserStatus.SUSPENDED || input.role) {
      await tx.authSession.deleteMany({ where: { userId: target.id } });
    }
    await writeAudit({
      actorId: input.actorId,
      targetId: target.id,
      action: input.role ? "admin.account.role_changed" : "admin.account.status_changed",
      success: true,
      ...input.metadata,
      metadata: {
        fromRole: target.role,
        toRole: nextRole,
        fromStatus: target.status,
        toStatus: nextStatus,
      },
    }, tx);
  }, { isolationLevel: "Serializable" });
}
