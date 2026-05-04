import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EDGE_IMPORT_CLASSIFICATION,
  EDGE_PHASE_174_STATIC_FIXTURE_PATH,
  PROJECT_REVIEW_STATUSES,
  REQUIRED_NON_CLAIM_FLAGS,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION,
  createProjectReviewEvidenceFromFixture
} from "../src/review-evidence/index.js";

const REVIEWED_AT = "2026-05-04T12:00:00.000Z";

function loadFixtureText() {
  return readFileSync(new URL("./fixtures/edge-phase-174/project-docs-review.bounded-project-handoff.json", import.meta.url), "utf8");
}

function loadFixture() {
  return JSON.parse(loadFixtureText());
}

function createEvidence(fixture, options = {}) {
  return createProjectReviewEvidenceFromFixture(fixture, {
    fixturePath: EDGE_PHASE_174_STATIC_FIXTURE_PATH,
    reviewedAt: REVIEWED_AT,
    ...options
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("valid static fixture emits review_evidence_emitted", () => {
  const evidence = createEvidence(loadFixture());

  assert.equal(evidence.artifactKind, TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND);
  assert.equal(evidence.schema, TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA);
  assert.equal(evidence.schemaVersion, TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.reviewStatus, "review_evidence_emitted");
  assert.equal(evidence.reviewedAt, REVIEWED_AT);
  assert.equal(evidence.sourceFixture.fixturePath, EDGE_PHASE_174_STATIC_FIXTURE_PATH);
  assert.equal(evidence.sourceWorkPacketRef, "edge-phase-174-project-docs-review");
  assert.equal(evidence.sourceFixture.staticInputOnly, true);
  assert.equal(evidence.sourceFixture.runtimeFetched, false);
  assert.deepEqual(evidence.reasonCodes, ["static_fixture_review_only_evidence_emitted"]);
  assert.deepEqual(evidence.rejections, []);
});

test("emitted artifact includes exact edgeImportClassification", () => {
  const evidence = createEvidence(loadFixture());

  assert.deepEqual(evidence.edgeImportClassification, EDGE_IMPORT_CLASSIFICATION);
  assert.deepEqual(evidence.edgeImportClassification, {
    projectId: "mesh-ecology-translate",
    targetRepo: "mesh-ecology-translate",
    targetSurface: "project_docs_review",
    evidenceKind: "translate_project_review_evidence",
    edgeExpectedEvidenceKind: "translate_project_review_evidence",
    classificationOnly: true,
    edgeOwnsSchema: false,
    workPacketMode: "bounded_project_handoff"
  });
});

test("emitted artifact includes every required non-claim flag", () => {
  const evidence = createEvidence(loadFixture());

  assert.deepEqual(evidence.safeFlags, REQUIRED_NON_CLAIM_FLAGS);
  assert.deepEqual(evidence.nonClaims, REQUIRED_NON_CLAIM_FLAGS);

  for (const [flag, expected] of Object.entries(REQUIRED_NON_CLAIM_FLAGS)) {
    assert.equal(evidence.safeFlags[flag], expected, flag);
    assert.equal(evidence.nonClaims[flag], expected, flag);
  }
});

test("malformed JSON and malformed object shape are rejected as review-only evidence", () => {
  const malformedJson = createEvidence("{");
  const malformedShape = createEvidence([]);

  for (const evidence of [malformedJson, malformedShape]) {
    assert.equal(evidence.reviewStatus, "review_rejected_malformed_fixture");
    assert.equal(evidence.reviewOnly, true);
    assert.equal(evidence.evidenceOnly, true);
    assert.equal(evidence.rejectionOnly, true);
    assert.equal(evidence.safeFlags.staticInputOnly, true);
    assert.equal(evidence.safeFlags.edgeCalled, false);
    assert.equal(evidence.safeFlags.providerCalled, false);
  }
});

test("missing required classification fields is rejected", () => {
  const fixture = loadFixture();
  delete fixture.edgeImportClassification.targetSurface;

  const evidence = createEvidence(fixture);

  assert.equal(evidence.reviewStatus, "review_rejected_incomplete_fixture");
  assert.deepEqual(evidence.reasonCodes, ["missing_edge_import_classification_fields"]);
  assert.equal(evidence.rejections[0].code, "missing_edge_import_classification_fields");
  assert.deepEqual(evidence.rejections[0].fields, ["targetSurface"]);
});

test("wrong target repo, surface, and evidence kind are rejected as scope violations", () => {
  const fixture = loadFixture();
  fixture.edgeImportClassification.targetRepo = "mesh-ecology-edge";
  fixture.edgeImportClassification.targetSurface = "runtime_execution";
  fixture.edgeImportClassification.edgeExpectedEvidenceKind = "edge_owned_evidence";

  const evidence = createEvidence(fixture);

  assert.equal(evidence.reviewStatus, "review_rejected_scope_violation");
  assert.deepEqual(evidence.reasonCodes, ["edge_import_classification_scope_violation"]);
  assert.deepEqual(
    evidence.rejections[0].mismatches.map((mismatch) => mismatch.field),
    ["targetRepo", "targetSurface", "edgeExpectedEvidenceKind"]
  );
});

test("truth quality completion proof provider eval and model correctness flag violation is rejected", () => {
  const fixture = loadFixture();
  fixture.nonClaimFlags.translationTruthClaimed = true;
  fixture.nonClaimFlags.translationQualityClaimed = true;
  fixture.nonClaimFlags.projectCompletionClaimed = true;
  fixture.nonClaimFlags.productionProofClaimed = true;
  fixture.nonClaimFlags.providerCalled = true;
  fixture.nonClaimFlags.evalExecuted = true;
  fixture.nonClaimFlags.modelCorrectnessClaimed = true;

  const evidence = createEvidence(fixture);

  assert.equal(evidence.reviewStatus, "review_rejected_non_claim_flag_violation");
  assert.deepEqual(evidence.reasonCodes, ["non_claim_flag_violation"]);
  assert.deepEqual(
    evidence.rejections[0].violations.map((violation) => violation.field),
    [
      "projectCompletionClaimed",
      "productionProofClaimed",
      "providerCalled",
      "translationTruthClaimed",
      "translationQualityClaimed",
      "evalExecuted",
      "modelCorrectnessClaimed"
    ]
  );
});

test("provider methods are never imported or called by review evidence consumption", () => {
  const moduleSource = readFileSync(new URL("../src/review-evidence/index.js", import.meta.url), "utf8");
  const evidence = createEvidence(loadFixture());

  assert.doesNotMatch(moduleSource, /providers\//);
  assert.doesNotMatch(moduleSource, /router\//);
  assert.doesNotMatch(moduleSource, /\btranslate\s*\(/);
  assert.equal(evidence.safeFlags.providerCalled, false);
  assert.equal(evidence.safeFlags.translationGenerated, false);
});

test("no translation result is generated", () => {
  const evidence = createEvidence(loadFixture());

  assert.equal(evidence.safeFlags.translationGenerated, false);
  assert.equal(evidence.safeFlags.translationTruthClaimed, false);
  assert.equal(evidence.safeFlags.translationQualityClaimed, false);
  assert.equal(evidence.safeFlags.evalExecuted, false);
  assert.equal(evidence.safeFlags.benchmarkClaimed, false);
  assert.equal(evidence.safeFlags.modelCorrectnessClaimed, false);
  assert.equal(evidence.grammarCandidate, undefined);
  assert.equal(evidence.providerInfo, undefined);
  assert.equal(evidence.confidence, undefined);
});

test("correlation refs are preserved without semantic interpretation", () => {
  const fixture = loadFixture();
  fixture.correlationRefs = {
    edgePhaseId: "opaque-phase-ref",
    nestedOpaque: {
      value: ["preserve", "unchanged"]
    }
  };
  fixture.edgeRequestId = "edge-request-7";

  const evidence = createEvidence(fixture);

  assert.equal(evidence.correlationRefs.edgePhaseId, 174);
  assert.equal(evidence.correlationRefs.workPacketId, "edge-phase-174-project-docs-review");
  assert.equal(
    evidence.correlationRefs.handoffId,
    "edge-phase-174-to-mesh-ecology-translate-project-docs-review"
  );
  assert.equal(evidence.correlationRefs.sourceProjectId, "mesh-ecology-edge");
  assert.equal(evidence.correlationRefs.targetProjectId, "mesh-ecology-translate");
  assert.equal(evidence.correlationRefs.targetRepo, "mesh-ecology-translate");
  assert.equal(evidence.correlationRefs.targetSurface, "project_docs_review");
  assert.equal(evidence.correlationRefs.evidenceKind, "translate_project_review_evidence");
  assert.equal(evidence.correlationRefs.expectedEvidenceKind, "translate_project_review_evidence");
  assert.equal(evidence.correlationRefs.packetCreatedAt, "2026-05-04T00:00:00.000Z");
  assert.equal(evidence.correlationRefs.fixturePath, EDGE_PHASE_174_STATIC_FIXTURE_PATH);
  assert.equal(evidence.correlationRefs.edgeImportId, "edge-import-phase-174-static-project-review");
  assert.equal(evidence.correlationRefs.correlationId, "edge-phase-174-translate-project-docs-review");
  assert.equal(evidence.correlationRefs.requestId, "edge-phase-174-modeled-request");
  assert.equal(evidence.correlationRefs.edgeRequestId, "edge-request-7");
  assert.deepEqual(evidence.correlationRefs.edgeProvidedRefs, {
    edgePhaseId: "opaque-phase-ref",
    nestedOpaque: {
      value: ["preserve", "unchanged"]
    }
  });

  const copied = clone(evidence.correlationRefs);
  assert.deepEqual(evidence.correlationRefs, copied);
});

test("Edge packet is not accepted as translate schema, command, TODO, job, queue, or execution instruction", () => {
  const evidence = createEvidence(loadFixture());

  assert.equal(evidence.acceptedAsTranslateSchema, false);
  assert.equal(evidence.acceptedAsCommand, false);
  assert.equal(evidence.acceptedAsTodo, false);
  assert.equal(evidence.acceptedAsJob, false);
  assert.equal(evidence.acceptedAsQueue, false);
  assert.equal(evidence.acceptedAsExecutionInstruction, false);
  assert.equal(evidence.safeFlags.edgePacketAcceptedAsSchema, false);
  assert.equal(evidence.safeFlags.edgePacketAcceptedAsCommand, false);
  assert.equal(evidence.safeFlags.executionClaimed, false);
  assert.equal(evidence.safeFlags.schedulerClaimed, false);
  assert.equal(evidence.safeFlags.runnerClaimed, false);
  assert.equal(evidence.safeFlags.grantsAdjacentAcceptance, false);
});

test("review statuses are the Phase 176 status set", () => {
  assert.deepEqual(PROJECT_REVIEW_STATUSES, [
    "review_evidence_emitted",
    "review_rejected_malformed_fixture",
    "review_rejected_incomplete_fixture",
    "review_rejected_scope_violation",
    "review_rejected_non_claim_flag_violation"
  ]);
});
