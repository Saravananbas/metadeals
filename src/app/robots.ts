import type { MetadataRoute } from "next";

export interface RobotsEnv {
  nodeEnv?: string;
  appEnv?: string;
  publicAppEnv?: string;
  baseUrl?: string;
}

export function isProductionIndexingEnabled(env: RobotsEnv = {}) {
  return (
    env.nodeEnv === "production" &&
    (env.appEnv === "production" || env.publicAppEnv === "production")
  );
}

export function buildRobotsConfig(env: RobotsEnv = {}): MetadataRoute.Robots {
  const isProduction = isProductionIndexingEnabled(env);

  const baseUrl = env.baseUrl || "https://metadeals4u.in";

  if (!isProduction) {
    // Keep staging, preview and development completely unindexed
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/go/", "/account/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobotsConfig({
    nodeEnv: process.env.NODE_ENV,
    appEnv: process.env.APP_ENV,
    publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}
