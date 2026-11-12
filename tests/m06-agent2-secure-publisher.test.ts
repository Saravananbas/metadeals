import test from "node:test";
import assert from "node:assert/strict";
import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";

test("Agent 2 unconditionally rejects publishing attempts from Agent 3 (Shadow Isolation)", async () => {
  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "shadow-candidate-id-99",
    authorizationToken: "fake-token",
    callerAgent: "AGENT_3",
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /AGENT_3_SHADOW_RESTRICTION/);
});

test("Agent 2 respects emergency global publishing kill-switch", async () => {
  Agent2PublishingEngine.setKillSwitch(true);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), true);

  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "valid-candidate-1",
    authorizationToken: "valid-token-1",
    callerAgent: "AGENT_1",
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /KILL_SWITCH_ACTIVE/);

  // Restore kill-switch
  Agent2PublishingEngine.setKillSwitch(false);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), false);
});

test("Agent 2 rejects publishing when no persistent authorization exists", async () => {
  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "unauthorized-candidate-999",
    authorizationToken: "random-token",
    callerAgent: "AGENT_1",
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /AUTHORIZATION_NOT_FOUND|connect EACCES/);
});

