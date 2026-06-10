import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOperatorIntentTranslation,
  validateOperatorIntentTranslation
} from "../src/index.js";

test("builds file/resource source-continuity acceptance operator intent translation", () => {
  const translation = buildOperatorIntentTranslation({
    operatorText: "accept this lifted file's source continuity into my local layer",
    targetLayerRef: "layer:operator-local",
    targetContextRef: "context:file-resource-lift:operator-local",
    sourceResourceRefs: ["studio-file-resource-lift-source-candidate:test"],
    sourceEvidenceRefs: [
      "bytes-studio-file-resource-lift-visibility-evidence:test",
      "edge-file-resource-source-continuity-acceptance-remaining-blockers-visibility:test"
    ],
    translatedAt: "2026-06-10T08:00:00.000Z"
  });

  assert.equal(translation.artifactKind, "operator_intent_translation");
  assert.equal(translation.schemaVersion, "operator_intent_translation.v0");
  assert.equal(translation.proofRung, "candidate_grammar");
  assert.equal(translation.candidate.requestedVerb, "accept_file_resource_source_continuity");
  assert.equal(translation.candidate.targetLayerRef, "layer:operator-local");
  assert.equal(translation.candidate.requiresOperatorConfirmation, true);
  assert.equal(translation.candidate.requiresRbcAdmissibility, true);
  assert.equal(translation.candidate.requiresLayerAppend, true);
  assert.equal(translation.candidate.clarificationNeeded, false);
  assert.equal(translation.nonClaims.approval, false);
  assert.equal(translation.nonClaims.execution, false);
  assert.equal(translation.nonClaims.admission, false);
  assert.equal(translation.nonClaims.layerAppend, false);
  assert.equal(translation.nonClaims.rbcDecision, false);
  assert.equal(translation.nonClaims.canonicalTruth, false);
  assert.equal(translation.nonClaims.authority, false);

  validateOperatorIntentTranslation(translation);
});

test("operator intent translation preserves clarification when target context is incomplete", () => {
  const translation = buildOperatorIntentTranslation({
    operatorText: "accept this file",
    targetLayerRef: "layer:operator-local",
    targetContextRef: "context:file-resource-lift:operator-local",
    sourceResourceRefs: ["studio-file-resource-lift-source-candidate:test"],
    sourceEvidenceRefs: ["bytes-studio-file-resource-lift-visibility-evidence:test"],
    ambiguityRefs: ["ambiguous:operator-said-this-file"],
    confidence: 0.58
  });

  assert.equal(translation.candidate.clarificationNeeded, true);
  assert.deepEqual(translation.candidate.ambiguityRefs, ["ambiguous:operator-said-this-file"]);
});

test("operator intent translation rejects authority and action overclaims", () => {
  const translation = buildOperatorIntentTranslation({
    operatorText: "accept this lifted file's source continuity into my local layer",
    sourceResourceRefs: ["studio-file-resource-lift-source-candidate:test"],
    sourceEvidenceRefs: ["bytes-studio-file-resource-lift-visibility-evidence:test"]
  });

  assert.throws(() => validateOperatorIntentTranslation({
    ...translation,
    nonClaims: {
      ...translation.nonClaims,
      authority: true
    }
  }), /authority/);

  assert.throws(() => validateOperatorIntentTranslation({
    ...translation,
    candidate: {
      ...translation.candidate,
      requiresOperatorConfirmation: false
    }
  }), /operator confirmation/);
});
