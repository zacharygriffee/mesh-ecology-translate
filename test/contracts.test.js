import test from "node:test";
import assert from "node:assert/strict";

import {
  validateTranslationRequest,
  validateTranslationResult
} from "../src/contracts/index.js";

function createRequest(overrides = {}) {
  return {
    inputs: [{ type: "text", content: "open the habitat report" }],
    profile: "command",
    providerPreference: "local_preferred",
    securityPosture: "standard",
    ...overrides
  };
}

function createResult(overrides = {}) {
  return {
    grammarCandidate: {
      version: "v1",
      profile: "command",
      sourceText: "open the habitat report",
      interpretation: "Open the habitat report.",
      template: "command",
      continuity: null,
      metadata: {}
    },
    confidence: 0.72,
    ambiguities: [],
    needsClarification: false,
    providerInfo: {
      provider: "ollama",
      model: "llama3.2:3b",
      latency: 12
    },
    ...overrides
  };
}

test("validateTranslationRequest accepts a valid request", () => {
  assert.doesNotThrow(() => validateTranslationRequest(createRequest()));
});

test("validateTranslationRequest rejects non-text inputs", () => {
  assert.throws(
    () =>
      validateTranslationRequest(
        createRequest({
          inputs: [{ type: "image", content: "not allowed yet" }]
        })
      ),
    /type must be one of/
  );
});

test("validateTranslationRequest requires a provider for specific preference", () => {
  assert.throws(
    () =>
      validateTranslationRequest(
        createRequest({
          providerPreference: "specific",
          provider: ""
        })
      ),
    /provider is required/
  );
});

test("validateTranslationResult accepts a valid result", () => {
  assert.doesNotThrow(() => validateTranslationResult(createResult()));
});

test("validateTranslationResult rejects out-of-range confidence", () => {
  assert.throws(
    () => validateTranslationResult(createResult({ confidence: 1.5 })),
    /must be a number between 0 and 1/
  );
});
