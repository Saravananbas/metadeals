import "server-only";
import type { NextAuthOptions } from "next-auth";
import { encode as defaultEncode } from "next-auth/jwt";
import type { Provider } from "next-auth/providers/index";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { hashOpaqueToken } from "@/server/auth/crypto";
import { verifiedProviderEmail } from "@/features/customer/validation";
import { CustomerError, loginCustomer } from "./service";
import { customerForProvider } from "./provider-login";
import { clientIpFromHeaders } from "@/server/client-ip";

export function customerProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: Boolean(process.env.NEXTAUTH_URL?.startsWith("https://") && process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  };
}
const REMEMBER_SECONDS = 30 * 86400;
export function getCustomerAuthOptions(): NextAuthOptions {
  const env = getAuthEnv(), enabled = customerProviders(), secure = env.NEXTAUTH_URL.startsWith("https://");
  const providers: Provider[] = [
    Credentials({
      name: "Email and password",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials, request) {
        try {
          const first = (name: string) => { const v = request?.headers?.[name]; return Array.isArray(v) ? v[0] : v ?? null; };
          return await loginCustomer(credentials, clientIpFromHeaders({ get: first }));
        } catch (error) {
          // A locked account is told so (the sign-in screen shows the lock message); every other failure stays a plain "no".
          if (error instanceof CustomerError && error.status === 423) throw new Error("AccountLocked");
          return null;
        }
      },
    }),
  ];
  if (enabled.google) {
    providers.push(Google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }));
  }
  if (enabled.apple) {
    providers.push(Apple({ clientId: process.env.APPLE_CLIENT_ID!, clientSecret: process.env.APPLE_CLIENT_SECRET!, checks: ["pkce", "state"] }));
  }
  const checkCookie = (suffix: string) => ({
    name: (secure ? "__Secure-" : "") + "md-customer-" + suffix,
    options: { httpOnly: true, sameSite: secure ? ("none" as const) : ("lax" as const), path: "/", secure, maxAge: 900 },
  });
  return {
    providers,
    secret: hashOpaqueToken("customer-nextauth", env.NEXTAUTH_SECRET),
    // "Remember me" keeps the sign-in for 30 days; without it the sign-in ends after 24 hours (the token itself carries that limit).
    session: { strategy: "jwt", maxAge: REMEMBER_SECONDS },
    jwt: { maxAge: REMEMBER_SECONDS, encode: (params) => defaultEncode({ ...params, maxAge: params.token?.remember ? REMEMBER_SECONDS : 86400 }) },
    pages: { signIn: "/account", error: "/account" },
    cookies: {
      sessionToken: { name: (secure ? "__Secure-" : "") + "md-customer-session", options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
      state: checkCookie("state"),
      pkceCodeVerifier: checkCookie("pkce"),
      nonce: checkCookie("nonce"),
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider === "credentials") return true;
        if (!account || !["google", "apple"].includes(account.provider) || !profile || !verifiedProviderEmail(profile)) {
          return false;
        }
        const email = user.email?.trim().toLowerCase();
        if (!email) return false;

        const profileFields = profile as unknown as Record<string, unknown>;
        const providerImage = [profileFields.picture, profileFields.avatar_url].find(
          (value): value is string => typeof value === "string" && value.length > 0
        );
        try {
          const customer = await customerForProvider({ provider: account.provider as "google" | "apple", subject: account.providerAccountId, email, name: user.name, image: user.image || providerImage });
          if (!customer) return false;
          user.id = customer.id;
          return true;
        } catch (err) {
          console.error("Sign in transaction error:", err instanceof Error ? err.name : "unknown");
          return false;
        }
      },
      async jwt({ token, user }) {
        if (user) {
          token.customerId = user.id;
          // Only password sign-ins carry the "remember me" choice; Google and Apple sign-ins keep the short 24 hour session.
          token.remember = (user as { remember?: boolean }).remember === true;
        }
        return token;
      },
      async session({ session, token }) {
        const customer =
          typeof token.customerId === "string"
            ? await getDatabase().customer.findUnique({
                where: { id: token.customerId },
                select: { id: true, name: true, email: true, image: true, disabledAt: true },
              })
            : null;
        session.user =
          customer && !customer.disabledAt
            ? { id: customer.id, name: customer.name, email: customer.email, image: customer.image }
            : undefined;
        return session;
      },
      async redirect({ url, baseUrl }) {
        const origin = new URL(baseUrl).origin;
        try {
          const dest = new URL(url, origin);
          return dest.origin === origin ? dest.href : origin + "/";
        } catch {
          return origin + "/";
        }
      },
    },
    logger: {
      error(code, metadata) {
        console.error("Customer authentication failed:", code, typeof metadata === "object" && metadata && "name" in metadata ? String((metadata as { name?: unknown }).name) : "");
      },
      warn() {},
      debug() {},
    },
  };
}
