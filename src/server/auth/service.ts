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
/** Five failed sign-ins on one email lock it for 30 minutes (wrong, unknown or not: the count is kept per typed email, so an unknown email behaves the same). */
const ACCOUNT_LOCK_AFTER = 5;
export const ACCOUNT_LOCK_MS = 30 * 60 * 1000;
export const ACCOUNT_LOCKED_MESSAGE = "Too many failed attempts. This account is locked for 30 minutes. Try again later, or use Forgot password to unlock it with a new password.";
const TEMP_PASSWORD_LIFETIME_MS = 25 * 60 * 1000;
const TEMP_PASSWORD_LENGTH = 10;
/** No 0/O, 1/l/I: the temporary password is read from an email and typed by hand. */
const TEMP_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TEMP_PASSWORD_WRONG_TRIES = 5;
/** Thrown at sign-in when the person typed their temporary password: no session is opened and it is not counted as a failure. */
export class PasswordChangeRequired extends Error {}

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
  await Promise.all(subjectHashes.map(async (subjectHash, index) => {
    const updated = await db.authRateLimit.upsert({
      where: { subjectHash },
      create: { subjectHash, failures: 1 },
      update: { failures: { increment: 1 } },
      select: { failures: true },
    });
    const failures = Math.min(updated.failures, 16);
    // The typed email (index 0) is the account lock: flat 30 minutes at the 5th failure. The address and the pair keep the short growing delay,
    // so one shared office address is not locked out for half an hour.
    const delaySeconds = failures < 5 ? 0 : index === 0 ? ACCOUNT_LOCK_MS / 1000 : Math.min(15 * 60, 2 ** Math.min(failures - 5, 9));
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

/** The person's latest unused, unexpired temporary password row, when the typed text is that password. */
async function currentTemporaryPassword(userId: string, typed: string, now: Date) {
  const row = await getDatabase().authToken.findFirst({
    where: { userId, purpose: AuthTokenPurpose.PASSWORD_RESET, passwordHash: { not: null }, completedAt: null, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, passwordHash: true },
  });
  if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, typed))) return null;
  return row;
}

/** 10 characters from an alphabet without look-alikes, drawn without modulo bias. */
export function generateTemporaryPassword(): string {
  const limit = Math.floor(256 / TEMP_PASSWORD_ALPHABET.length) * TEMP_PASSWORD_ALPHABET.length;
  let out = "";
  while (out.length < TEMP_PASSWORD_LENGTH) {
    for (const byte of randomBytes(TEMP_PASSWORD_LENGTH * 2)) {
      if (byte < limit && out.length < TEMP_PASSWORD_LENGTH) out += TEMP_PASSWORD_ALPHABET[byte % TEMP_PASSWORD_ALPHABET.length];
    }
  }
  return out;
}

/** A sliding allowance of `max` tries per subject within the window (30 minutes by default); true while the try is allowed. */
async function allowAttempt(subject: string, max: number, windowMs = ACCOUNT_LOCK_MS): Promise<boolean> {
  const db = getDatabase();
  const subjectHash = hashRateLimitSubject(subject, getAuthEnv().AUTH_SESSION_SECRET);
  const existing = await db.authRateLimit.findUnique({ where: { subjectHash }, select: { updatedAt: true } });
  if (existing && Date.now() - existing.updatedAt.getTime() > windowMs) await db.authRateLimit.deleteMany({ where: { subjectHash } });
  const updated = await db.authRateLimit.upsert({ where: { subjectHash }, create: { subjectHash, failures: 1 }, update: { failures: { increment: 1 } }, select: { failures: true } });
  return updated.failures <= max;
}

/**
 * "Forgot password" step 1. Returns the new temporary password to email, or null for EVERY other outcome; the caller answers the same neutral message either way.
 * It needs a valid authenticator code, is limited per email and per address, and never touches the sign-in lock (it is the way out of that lock).
 */
export async function requestTemporaryPassword(input: { email: string; mfaCode: string; metadata: RequestAuditMetadata }): Promise<{ email: string; tempPassword: string; tokenId: string } | null> {
  const email = normalizedEmail(input.email);
  const db = getDatabase();
  const env = getAuthEnv();
  const record = (userId: string | null, success: boolean, reason?: string) => writeAudit({ actorId: null, targetId: userId, action: "auth.password_reset.temporary_requested", success, ...input.metadata, metadata: reason ? { reason } : {} });
  const allowedEmail = await allowAttempt(`forgot-email:${email}`, 5);
  const allowedNetwork = await allowAttempt(`forgot-network:${input.metadata.ipHash ?? "unknown-network"}`, 20);
  if (!allowedEmail || !allowedNetwork) { await record(null, false, "rate_limited"); return null; }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, totpSecretEncrypted: true, totpEnabledAt: true } });
  if (!user || user.status !== UserStatus.ACTIVE || !user.totpEnabledAt || !user.totpSecretEncrypted) {
    await verifyPassword(await DUMMY_HASH, "not-a-password"); // about the same time as a real account
    await record(user?.id ?? null, false, "no_active_account");
    return null;
  }
  const step = verifyTotp(decryptTotpSecret(user.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY), input.mfaCode);
  if (step === null) { await record(user.id, false, "bad_code"); return null; }
  const guard = await db.user.updateMany({ where: { id: user.id, status: UserStatus.ACTIVE, lastTotpStep: { lt: BigInt(step) } }, data: { lastTotpStep: BigInt(step) } });
  if (guard.count !== 1) { await record(user.id, false, "code_reused"); return null; }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);
  const now = new Date();
  const tokenId = await db.$transaction(async (tx) => {
    // Only earlier temporary passwords are cancelled; a link issued by a Super Admin stays as it is.
    await tx.authToken.updateMany({ where: { userId: user.id, purpose: AuthTokenPurpose.PASSWORD_RESET, passwordHash: { not: null }, completedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const created = await tx.authToken.create({
      data: { tokenHash: authTokenHash(createOpaqueToken(32)), purpose: AuthTokenPurpose.PASSWORD_RESET, email, userId: user.id, passwordHash, expiresAt: new Date(now.getTime() + TEMP_PASSWORD_LIFETIME_MS) },
      select: { id: true },
    });
    await writeAudit({ actorId: null, targetId: user.id, action: "auth.password_reset.temporary_requested", success: true, ...input.metadata, metadata: { expiresInMinutes: TEMP_PASSWORD_LIFETIME_MS / 60_000 } }, tx);
    return created.id;
  });
  return { email, tempPassword, tokenId };
}

/**
 * "Forgot password" step 2: the temporary password, a new password (twice) and a fresh authenticator code. Opens no session.
 * A wrong temporary password or code counts toward the same sign-in lock; five wrong tries burn the temporary password.
 */
export async function changePasswordWithTemporary(input: { email: string; tempPassword: string; newPassword: string; confirmPassword: string; mfaCode: string; metadata: RequestAuditMetadata }): Promise<void> {
  const email = normalizedEmail(input.email);
  const db = getDatabase();
  const env = getAuthEnv();
  if (input.newPassword !== input.confirmPassword) throw new AuthenticationFailure("The new password and the confirmation do not match.");
  const passwordError = validatePassword(input.newPassword, email);
  if (passwordError) throw new AuthenticationFailure(passwordError);
  if (input.newPassword === input.tempPassword) throw new AuthenticationFailure("Choose a new password that is different from the temporary one.");

  const BAD = "The temporary password or authenticator code is not correct, or the temporary password has expired.";
  const subjectHashes = loginRateLimitHashes(email, input.metadata.ipHash ?? "unknown-network", env.AUTH_SESSION_SECRET);
  const now = new Date();
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, totpSecretEncrypted: true, totpEnabledAt: true } });
  const active = user && user.status === UserStatus.ACTIVE && user.totpEnabledAt && user.totpSecretEncrypted ? user : null;
  const row = active ? await currentTemporaryPassword(active.id, input.tempPassword, now) : null;
  if (!active) await verifyPassword(await DUMMY_HASH, "not-a-password");
  const step = active ? verifyTotp(decryptTotpSecret(active.totpSecretEncrypted!, env.AUTH_TOTP_ENCRYPTION_KEY), input.mfaCode) : null;
  if (!active || !row || step === null) {
    await recordLoginFailure(subjectHashes, user?.id ?? null, input.metadata);
    if (active) {
      const current = await db.authToken.findFirst({ where: { userId: active.id, purpose: AuthTokenPurpose.PASSWORD_RESET, passwordHash: { not: null }, completedAt: null, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (current && !(await allowAttempt(`temporary-password-tries:${current.id}`, TEMP_PASSWORD_WRONG_TRIES - 1))) {
        await db.authToken.updateMany({ where: { id: current.id, completedAt: null }, data: { revokedAt: now, passwordHash: null } });
      }
    }
    throw new AuthenticationFailure(BAD);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    const guard = await tx.user.updateMany({ where: { id: active.id, status: UserStatus.ACTIVE, lastTotpStep: { lt: BigInt(step) } }, data: { passwordHash, lastTotpStep: BigInt(step) } });
    if (guard.count !== 1) throw new AuthenticationFailure("That authenticator code was already used. Wait for the next code and try again.");
    const consumed = await tx.authToken.updateMany({ where: { id: row.id, completedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { completedAt: now, passwordHash: null } });
    if (consumed.count !== 1) throw new AuthenticationFailure(BAD);
    await tx.authToken.updateMany({ where: { userId: active.id, purpose: AuthTokenPurpose.PASSWORD_RESET, completedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.authSession.deleteMany({ where: { userId: active.id } });
    // Choosing a new password unlocks the account.
    await tx.authRateLimit.deleteMany({ where: { subjectHash: subjectHashes[0] } });
    await writeAudit({ actorId: active.id, targetId: active.id, action: "auth.password_reset.temporary_completed", success: true, ...input.metadata, metadata: {} }, tx);
  });
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
  let limiters = await db.authRateLimit.findMany({ where: { subjectHash: { in: subjectHashes } } });
  const now = new Date();
  // A lock that has run out, or failures older than the lock window, start fresh.
  const emailHash = subjectHashes[0];
  const stale = limiters.find((l) => l.subjectHash === emailHash && ((l.lockedUntil && l.lockedUntil <= now) || (!l.lockedUntil && now.getTime() - l.updatedAt.getTime() > ACCOUNT_LOCK_MS)));
  if (stale) {
    await db.authRateLimit.deleteMany({ where: { subjectHash: emailHash } });
    limiters = limiters.filter((l) => l.subjectHash !== emailHash);
  }
  const locked = limiters.filter((limiter) => limiter.lockedUntil && limiter.lockedUntil > now);
  if (locked.length) {
    await writeAudit({
      action: "auth.login.failed",
      targetId: null,
      success: false,
      ...input.metadata,
      metadata: { reason: locked.some((l) => l.subjectHash === emailHash) ? "account_locked" : "rate_limited" },
    });
    throw new AuthenticationFailure(locked.some((l) => l.subjectHash === emailHash) ? ACCOUNT_LOCKED_MESSAGE : "Invalid email, password, or authenticator code.");
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
  // The temporary password from "Forgot password" opens no session: it only sends the person to the page that makes them choose a new one.
  if (user && !passwordMatches && user.status === UserStatus.ACTIVE && await currentTemporaryPassword(user.id, input.password, now)) throw new PasswordChangeRequired();
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
    // Deleting an account only marks it (its history and the work it created stay linked), so the email is still taken.
    // Creating the same email again starts it over: every old credential, sign-in and access setting is wiped first.
    if (existing?.status === UserStatus.DELETED) {
      await tx.authSession.deleteMany({ where: { userId: existing.id } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      await tx.recoveryCode.deleteMany({ where: { userId: existing.id } });
      await tx.staffPermissionGrant.deleteMany({ where: { userId: existing.id } });
      await tx.authToken.updateMany({ where: { userId: existing.id, completedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.user.update({
        where: { id: existing.id },
        data: { status: UserStatus.PENDING_SETUP, role: input.role, passwordHash: null, totpSecretEncrypted: null, totpEnabledAt: null, lastTotpStep: BigInt(-1), suspendedFrom: null, suspendedUntil: null, suspensionReason: null, customAccess: false, customAccessUntil: null },
      });
      existing.status = UserStatus.PENDING_SETUP;
      existing.role = input.role;
    }
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
    // A new password also unlocks the account.
    await tx.authRateLimit.deleteMany({ where: { subjectHash: hashRateLimitSubject(`email:${normalizedEmail(row.email)}`, getAuthEnv().AUTH_SESSION_SECRET) } });
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
