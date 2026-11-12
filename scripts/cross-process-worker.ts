import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";

const candidateId = process.argv[2];
const token = process.argv[3];
const workerName = process.argv[4];

async function main() {
  if (!candidateId || !token || !workerName) {
    console.error("Missing arguments");
    process.exit(1);
  }

  try {
    const res = await Agent2PublishingEngine.publishCandidate({
      candidateId,
      authorizationToken: token,
      callerIdentity: { role: "ADMIN", userId: workerName },
    });
    console.log(JSON.stringify({ worker: workerName, result: res }));
    process.exit(res.published ? 0 : 2);
  } catch (err: any) {
    console.error(JSON.stringify({ worker: workerName, error: err.message }));
    process.exit(3);
  }
}

main();
