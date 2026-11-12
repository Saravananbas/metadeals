import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extractorHealthUrl = "http://127.0.0.1:8765/health";
const extractorEndpoint = "http://127.0.0.1:8765/extract";
const isWindows = process.platform === "win32";
const pythonCommand = process.env.PYTHON_EXECUTABLE || (isWindows ? "python" : "python3");
const pythonArgs = [path.join(repoRoot, "python-extractor", "app.py")];
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");

const childEnvironment = {
  ...process.env,
  EXTRACTOR_HOST: "127.0.0.1",
  EXTRACTOR_PORT: "8765",
  PYTHON_PRODUCT_EXTRACTOR_URL: extractorEndpoint,
};

if (isWindows && !childEnvironment.PLAYWRIGHT_BROWSERS_PATH) {
  const installedBrowsers = path.join(homedir(), "AppData", "Local", "ms-playwright");
  if (existsSync(installedBrowsers)) {
    childEnvironment.PLAYWRIGHT_BROWSERS_PATH = installedBrowsers;
  }
}

async function findExistingExtractor() {
  try {
    const response = await fetch(extractorHealthUrl, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.engine === "universal_product_extractor";
  } catch {
    return false;
  }
}

async function waitForExtractor(child) {
  const deadline = Date.now() + 45_000;
  let lastError = "health check did not respond";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Python extractor exited with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(extractorHealthUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const body = await response.json();
        if (body?.engine === "universal_product_extractor") return;
        lastError = "health endpoint returned an unexpected service";
      } else {
        lastError = `health endpoint returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "health check failed";
    }

    await delay(500);
  }

  throw new Error(`Python extractor did not become ready: ${lastError}.`);
}

async function main() {
  let extractor;
  let next;

  const stop = () => {
    if (next && next.exitCode === null) next.kill("SIGTERM");
    if (extractor && extractor.exitCode === null) extractor.kill("SIGTERM");
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    if (await findExistingExtractor()) {
      console.log("Using the healthy local MetaDeals Python extractor on 127.0.0.1:8765.");
    } else {
      console.log("Starting the in-repository Python product extractor...");
      extractor = spawn(pythonCommand, pythonArgs, {
        cwd: repoRoot,
        env: childEnvironment,
        stdio: "inherit",
        windowsHide: true,
      });
      extractor.once("error", (error) => {
        console.error(`Could not start Python extractor: ${error.message}`);
        process.exitCode = 1;
        stop();
      });
      extractor.once("exit", (code) => {
        if (next && next.exitCode === null) {
          console.error(`Python extractor stopped${code === null ? "" : ` (exit ${code})`}.`);
          process.exitCode = code || 1;
          next.kill("SIGTERM");
        }
      });
      await waitForExtractor(extractor);
      console.log("Python extractor ready at 127.0.0.1:8765.");
    }

    if (!existsSync(nextCli)) {
      throw new Error("Next.js is not installed. Run npm ci, then retry.");
    }

    console.log("Starting MetaDeals on http://localhost:4123...");
    next = spawn(process.execPath, [nextCli, "dev", "--webpack", "--port", "4123"], {
      cwd: repoRoot,
      env: childEnvironment,
      stdio: "inherit",
      windowsHide: true,
    });

    const exitCode = await new Promise((resolve, reject) => {
      next.once("error", reject);
      next.once("exit", (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } finally {
    stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MetaDeals development startup failed.");
  process.exitCode = 1;
});
