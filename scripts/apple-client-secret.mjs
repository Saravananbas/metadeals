// Prints the "client secret" Sign in with Apple needs: an ES256 JWT signed with your .p8 key. Valid for at most 6 months, so re-run before it expires.
// Usage: node scripts/apple-client-secret.mjs <path-to-AuthKey.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const [keyPath, teamId, keyId, servicesId] = process.argv.slice(2);
if (!keyPath || !teamId || !keyId || !servicesId) {
  console.error("Usage: node scripts/apple-client-secret.mjs <AuthKey.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>");
  process.exit(1);
}
const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const body = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: teamId, iat: now, exp: now + 15_777_000, aud: "https://appleid.apple.com", sub: servicesId })}`;
const signature = sign("sha256", Buffer.from(body), { key: createPrivateKey(readFileSync(keyPath)), dsaEncoding: "ieee-p1363" });
console.log(`${body}.${signature.toString("base64url")}`);
