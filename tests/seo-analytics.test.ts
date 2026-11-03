import test from "node:test";
import assert from "node:assert/strict";
import { buildRobotsConfig } from "../src/app/robots";

test("buildRobotsConfig keeps non-production environments completely disallow", () => {
  const devRobots = buildRobotsConfig({
    nodeEnv: "development",
    appEnv: "development",
  });

  assert.deepEqual(devRobots.rules, {
    userAgent: "*",
    disallow: "/",
  });
  assert.equal(devRobots.sitemap, undefined);
});

test("buildRobotsConfig enables indexing and sitemap only when explicitly in production", () => {
  const prodRobots = buildRobotsConfig({
    nodeEnv: "production",
    appEnv: "production",
    baseUrl: "https://metadeals4u.in",
  });

  assert.equal(prodRobots.rules && "allow" in prodRobots.rules && prodRobots.rules.allow, "/");
  assert.deepEqual(
    prodRobots.rules && "disallow" in prodRobots.rules ? prodRobots.rules.disallow : [],
    ["/admin/", "/api/", "/go/", "/account/"]
  );
  assert.equal(prodRobots.sitemap, "https://metadeals4u.in/sitemap.xml");
});
