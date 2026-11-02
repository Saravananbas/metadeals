import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getAuthEnv } from "../src/config/env";
import { disconnectDatabase } from "../src/server/db/client";
import { BOOTSTRAP_EMAIL_APPROVED, createBootstrapSetup } from "../src/server/auth/service";

const prompt = createInterface({ input: stdin, output: stdout });

async function main() {
  try {
    const env = getAuthEnv();
    if (!env.AUTH_BOOTSTRAP_ENABLED) {
      throw new Error("Bootstrap is disabled. Temporarily set AUTH_BOOTSTRAP_ENABLED=true in PowerShell, then rerun this command.");
    }

    const confirmation = await prompt.question(
      `Confirm access to ${BOOTSTRAP_EMAIL_APPROVED} by typing the address exactly: `,
    );
    if (confirmation.trim().toLowerCase() !== BOOTSTRAP_EMAIL_APPROVED) {
      throw new Error("Confirmation did not match the approved initial administrator address.");
    }

    const result = await createBootstrapSetup();
    const setupUrl = new URL("/admin/setup", env.NEXTAUTH_URL);
    setupUrl.searchParams.set("token", result.token);
    console.log("One-time super-admin setup link (expires in 30 minutes):");
    console.log(setupUrl.toString());
    console.log("Deliver this link only to the approved administrator through a private channel.");
    console.log("After setup is complete, set AUTH_BOOTSTRAP_ENABLED=false in .env.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Super-admin bootstrap failed.");
    process.exitCode = 1;
  } finally {
    prompt.close();
    await disconnectDatabase();
  }
}

void main();
