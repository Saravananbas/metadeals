import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const envPath = new URL("../.env", import.meta.url);
const generateLocalEnvironment = () => template
  .replaceAll("REPLACE_LOCAL_PASSWORD", randomBytes(24).toString("hex"))
  .replaceAll("REPLACE_LOCAL_REDIS_PASSWORD", randomBytes(24).toString("hex"))
  .replaceAll("REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS", randomBytes(32).toString("hex"))
  .replaceAll("REPLACE_WITH_INDEPENDENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS", randomBytes(32).toString("hex"))
  .replaceAll("REPLACE_WITH_BASE64_32_BYTE_KEY", randomBytes(32).toString("base64"));

const authVariables = new Map([
  ["AUTH_SESSION_SECRET", () => randomBytes(32).toString("hex")],
  ["AUTH_TOTP_ENCRYPTION_KEY", () => randomBytes(32).toString("base64")],
  ["AUTH_BOOTSTRAP_EMAIL", () => template.match(/^AUTH_BOOTSTRAP_EMAIL=(.*)$/m)?.[1] ?? ""],
  ["AUTH_BOOTSTRAP_ENABLED", () => "false"],
]);

function findDefinedVariables(contents) {
  return new Set(
    [...contents.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
      .map((match) => match[1]),
  );
}

try {
  await writeFile(envPath, generateLocalEnvironment(), { flag: "wx", mode: 0o600 });
  console.log("Created .env with random local-only secrets. No external credentials were created.");
} catch (error) {
  if (error.code !== "EEXIST") {
    throw error;
  }

  const existing = await readFile(envPath, "utf8");
  const defined = findDefinedVariables(existing);
  const missingAuthVariables = [...authVariables]
    .filter(([name]) => !defined.has(name))
    .map(([name, makeValue]) => `${name}=${makeValue()}`);
  const staleDefaultUrl = /^NEXTAUTH_URL=http:\/\/localhost:(?:3000|4000)$/m;
  const updatedEnvironment = existing.replace(staleDefaultUrl, "NEXTAUTH_URL=http://localhost:4123");
  const updatedDefaultUrl = updatedEnvironment !== existing;

  if (missingAuthVariables.length === 0 && !updatedDefaultUrl) {
    console.log(".env already has the required authentication settings; left unchanged.");
  } else {
    const newline = updatedEnvironment.includes("\r\n") ? "\r\n" : "\n";
    const separator = updatedEnvironment.length === 0 || updatedEnvironment.endsWith("\n") ? "" : newline;
    const addition = [
      "# Local M2.5 authentication settings; generated only when missing.",
      ...missingAuthVariables,
    ].join(newline);
    await writeFile(envPath, `${updatedEnvironment}${separator}${addition}${missingAuthVariables.length ? newline : ""}`);
    const changes = [];
    if (missingAuthVariables.length) {
      changes.push(`added missing local authentication settings: ${missingAuthVariables.map((line) => line.split("=")[0]).join(", ")}`);
    }
    if (updatedDefaultUrl) {
      changes.push("updated the default localhost NEXTAUTH_URL to this project's port 4123");
    }
    console.log(`Updated .env; existing secrets were preserved (${changes.join("; ")}).`);
  }
}
