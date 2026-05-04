import test from "node:test";
import assert from "node:assert/strict";

import {
  TRANSLATION_CONTEXT_FIELDS,
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

test("validateTranslationRequest accepts timeoutMs and AbortSignal-like input", () => {
  const controller = new AbortController();

  assert.doesNotThrow(() =>
    validateTranslationRequest(
      createRequest({
        timeoutMs: 1500,
        signal: controller.signal
      })
    )
  );
});

test("validateTranslationRequest accepts explicit Edge context vocabulary", () => {
  assert.deepEqual(TRANSLATION_CONTEXT_FIELDS, [
    "operatorFocus",
    "activeReferents",
    "portalVisibility",
    "exportVisibility",
    "continuitySummaries",
    "ambiguityMarkers",
    "reasonReferences",
    "evidenceReferences"
  ]);

  assert.doesNotThrow(() =>
    validateTranslationRequest(
      createRequest({
        context: {
          operatorFocus: "habitat report",
          activeReferents: [{ id: "report-7", label: "Habitat Report" }],
          portalVisibility: { visible: ["habitat-report"] },
          exportVisibility: { allowed: false },
          continuitySummaries: ["The operator was reviewing wetlands notes."],
          ambiguityMarkers: ["report could refer to draft or final"],
          reasonReferences: ["operator-request"],
          evidenceReferences: [{ id: "evidence-1", kind: "document" }]
        }
      })
    )
  );
});

test("validateTranslationRequest rejects unsupported context fields", () => {
  assert.throws(
    () =>
      validateTranslationRequest(
        createRequest({
          context: {
            toolPlan: ["open", "execute"]
          }
        })
      ),
    /context\.toolPlan is not supported/
  );
});

test("validateTranslationRequest rejects non-serializable context values", () => {
  assert.throws(
    () =>
      validateTranslationRequest(
        createRequest({
          context: {
            operatorFocus: () => "hidden"
          }
        })
      ),
    /JSON-compatible values/
  );
});

test("validateTranslationRequest rejects invalid timeoutMs", () => {
  assert.throws(
    () =>
      validateTranslationRequest(
        createRequest({
          timeoutMs: 0
        })
      ),
    /timeoutMs must be a positive number/
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
