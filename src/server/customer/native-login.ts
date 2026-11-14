import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from "jose";
import { verifiedProviderEmail } from "@/features/customer/validation";
import { CustomerError, limitCustomerRequests } from "./service";
import { customerForProvider } from "./provider-login";
import { issueAppToken } from "./app-tokens";

/**
 * Google and Apple sign-in for the native apps. The app signs in with the provider's own SDK and sends us the provider's ID token;
 * we check its signature against the provider's published keys, issuer, audience (our app's client ids), expiry and, for Apple, the nonce,
 * and require a provider-verified email. Then the same account rules as the website apply. No website login runs inside a WebView.
 * Client ids come from GOOGLE_NATIVE_CLIENT_IDS / APPLE_NATIVE_CLIENT_IDS (comma separated: web, Android, iOS ids / the iOS bundle id).
 */
type Provider = "google" | "apple";
const ISSUERS: Record<Provider, string[]> = { google: ["https://accounts.google.com", "accounts.google.com"], apple: ["https://appleid.apple.com"] };
const JWKS_URL: Record<Provider, string> = { google: "https://www.googleapis.com/oauth2/v3/certs", apple: "https://appleid.apple.com/keys" };
const ENV: Record<Provider, string> = { google: "GOOGLE_NATIVE_CLIENT_IDS", apple: "APPLE_NATIVE_CLIENT_IDS" };

const remote: Partial<Record<Provider, JWTVerifyGetKey>> = {};
let testKey: KeyLike | Uint8Array | null = null;
/** Tests only: verify against a local key instead of the provider's published keys. */
export const useTestKeyForProviderTokens = (key: KeyLike | Uint8Array | null) => { testKey = key; };
const audiences = (p: Provider) => (process.env[ENV[p]] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
export const nativeProviderConfigured = (p: Provider) => audiences(p).length > 0;

export async function verifyProviderIdToken(provider: Provider, idToken: string, nonce?: string) {
  const aud = audiences(provider);
  if (!aud.length) throw new CustomerError(`${provider === "google" ? "Google" : "Apple"} sign-in is not set up for the app yet.`, 503);
  const refuse = () => new CustomerError("The sign-in could not be verified.", 401);
  if (!idToken || idToken.length > 4096) throw refuse();
  try {
    const options = { issuer: ISSUERS[provider], audience: aud, algorithms: ["RS256", "ES256"], clockTolerance: 30 };
    const { payload } = testKey
      ? await jwtVerify(idToken, testKey, options)
      : await jwtVerify(idToken, (remote[provider] ??= createRemoteJWKSet(new URL(JWKS_URL[provider]), { cooldownDuration: 30_000 })), options);
    if (typeof payload.sub !== "string" || !payload.sub) throw refuse();
    if (!verifiedProviderEmail(payload as { email?: unknown; email_verified?: unknown })) throw new CustomerError("Your email address is not verified with the provider.", 403);
    if (provider === "apple") {
      // The app generates a random nonce, gives Apple its SHA-256, and sends us the original: the token must carry that hash (or the value itself).
      const claim = typeof payload.nonce === "string" ? payload.nonce : "";
      const hashed = nonce ? createHash("sha256").update(nonce).digest("hex") : "";
      if (!nonce || (claim !== nonce && claim !== hashed)) throw refuse();
    }
    return { subject: payload.sub, email: String(payload.email), name: typeof payload.name === "string" ? payload.name : null, image: typeof payload.picture === "string" ? payload.picture : null };
  } catch (error) {
    if (error instanceof CustomerError) throw error;
    throw refuse(); // bad signature, wrong audience, expired, malformed: all the same answer
  }
}

export async function nativeProviderLogin(provider: Provider, body: { idToken?: unknown; nonce?: unknown; device?: unknown; name?: unknown }, address: string | null) {
  await limitCustomerRequests(`native-${provider}:${address ?? "unknown"}`, 30, 900);
  const verified = await verifyProviderIdToken(provider, String(body.idToken ?? ""), typeof body.nonce === "string" ? body.nonce : undefined);
  // Apple sends the person's name only the first time, outside the token, and only to the app.
  const name = verified.name ?? (typeof body.name === "string" ? body.name.slice(0, 80) : null);
  const customer = await customerForProvider({ provider, subject: verified.subject, email: verified.email, name, image: verified.image });
  if (!customer) throw new CustomerError("This account cannot sign in.", 403);
  return { ...(await issueAppToken(customer.id, typeof body.device === "string" ? body.device : null)), customer: { id: customer.id, name: customer.name } };
}
