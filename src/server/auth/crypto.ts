import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2, { type HashOptions } from "argon2";
import * as OTPAuth from "otpauth";

const passwordOptions: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordOptions);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash.startsWith("$argon2id$")) return false;
  return argon2.verify(hash, password);
}

export function validatePassword(password: string, email?: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (/[\u0000-\u001f\u007f]/.test(password)) return "Password contains unsupported characters.";
  if (/^(.)\1+$/.test(password)) return "Choose a less predictable password.";
  const normalized = password.toLowerCase();
  if (["password", "passwordpassword", "12345678", "correcthorsebatterystaple", "123456789012345", "qwertyuiopasdfgh"].includes(normalized)) {
    return "Choose a less common password.";
  }
  const localPart = email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && normalized.includes(localPart)) {
    return "Password must not contain your email name.";
  }
  return null;
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function hashRateLimitSubject(subject: string, pepper: string): string {
  return createHmac("sha256", pepper).update(subject).digest("hex");
}

export function createTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function createTotpUri(secret: string, email: string): string {
  return new OTPAuth.TOTP({
    issuer: "MetaDeals4U",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

export function verifyTotp(secret: string, token: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const totp = new OTPAuth.TOTP({
    issuer: "MetaDeals4U",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token, timestamp: now, window: 1 });
  return delta === null ? null : OTPAuth.TOTP.counter({ period: 30, timestamp: now }) + delta;
}

export function encryptTotpSecret(secret: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) throw new Error("AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptTotpSecret(value: string, encryptionKey: string): string {
  const [encodedIv, encodedTag, encodedData, extra] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedData || extra) throw new Error("Encrypted TOTP secret is malformed");
  const key = Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) throw new Error("AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedData, "base64url")), decipher.final()]).toString("utf8");
}

export function createRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15)}`;
  });
}

export function hashRecoveryCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(code.replaceAll("-", "").toUpperCase())
    .digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRequestDigest(value: string | null, pepper: string): string | null {
  if (!value) return null;
  return hashRateLimitSubject(value.slice(0, 512), pepper);
}
