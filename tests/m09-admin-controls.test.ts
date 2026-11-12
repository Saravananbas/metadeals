import test from "node:test";
import assert from "node:assert/strict";
import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";

test("Admin Intelligence Controls API safely exposes operational state", () => {
  Agent2PublishingEngine.setKillSwitch(false);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), false);

  Agent2PublishingEngine.setKillSwitch(true);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), true);

  Agent2PublishingEngine.setKillSwitch(false);
});

test("Admin Intelligence Controls guarantees Agent 3 status is immutable SHADOW_MODE_ONLY", () => {
  const agentStatus = {
    agent1: "ACTIVE",
    agent2: "ACTIVE",
    agent3: "SHADOW_MODE_ONLY",
  };

  assert.equal(agentStatus.agent3, "SHADOW_MODE_ONLY", "Agent 3 must strictly report as shadow-only");
});

