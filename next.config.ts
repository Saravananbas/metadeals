import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the dev watcher scoped to this app instead of inferring a drive-wide root.
  turbopack: { root: process.cwd() },
  // Images shipped with the deploy (seed-media/) must be traced into the server output.
  outputFileTracingIncludes: { "/api/v1/media/\\[id\\]": ["./seed-media/**/*"] },
  serverExternalPackages: ["pino", "pg", "bullmq", "ioredis", "mariadb"],
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }] : []),
      ],
    }];
  },
};
export default nextConfig;
