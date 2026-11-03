import test from "node:test";
import assert from "node:assert/strict";
import { sharedDesignTokens } from "../src/features/shared/tokens";

test("sharedDesignTokens provides portable design system for iOS and Android", () => {
  assert.ok(sharedDesignTokens.colors.primary.startsWith("var(--md-"));
  assert.ok(sharedDesignTokens.colors.accent.startsWith("var(--md-"));
  assert.equal(typeof sharedDesignTokens.typography.sizes.base, "number");
  assert.equal(typeof sharedDesignTokens.spacing.md, "number");
  assert.equal(typeof sharedDesignTokens.radii.lg, "number");
});
