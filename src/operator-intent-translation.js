import { createHash } from "node:crypto";

export const OPERATOR_INTENT_TRANSLATION_KIND = "operator_intent_translation";
export const OPERATOR_INTENT_TRANSLATION_SCHEMA = "operator_intent_translation.v0";
export const FILE_RESOURCE_SOURCE_CONTINUITY_ACCEPTANCE_VERB =
  "accept_file_resource_source_continuity";

const REQUIRED_FALSE_NONCLAIMS = Object.freeze([
  "approval",
  "execution",
  "admission",
  "layerAppend",
  "rbcDecision",
  "canonicalTruth",
  "authority"
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function withoutHash(value) {
  const copy = { ...value };
  delete copy.translationHash;
  return copy;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildOperatorIntentTranslation({
  operatorText,
  targetLayerRef = "layer:operator-local",
  targetContextRef = "context:file-resource-lift:operator-local",
  sourceResourceRefs = [],
  sourceEvidenceRefs = [],
  ambiguityRefs = [],
  confidence = 0.82,
  translatedAt = new Date().toISOString(),
  providerInfo = { provider: "deterministic-local", model: "operator-intent-translation-v0" }
} = {}) {
  const issues = getOperatorIntentTranslationIssues({
    operatorText,
    targetLayerRef,
    targetContextRef,
    sourceResourceRefs,
    sourceEvidenceRefs,
    confidence
  });
  const clarificationNeeded = issues.length > 0 || array(ambiguityRefs).length > 0;
  const translation = {
    artifactKind: OPERATOR_INTENT_TRANSLATION_KIND,
    schemaVersion: OPERATOR_INTENT_TRANSLATION_SCHEMA,
    translationRef: `operator-intent-translation:${sha256({
      operatorText,
      targetLayerRef,
      targetContextRef,
      sourceResourceRefs,
      sourceEvidenceRefs
    }).slice(0, 16)}`,
    translatedAt,
    proofRung: "candidate_grammar",
    operatorText: stringOrNull(operatorText),
    candidate: {
      requestedVerb: FILE_RESOURCE_SOURCE_CONTINUITY_ACCEPTANCE_VERB,
      targetLayerRef: stringOrNull(targetLayerRef),
      targetContextRef: stringOrNull(targetContextRef),
      sourceResourceRefs: array(sourceResourceRefs),
      sourceEvidenceRefs: array(sourceEvidenceRefs),
      confidence,
      ambiguityRefs: array(ambiguityRefs),
      unresolvedFields: issues,
      idempotency: "conditional",
      reversibility: "irreversible",
      requiresOperatorConfirmation: true,
      requiresRbcAdmissibility: true,
      requiresLayerAppend: true,
      clarificationNeeded
    },
    providerInfo,
    nonClaims: Object.fromEntries(REQUIRED_FALSE_NONCLAIMS.map((field) => [field, false]))
  };
  translation.translationHash = `sha256:${sha256(withoutHash(translation))}`;
  validateOperatorIntentTranslation(translation);
  return Object.freeze(translation);
}

export function validateOperatorIntentTranslation(translation) {
  if (translation?.artifactKind !== OPERATOR_INTENT_TRANSLATION_KIND) {
    throw new TypeError(`OperatorIntentTranslation.artifactKind must be ${OPERATOR_INTENT_TRANSLATION_KIND}`);
  }
  if (translation?.schemaVersion !== OPERATOR_INTENT_TRANSLATION_SCHEMA) {
    throw new TypeError(`OperatorIntentTranslation.schemaVersion must be ${OPERATOR_INTENT_TRANSLATION_SCHEMA}`);
  }
  if (translation.proofRung !== "candidate_grammar") {
    throw new TypeError("OperatorIntentTranslation.proofRung must be candidate_grammar");
  }
  if (translation.candidate?.requestedVerb !== FILE_RESOURCE_SOURCE_CONTINUITY_ACCEPTANCE_VERB) {
    throw new TypeError("OperatorIntentTranslation.candidate.requestedVerb is invalid");
  }
  for (const field of ["targetLayerRef", "targetContextRef"]) {
    if (typeof translation.candidate?.[field] !== "string" || translation.candidate[field].length === 0) {
      throw new TypeError(`OperatorIntentTranslation.candidate.${field} is required`);
    }
  }
  for (const field of ["sourceResourceRefs", "sourceEvidenceRefs", "ambiguityRefs", "unresolvedFields"]) {
    if (!Array.isArray(translation.candidate?.[field])) {
      throw new TypeError(`OperatorIntentTranslation.candidate.${field} must be an array`);
    }
  }
  if (translation.candidate.sourceResourceRefs.length === 0) {
    throw new TypeError("OperatorIntentTranslation.candidate.sourceResourceRefs must not be empty");
  }
  if (translation.candidate.sourceEvidenceRefs.length === 0) {
    throw new TypeError("OperatorIntentTranslation.candidate.sourceEvidenceRefs must not be empty");
  }
  if (translation.candidate.requiresOperatorConfirmation !== true) {
    throw new TypeError("OperatorIntentTranslation must require operator confirmation");
  }
  if (translation.candidate.requiresRbcAdmissibility !== true) {
    throw new TypeError("OperatorIntentTranslation must require RBC admissibility");
  }
  if (translation.candidate.requiresLayerAppend !== true) {
    throw new TypeError("OperatorIntentTranslation must require Layer append");
  }
  for (const field of REQUIRED_FALSE_NONCLAIMS) {
    if (translation.nonClaims?.[field] !== false) {
      throw new TypeError(`OperatorIntentTranslation.nonClaims.${field} must be false`);
    }
  }
  return translation;
}

export function getOperatorIntentTranslationIssues({
  operatorText,
  targetLayerRef,
  targetContextRef,
  sourceResourceRefs,
  sourceEvidenceRefs,
  confidence
} = {}) {
  const issues = [];
  if (typeof operatorText !== "string" || operatorText.trim().length === 0) issues.push("operator_text_required");
  if (typeof targetLayerRef !== "string" || targetLayerRef.length === 0) issues.push("target_layer_ref_required");
  if (typeof targetContextRef !== "string" || targetContextRef.length === 0) issues.push("target_context_ref_required");
  if (!Array.isArray(sourceResourceRefs) || sourceResourceRefs.length === 0) issues.push("source_resource_refs_required");
  if (!Array.isArray(sourceEvidenceRefs) || sourceEvidenceRefs.length === 0) issues.push("source_evidence_refs_required");
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push("confidence_invalid");
  }
  return issues;
}
