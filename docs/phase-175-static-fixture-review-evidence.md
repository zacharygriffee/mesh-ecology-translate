# Phase 175 Static Fixture Review Evidence

Phase 176 implements the Phase 175 plan for consuming the Edge Phase 174 modeled bounded project handoff packet as a static local fixture and emitting translate-owned review evidence.

## Fixture Path

`test/fixtures/edge-phase-174/project-docs-review.bounded-project-handoff.json`

The fixture is local static JSON. It is not fetched from Edge at runtime, does not call Edge, and does not mutate Edge.

## Translate-Owned Evidence Model

The emitted artifact is translate-owned review evidence:

- `artifactKind`: `translate_project_review_evidence`
- `schema`: `mesh-ecology-translate/project-review-evidence/v1`
- `schemaVersion`: `1`
- `evidenceId`
- `reviewedAt`
- `sourceFixture`
- `sourceWorkPacketRef`
- `edgeImportClassification`
- `reviewStatus`
- `evidenceLabel`
- `correlationRefs`
- `reasonCodes`
- `reviewFindings`
- `warnings`
- `rejections`
- `safeFlags`
- `nonClaims`

This artifact is evidence that `mesh-ecology-translate` reviewed a static fixture. It is not translation output, production proof, mesh truth, project completion proof, or adjacent acceptance.

## Constants

Review evidence constants live in `src/review-evidence/index.js`:

- `TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND`
- `TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA`
- `TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION`
- `EDGE_PHASE_174_STATIC_FIXTURE_PATH`
- `EDGE_IMPORT_CLASSIFICATION`
- `PROJECT_REVIEW_STATUSES`
- `REQUIRED_NON_CLAIM_FLAGS`

## Statuses

- `review_evidence_emitted`
- `review_rejected_malformed_fixture`
- `review_rejected_incomplete_fixture`
- `review_rejected_scope_violation`
- `review_rejected_non_claim_flag_violation`

Malformed, incomplete, out-of-scope, or non-claim-violating inputs still emit translate-owned review evidence. Normal validation failures do not trigger provider calls, translation generation, evals, benchmarks, runners, schedulers, Edge calls, or mesh publication.

## Validation Boundary

The review evidence helper validates only the static fixture consumption boundary:

- fixture input must be local static JSON or an already parsed object from the local fixture
- target project/repo must be `mesh-ecology-translate`
- target surface must be `project_docs_review`
- work packet mode must be `bounded_project_handoff`
- expected evidence kind must be `translate_project_review_evidence`
- `classificationOnly` must be `true`
- `edgeOwnsSchema` must be `false`
- required non-claim flags must be present with exact expected values
- correlation refs are preserved as opaque metadata

The Edge packet is not accepted as translate schema. The packet body is not interpreted as a command, TODO, job, queue, or execution instruction.

## Classification Metadata

The emitted artifact always uses translate-owned classification metadata:

```json
{
  "projectId": "mesh-ecology-translate",
  "targetRepo": "mesh-ecology-translate",
  "targetSurface": "project_docs_review",
  "evidenceKind": "translate_project_review_evidence",
  "edgeExpectedEvidenceKind": "translate_project_review_evidence",
  "classificationOnly": true,
  "edgeOwnsSchema": false,
  "workPacketMode": "bounded_project_handoff"
}
```

## Required Non-Claims

The emitted artifact preserves safe flags and non-claims. These include:

- no Edge runtime fetch, call, mutation, or authority grant
- no project call or Edge mutation of the project
- no accepted Edge packet schema, command, project schema, TODO, job, queue, or execution instruction
- no project completion, project truth, domain truth, adjacent truth, mesh truth, production proof, or mesh publication claim
- no scheduler, runner, live discovery, execution, or adjacent acceptance
- no provider call
- no translation generation
- no translation truth or quality claim
- no eval, benchmark, or model correctness claim

## Rejection Behavior

Rejections are review-only evidence:

- malformed JSON or non-object input: `review_rejected_malformed_fixture`
- missing required classification fields: `review_rejected_incomplete_fixture`
- wrong target, surface, mode, evidence kind, `classificationOnly`, or `edgeOwnsSchema`: `review_rejected_scope_violation`
- missing or incorrect non-claim flags: `review_rejected_non_claim_flag_violation`

Rejection evidence does not prove project status, translation quality, model correctness, production readiness, mesh truth, or Edge acceptance.

## Later Edge Import Go/No-Go

Go for later Edge import only when translate-owned evidence:

- uses the translate-owned schema and version constants
- includes exact classification metadata
- includes all required non-claim flags
- preserves correlation refs
- reports deterministic review status and reason codes
- passes the review evidence tests

No-go if the artifact implies provider execution, translation output, translation truth, translation quality, model correctness, project completion, production proof, mesh truth, runtime Edge dependency, Edge schema adoption, or adjacent acceptance from packet presence.
