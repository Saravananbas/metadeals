import assert from "node:assert/strict";
import { test } from "node:test";
import * as OTPAuth from "otpauth";
import {
  constantTimeEqual,
  createRecoveryCodes,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  hashOpaqueToken,
  hashRecoveryCode,
  validatePassword,
  verifyPassword,
  verifyTotp,
  hashPassword,
} from "../src/server/auth/crypto";
import { canAssignRole, canChangeRole, roleCan } from "../src/server/auth/permissions";
import {
  ABSOLUTE_SESSION_TIMEOUT_MS,
  getSessionExpiry,
  INACTIVITY_TIMEOUT_MS,
  isSessionExpired,
} from "../src/server/auth/session-policy";

test("password policy and Argon2id hashing reject weak or incorrect credentials", async () => {
  const password = "a-private-long-password-for-tests";
  assert.equal(validatePassword("short7"), "Use at least 8 characters.");
  assert.equal(validatePassword("Astrong8"), null);
  assert.equal(validatePassword("password"), "Choose a less common password.");
  assert.equal(validatePassword("12345678"), "Choose a less common password.");
  assert.notEqual(validatePassword("saran.be.2005-private-password", "saran.be.2005@gmail.com"), null);
  assert.equal(validatePassword(password), null);
  const hash = await hashPassword(password);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, password), true);
  assert.equal(await verifyPassword(hash, "incorrect-long-password"), false);
  assert.equal(await verifyPassword("legacy-hash", password), false);
});

test("TOTP validation returns the actual time-step for replay protection", () => {
  const secret = createTotpSecret();
  const now = 1_800_000_000_000;
  const totp = new OTPAuth.TOTP({
    issuer: "MetaDeals4U",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const counter = Math.floor(now / 30_000);
  assert.equal(verifyTotp(secret, totp.generate({ timestamp: now }), now), counter);
  assert.equal(verifyTotp(secret, totp.generate({ timestamp: now + 30_000 }), now), counter + 1);
  assert.equal(verifyTotp(secret, totp.generate({ timestamp: now + 60_000 }), now), null);
  assert.equal(verifyTotp(secret, "not-a-code", now), null);
});

test("TOTP secrets are authenticated-encrypted and recovery codes are one-time-ready", () => {
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret, encryptionKey);
  assert.equal(decryptTotpSecret(encrypted, encryptionKey), secret);
  assert.throws(() => decryptTotpSecret(`${encrypted.slice(0, -1)}x`, encryptionKey));

  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecoveryCode(codes[0], "pepper"), hashRecoveryCode(codes[0].toLowerCase().replaceAll("-", ""), "pepper"));
  assert.notEqual(hashRecoveryCode(codes[0], "pepper"), hashRecoveryCode(codes[0], "other-pepper"));
  assert.equal(constantTimeEqual("same", "same"), true);
  assert.equal(constantTimeEqual("same", "other"), false);
  assert.equal(hashOpaqueToken("token", "pepper"), hashOpaqueToken("token", "pepper"));
});

test("role permissions prevent lower-privilege account and security administration", () => {
  assert.equal(roleCan("SUPER_ADMIN", "security:manage"), true);
  assert.equal(roleCan("ADMIN", "security:manage"), false);
  assert.equal(roleCan("ADMIN", "account:create:editor"), true);
  assert.equal(roleCan("ADMIN", "account:create:admin"), false);
  assert.equal(roleCan("EDITOR", "account:read"), false);
  assert.equal(canAssignRole("ADMIN", "EDITOR"), true);
  assert.equal(canAssignRole("ADMIN", "ADMIN"), false);
  assert.equal(canChangeRole("SUPER_ADMIN", "other", "self"), true);
  assert.equal(canChangeRole("SUPER_ADMIN", "self", "self"), false);
});

test("database session policy applies one-hour inactivity and twelve-hour absolute limits", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const absolute = new Date(now.getTime() + ABSOLUTE_SESSION_TIMEOUT_MS);
  assert.equal(INACTIVITY_TIMEOUT_MS, 60 * 60 * 1000);
  assert.equal(ABSOLUTE_SESSION_TIMEOUT_MS, 12 * 60 * 60 * 1000);
  assert.equal(getSessionExpiry(now, absolute).getTime(), now.getTime() + INACTIVITY_TIMEOUT_MS);
  assert.equal(getSessionExpiry(new Date(absolute.getTime() - 10_000), absolute).getTime(), absolute.getTime());
  assert.equal(isSessionExpired(absolute, absolute, absolute), true);
  assert.equal(isSessionExpired(new Date(now.getTime() + 1_000), absolute, now), false);
});
