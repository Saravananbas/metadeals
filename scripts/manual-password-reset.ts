import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getAuthEnv } from "../src/config/env";
import { disconnectDatabase } from "../src/server/db/client";
import { AuthenticationFailure, createManualPasswordReset } from "../src/server/auth/service";

const prompt = createInterface({ input: stdin, output: stdout });

async function main() {
  try {
    const env = getAuthEnv();
    const email = process.argv[2]?.trim().toLowerCase();
    if (!email) throw new Error("Usage: npm run auth:reset-link -- <verified-email>");
    const confirmation = await prompt.question(
      `Confirm a private delivery channel to ${email} by typing the address exactly: `,
    );
    if (confirmation.trim().toLowerCase() !== email) throw new Error("Confirmation did not match the requested address.");

    const result = await createManualPasswordReset(email);
    const resetUrl = new URL("/admin/password-reset/confirm", env.NEXTAUTH_URL);
    resetUrl.searchParams.set("token", result.token);
    console.log("One-time password-reset link (expires in 30 minutes):");
    console.log(resetUrl.toString());
    console.log("Deliver this link privately to the verified account holder; it is not emailed by this command.");
  } catch (error) {
    if (error instanceof AuthenticationFailure) console.error(error.message);
    else console.error(error instanceof Error ? error.message : "Manual password reset could not be issued.");
    process.exitCode = 1;
  } finally {
    prompt.close();
    await disconnectDatabase();
  }
}

void main();
