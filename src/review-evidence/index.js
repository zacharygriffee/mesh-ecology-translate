export const TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND =
  "translate_project_review_evidence";
export const TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA =
  "mesh-ecology-translate/project-review-evidence/v1";
export const TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION = 1;
export const EDGE_PHASE_174_STATIC_FIXTURE_PATH =
  "test/fixtures/edge-phase-174/project-docs-review.bounded-project-handoff.json";

export const EDGE_IMPORT_CLASSIFICATION = {
  projectId: "mesh-ecology-translate",
  targetRepo: "mesh-ecology-translate",
  targetSurface: "project_docs_review",
  evidenceKind: TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
  edgeExpectedEvidenceKind: TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
  classificationOnly: true,
  edgeOwnsSchema: false,
  workPacketMode: "bounded_project_handoff"
};

export const PROJECT_REVIEW_STATUSES = [
  "review_evidence_emitted",
  "review_rejected_malformed_fixture",
  "review_rejected_incomplete_fixture",
  "review_rejected_scope_violation",
  "review_rejected_non_claim_flag_violation"
];

export const REQUIRED_NON_CLAIM_FLAGS = {
  staticInputOnly: true,
  reviewOnly: true,
  evidenceOnly: true,
  edgeRuntimeFetched: false,
  edgeCalled: false,
  edgeMutated: false,
  projectCalled: false,
  projectMutatedByEdge: false,
  edgePacketAcceptedAsSchema: false,
  edgePacketAcceptedAsCommand: false,
  projectSchemaAccepted: false,
  projectCompletionClaimed: false,
  projectTruthClaimed: false,
  domainTruthClaimed: false,
  adjacentTruthClaimed: false,
  meshTruthClaimed: false,
  productionProofClaimed: false,
  executionClaimed: false,
  schedulerClaimed: false,
  runnerClaimed: false,
  liveDiscoveryClaimed: false,
  meshPublicationClaimed: false,
  grantsAdjacentAcceptance: false,
  edgeAuthorityGranted: false,
  publishesToMesh: false,
  providerCalled: false,
  translationGenerated: false,
  translationTruthClaimed: false,
  translationQualityClaimed: false,
  evalExecuted: false,
  benchmarkClaimed: false,
  modelCorrectnessClaimed: false
};

const REJECTION_STATUSES = new Set(PROJECT_REVIEW_STATUSES.slice(1));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function parseFixtureInput(fixtureInput) {
  if (typeof fixtureInput === "string") {
    try {
      const parsed = JSON.parse(fixtureInput);
      if (!isPlainObject(parsed)) {
        return {
          fixture: null,
          malformed: true,
          reason: "fixture_json_root_must_be_object"
        };
      }

      return { fixture: parsed, malformed: false };
    } catch (error) {
      return {
        fixture: null,
        malformed: true,
        reason: "fixture_json_parse_failed",
        details: { message: error.message }
      };
    }
  }

  if (!isPlainObject(fixtureInput)) {
    return {
      fixture: null,
      malformed: true,
      reason: "fixture_input_must_be_object_or_json_string"
    };
  }

  return { fixture: fixtureInput, malformed: false };
}

function getClassification(fixture) {
  return isPlainObject(fixture.edgeImportClassification)
    ? fixture.edgeImportClassification
    : undefined;
}

function getNonClaimFlags(fixture) {
  if (isPlainObject(fixture.nonClaimFlags)) {
    return fixture.nonClaimFlags;
  }

  if (isPlainObject(fixture.safeFlags)) {
    return fixture.safeFlags;
  }

  return undefined;
}

function findMissingClassificationFields(classification) {
  if (!isPlainObject(classification)) {
    return Object.keys(EDGE_IMPORT_CLASSIFICATION);
  }

  return Object.keys(EDGE_IMPORT_CLASSIFICATION).filter(
    (field) => classification[field] === undefined
  );
}

function findClassificationMismatches(classification) {
  return Object.entries(EDGE_IMPORT_CLASSIFICATION)
    .filter(([field, expected]) => classification[field] !== expected)
    .map(([field, expected]) => ({
      field,
      expected,
      actual: classification[field]
    }));
}

function findNonClaimFlagViolations(flags) {
  if (!isPlainObject(flags)) {
    return Object.entries(REQUIRED_NON_CLAIM_FLAGS).map(([field, expected]) => ({
      field,
      expected,
      actual: undefined
    }));
  }

  return Object.entries(REQUIRED_NON_CLAIM_FLAGS)
    .filter(([field, expected]) => flags[field] !== expected)
    .map(([field, expected]) => ({
      field,
      expected,
      actual: flags[field]
    }));
}

function getSourceWorkPacketRef(fixture) {
  return (
    fixture?.sourceWorkPacketRef ??
    fixture?.workPacketRef ??
    fixture?.workPacketId ??
    fixture?.packetId ??
    null
  );
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)
  );
}

function collectCorrelationRefs(fixture, fixturePath) {
  if (!isPlainObject(fixture)) {
    return compactObject({
      fixturePath
    });
  }

  const classification = getClassification(fixture);
  const explicitRefs = isPlainObject(fixture.correlationRefs) ? fixture.correlationRefs : {};

  return cloneJson(
    compactObject({
      edgePhaseId: fixture.edgePhaseId ?? fixture.phaseId ?? explicitRefs.edgePhaseId,
      workPacketId: fixture.workPacketId ?? fixture.packetId ?? explicitRefs.workPacketId,
      handoffId: fixture.handoffId ?? explicitRefs.handoffId,
      sourceProjectId:
        fixture.sourceProjectId ??
        fixture.source?.projectId ??
        explicitRefs.sourceProjectId,
      targetProjectId:
        fixture.targetProjectId ??
        fixture.target?.projectId ??
        classification?.projectId ??
        explicitRefs.targetProjectId,
      targetRepo:
        fixture.targetRepo ??
        fixture.target?.repo ??
        classification?.targetRepo ??
        explicitRefs.targetRepo,
      targetSurface:
        fixture.targetSurface ??
        fixture.target?.surface ??
        classification?.targetSurface ??
        explicitRefs.targetSurface,
      evidenceKind:
        fixture.evidenceKind ??
        classification?.evidenceKind ??
        explicitRefs.evidenceKind,
      expectedEvidenceKind:
        fixture.expectedEvidenceKind ??
        classification?.edgeExpectedEvidenceKind ??
        explicitRefs.expectedEvidenceKind,
      packetCreatedAt:
        fixture.packetCreatedAt ??
        fixture.createdAt ??
        explicitRefs.packetCreatedAt,
      fixturePath,
      edgeImportId: fixture.edgeImportId ?? explicitRefs.edgeImportId,
      correlationId: fixture.correlationId ?? explicitRefs.correlationId,
      requestId: fixture.requestId ?? explicitRefs.requestId,
      edgeRequestId: fixture.edgeRequestId ?? explicitRefs.edgeRequestId,
      edgeProvidedRefs: Object.keys(explicitRefs).length > 0 ? explicitRefs : undefined
    })
  );
}

function createFinding(status) {
  if (status === "review_evidence_emitted") {
    return {
      code: "static_fixture_reviewed",
      message:
        "Static Edge Phase 174 fixture was consumed as review-only input and emitted translate-owned evidence."
    };
  }

  return {
    code: "static_fixture_rejected",
    message:
      "Static Edge Phase 174 fixture was rejected without accepting it as schema, command, job, queue, or execution instruction."
  };
}

function buildEvidenceId({ status, fixturePath, sourceWorkPacketRef }) {
  const ref = sourceWorkPacketRef ?? "no-work-packet-ref";
  return [
    TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
    status,
    fixturePath,
    ref
  ]
    .join(":")
    .replaceAll(/[^a-zA-Z0-9_.:/-]+/g, "_");
}

function buildEvidence({
  fixture,
  fixturePath,
  status,
  reasonCodes,
  rejections,
  warnings,
  reviewedAt,
  evidenceId
}) {
  const sourceWorkPacketRef = isPlainObject(fixture) ? getSourceWorkPacketRef(fixture) : null;

  return {
    artifactKind: TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
    schema: TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA,
    schemaVersion: TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION,
    evidenceId:
      evidenceId ??
      buildEvidenceId({
        status,
        fixturePath,
        sourceWorkPacketRef
      }),
    reviewedAt: reviewedAt ?? new Date().toISOString(),
    sourceFixture: {
      fixturePath,
      staticInputOnly: true,
      localStaticJson: true,
      runtimeFetched: false
    },
    sourceWorkPacketRef: cloneJson(sourceWorkPacketRef),
    edgeImportClassification: cloneJson(EDGE_IMPORT_CLASSIFICATION),
    reviewStatus: status,
    evidenceLabel: "Edge Phase 174 static project docs review handoff fixture review evidence",
    correlationRefs: collectCorrelationRefs(fixture, fixturePath),
    reasonCodes,
    reviewFindings: [createFinding(status)],
    warnings,
    rejections,
    safeFlags: cloneJson(REQUIRED_NON_CLAIM_FLAGS),
    nonClaims: cloneJson(REQUIRED_NON_CLAIM_FLAGS),
    reviewOnly: true,
    evidenceOnly: true,
    acceptedAsTranslateSchema: false,
    acceptedAsCommand: false,
    acceptedAsTodo: false,
    acceptedAsJob: false,
    acceptedAsQueue: false,
    acceptedAsExecutionInstruction: false,
    rejectionOnly: REJECTION_STATUSES.has(status)
  };
}

export function createProjectReviewEvidenceFromFixture(fixtureInput, options = {}) {
  const fixturePath = options.fixturePath ?? EDGE_PHASE_174_STATIC_FIXTURE_PATH;
  const parsed = parseFixtureInput(fixtureInput);

  if (parsed.malformed) {
    return buildEvidence({
      fixture: null,
      fixturePath,
      status: "review_rejected_malformed_fixture",
      reasonCodes: [parsed.reason],
      rejections: [
        {
          code: parsed.reason,
          message: "Fixture could not be parsed or was not a JSON object.",
          ...(parsed.details ? { details: parsed.details } : {})
        }
      ],
      warnings: [],
      reviewedAt: options.reviewedAt,
      evidenceId: options.evidenceId
    });
  }

  const fixture = parsed.fixture;
  const classification = getClassification(fixture);
  const missingClassificationFields = findMissingClassificationFields(classification);

  if (missingClassificationFields.length > 0) {
    return buildEvidence({
      fixture,
      fixturePath,
      status: "review_rejected_incomplete_fixture",
      reasonCodes: ["missing_edge_import_classification_fields"],
      rejections: [
        {
          code: "missing_edge_import_classification_fields",
          fields: missingClassificationFields
        }
      ],
      warnings: [],
      reviewedAt: options.reviewedAt,
      evidenceId: options.evidenceId
    });
  }

  const classificationMismatches = findClassificationMismatches(classification);

  if (classificationMismatches.length > 0) {
    return buildEvidence({
      fixture,
      fixturePath,
      status: "review_rejected_scope_violation",
      reasonCodes: ["edge_import_classification_scope_violation"],
      rejections: [
        {
          code: "edge_import_classification_scope_violation",
          mismatches: classificationMismatches
        }
      ],
      warnings: [],
      reviewedAt: options.reviewedAt,
      evidenceId: options.evidenceId
    });
  }

  const nonClaimFlagViolations = findNonClaimFlagViolations(getNonClaimFlags(fixture));

  if (nonClaimFlagViolations.length > 0) {
    return buildEvidence({
      fixture,
      fixturePath,
      status: "review_rejected_non_claim_flag_violation",
      reasonCodes: ["non_claim_flag_violation"],
      rejections: [
        {
          code: "non_claim_flag_violation",
          violations: nonClaimFlagViolations
        }
      ],
      warnings: [],
      reviewedAt: options.reviewedAt,
      evidenceId: options.evidenceId
    });
  }

  return buildEvidence({
    fixture,
    fixturePath,
    status: "review_evidence_emitted",
    reasonCodes: ["static_fixture_review_only_evidence_emitted"],
    rejections: [],
    warnings: [
      {
        code: "edge_packet_not_accepted_as_translate_schema",
        message:
          "The Edge packet was consumed only as a static fixture and was not accepted as translate schema or execution input."
      }
    ],
    reviewedAt: options.reviewedAt,
    evidenceId: options.evidenceId
  });
}
