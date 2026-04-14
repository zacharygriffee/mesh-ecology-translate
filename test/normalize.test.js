import test from "node:test";
import assert from "node:assert/strict";

import { normalizeProviderText, stripReasoningTags } from "../src/normalize/index.js";

test("stripReasoningTags removes think blocks and keeps useful content", () => {
  const text = "<think>private reasoning</think>\nSummarize the habitat report.";
  assert.equal(stripReasoningTags(text), "Summarize the habitat report.");
});

test("normalizeProviderText preserves already-clean translation text", () => {
  assert.equal(
    normalizeProviderText("Summarize the habitat report for later review."),
    "Summarize the habitat report for later review."
  );
});
