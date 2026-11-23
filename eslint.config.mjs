import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    rules: {
      // Reading the browser's own state once after the page loads (the sign-in notice, saved email, loading flags) is a normal pattern here.
      "react-hooks/set-state-in-effect": "off",
      // Member pictures, avatars and proxied images are served by our own image endpoints at known sizes; next/image would add nothing.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    ".local/**",
    "out/**",
    "src/generated/**",
    "next-env.d.ts",
    "scripts/**",
    "tests/**",
    "node-sec-extractor/**",
    ".agents/**",
    "mobile/**",
  ]),
]);
