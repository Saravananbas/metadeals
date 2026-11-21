import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Content Security Policy. CSP_MODE=enforce blocks anything outside the list; any other value (default) only REPORTS what would be blocked, in the browser console.
// Inline scripts stay allowed because Next.js needs them for its page bootstrap; moving to nonces is a later step.
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
// CSP_MODE comes from the environment, or from a one-line `csp-mode.txt` next to this file (the staging package writes it, because upload tools skip env files).
const cspMode = () => process.env.CSP_MODE ?? (existsSync("csp-mode.txt") ? readFileSync("csp-mode.txt", "utf8").trim() : "");
function cspHeaders() {
  // No upgrade-insecure-requests: HSTS already forces https in production, and the directive breaks plain-http local runs.
  const policy = CSP_POLICY;
  if (cspMode() === "enforce") return [{ key: "Content-Security-Policy", value: policy }];
  return [
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    { key: "Content-Security-Policy-Report-Only", value: policy },
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Only for a second local test server (own build folder); unset everywhere else.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The Hostinger build server reports 64 CPUs but allows few threads; fewer build workers avoids "can't spawn worker thread".
  // strict: a page loads only the CSS of the modules it imports (the default merges CSS across routes, so the homepage was loading community and profile styles).
  experimental: { cpus: 2, cssChunking: "strict", inlineCss: true },
  reactStrictMode: true,
  // The hero pictures never change under the same name, so the optimiser keeps its WebP copies for a week instead of the default 4 hours (less CPU on the host, faster repeat views).
  images: { minimumCacheTTL: 604800 },
  // Keep the dev watcher scoped to this app instead of inferring a drive-wide root.
  turbopack: { root: process.cwd() },
  // Images shipped with the deploy (seed-media/) must be traced into the server output.
  outputFileTracingIncludes: { "/api/v1/media/\\[id\\]": ["./seed-media/**/*"] },
  serverExternalPackages: ["pino", "pg", "bullmq", "ioredis", "mariadb"],
  async rewrites() {
    return [{ source: "/@:handle", destination: "/community/u/:handle" }];
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ...cspHeaders(),
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }] : []),
      ],
    }];
  },
};
export default nextConfig;
