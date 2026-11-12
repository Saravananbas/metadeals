import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { getDatabase } from "../src/server/db/client";

async function runCrossProcessConcurrencyTest() {
  console.log("=== Starting M12.1 True Cross-Process Publishing Concurrency Verification ===");
  const db = getDatabase();
  const timestamp = Date.now();
  const candidateId = `cand_crossproc_${timestamp}`;
  const token = `token_crossproc_${timestamp}`;
  const externalId = `EXT_${timestamp}`;

  // 1. Seed candidate and authorization in APPROVED status
  await db.dealCandidate.create({
    data: {
      id: candidateId,
      sourcePlatform: "amazon",
      sourceUrl: `https://amazon.in/dp/B0TEST_CROSSPROC_${timestamp}`,
      externalId,
      rawTitle: "Cross Process Concurrency Test Product",
      categorySlug: "electronics",
      observedPriceMinor: 69900,
      observedMrpMinor: 149900,
      discountPercent: 53,
      confidenceScore: 98,
      status: "VERIFIED",
    },
  });

  const auth = await db.publicationAuthorization.create({
    data: {
      candidateId,
      approvalToken: token,
      status: "APPROVED",
      confidenceScore: 0.98,
      attractivenessScore: 0.95,
      expiresAt: new Date(Date.now() + 600000),
    },
  });

  console.log(`[Setup] Created candidate ${candidateId} and authorization ${auth.id} (Status: APPROVED)`);

  // 2. Launch two genuinely separate OS Node.js processes simultaneously
  const runWorker = (workerName: string): Promise<{ worker: string; code: number; stdout: string; stderr: string; parsed?: any }> => {
    return new Promise((resolve) => {
      const proc = spawn(
        process.execPath,
        [
          "--env-file=.env",
          "--conditions=react-server",
          "--import",
          "./node_modules/tsx/dist/loader.mjs",
          "scripts/cross-process-worker.ts",
          candidateId,
          token,
          workerName,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        let parsed: any = null;
        try {
          const lines = stdout.trim().split("\n");
          for (const line of lines) {
            if (line.includes(`"worker":"${workerName}"`)) {
              parsed = JSON.parse(line);
              break;
            }
          }
        } catch {}
        resolve({ worker: workerName, code: code ?? -1, stdout, stderr, parsed });
      });
    });
  };

  console.log("[Execution] Spawning Worker-Alpha and Worker-Beta simultaneously in separate OS processes...");
  const [proc1, proc2] = await Promise.all([
    runWorker("Worker-Alpha"),
    runWorker("Worker-Beta"),
  ]);

  console.log(`[Results] Worker-Alpha exit code: ${proc1.code}, result: ${JSON.stringify(proc1.parsed)}`);
  console.log(`[Results] Worker-Beta  exit code: ${proc2.code}, result: ${JSON.stringify(proc2.parsed)}`);

  // 3. Evaluate results
  const results = [proc1, proc2];
  const successes = results.filter((r) => r.code === 0 && r.parsed?.result?.published === true);
  const rejections = results.filter((r) => r.code === 2 && r.parsed?.result?.published === false);

  assert.equal(successes.length, 1, "Exactly one process must claim and publish the authorization");
  assert.equal(rejections.length, 1, "The competing process must be rejected");
  assert.match(rejections[0].parsed?.result?.error || "", /INVALID_AUTH_STATUS/);

  // 4. Verify Database Integrity
  const finalAuth = await db.publicationAuthorization.findUnique({
    where: { id: auth.id },
  });
  console.log(`[Verification] Final Authorization Status in DB: ${finalAuth?.status}`);
  assert.equal(finalAuth?.status, "PUBLISHED");

  const matchingDeals = await db.deal.findMany({
    where: {
      candidates: {
        some: { id: candidateId },
      },
    },
  });
  console.log(`[Verification] Deals created for candidate: ${matchingDeals.length}`);
  assert.equal(matchingDeals.length, 1, "Exactly one canonical Deal record must exist");

  console.log("=== PASS: True Cross-Process Concurrency Verification Successful ===");
  process.exit(0);
}

runCrossProcessConcurrencyTest().catch((err) => {
  console.error("FATAL ERROR in cross-process test:", err);
  process.exit(1);
});
