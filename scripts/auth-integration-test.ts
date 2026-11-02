import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { AuthTokenPurpose, UserRole, UserStatus } from "../src/generated/prisma/client";
import { getDatabaseEnv } from "../src/config/env";
import { createOpaqueToken, hashOpaqueToken, verifyPassword } from "../src/server/auth/crypto";
import {
  AuthenticationFailure,
  authenticate,
  beginSetup,
  completePasswordReset,
  completeSetup,
  createManualPasswordReset,
} from "../src/server/auth/service";
import { disconnectDatabase, getDatabase } from "../src/server/db/client";

async function runIntegration() {
  if (process.env.AUTH_INTEGRATION_TESTS !== "1") {
    throw new Error("Set AUTH_INTEGRATION_TESTS=1 to run this local database integration check.");
  }
  if (process.env.NODE_ENV === "production") throw new Error("Auth integration check cannot run in production.");

  process.env.NEXTAUTH_SECRET = randomBytes(32).toString("hex");
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.AUTH_TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.NEXTAUTH_URL = "http://localhost:4123";
  process.env.AUTH_BOOTSTRAP_EMAIL = "saran.be.2005@gmail.com";
  process.env.AUTH_BOOTSTRAP_ENABLED = "false";

  const databaseUrl = new URL(getDatabaseEnv().DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) || databaseUrl.port !== "55432") {
    throw new Error("Auth integration check is restricted to the project's local PostgreSQL port 55432.");
  }

  const db = getDatabase();
  const email = `m25-test-${randomUUID()}@invalid.example`;
  const password = "integration-only-long-password-value";
  const newPassword = "integration-only-new-long-password";
  const requestId = `m25-test-${randomUUID()}`;
  const metadata = {
    ipHash: createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update("127.0.0.1").digest("hex"),
    userAgent: "M2.5 integration test",
    requestId,
  };
  let userId: string | null = null;

  try {
    const user = await db.user.create({
      data: { email, role: UserRole.ADMIN, status: UserStatus.PENDING_SETUP },
      select: { id: true },
    });
    userId = user.id;
    const setupToken = createOpaqueToken();
    await db.authToken.create({
      data: {
        tokenHash: hashOpaqueToken(setupToken, process.env.AUTH_SESSION_SECRET!),
        purpose: AuthTokenPurpose.ACCOUNT_SETUP,
        email,
        userId,
        role: UserRole.ADMIN,
        emailDeliveryVerified: true,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const enrollment = await beginSetup(setupToken, password);
    const now = Date.now();
    const totp = new OTPAuth.TOTP({
      issuer: "MetaDeals4U",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.secret),
    });
    const setupCode = totp.generate({ timestamp: now });
    const recoveryCodes = await completeSetup(setupToken, setupCode, metadata);
    assert.equal(recoveryCodes.length, 10);
    await assert.rejects(
      authenticate({ email, password, mfaCode: setupCode, metadata }),
      AuthenticationFailure,
    );

    const login = await authenticate({ email, password, mfaCode: recoveryCodes[0], metadata });
    assert.equal(login.userId, userId);
    const session = await db.authSession.findUnique({
      where: { tokenHash: hashOpaqueToken(login.token, process.env.AUTH_SESSION_SECRET!) },
    });
    assert.ok(session);
    assert.notEqual(session.tokenHash, login.token);
    assert.ok(await db.recoveryCode.findFirst({ where: { userId, usedAt: null } }));
    await assert.rejects(
      authenticate({ email, password, mfaCode: recoveryCodes[0], metadata }),
      AuthenticationFailure,
    );

    const reset = await createManualPasswordReset(email);
    assert.equal(reset.userId, userId);
    await completePasswordReset(reset.token, newPassword, metadata);
    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    assert.ok(updatedUser.passwordHash);
    assert.equal(await verifyPassword(updatedUser.passwordHash, newPassword), true);
    assert.equal(await db.authSession.count({ where: { userId } }), 0);
    await assert.rejects(
      completePasswordReset(reset.token, "another-long-password-value", metadata),
      AuthenticationFailure,
    );
    console.log("Auth database integration passed: setup/MFA, one-time recovery login, hashed session, verified-email reset and session revocation.");
  } finally {
    const rateHashes = ["email:", "network:", "pair:"].map((prefix) => {
      const subject = prefix === "network:"
        ? `network:${metadata.ipHash}`
        : prefix === "pair:"
          ? `pair:${email}\0${metadata.ipHash}`
          : `email:${email}`;
      return createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(subject).digest("hex");
    });
    await db.authRateLimit.deleteMany({ where: { subjectHash: { in: rateHashes } } });
    await db.auditEvent.deleteMany({
      where: { OR: [{ requestId }, ...(userId ? [{ targetId: userId }] : [])] },
    });
    await db.authToken.deleteMany({ where: { email } });
    await db.user.deleteMany({ where: { email } });
    await disconnectDatabase();
  }
}

void runIntegration().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Auth integration check failed.");
  process.exitCode = 1;
});
