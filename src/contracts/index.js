import {
  GENERIC_CANDIDATE_SCHEMA_VERSION,
  validateGenericCandidate
} from "./generic-candidate.js";

export const INPUT_TYPES = ["text"];
export const TRANSLATION_PROFILES = ["command", "conversational", "clarification"];
export const PROVIDER_PREFERENCES = [
  "local_preferred",
  "local_only",
  "remote_allowed",
  "specific"
];
export const SECURITY_POSTURES = ["sensitive", "standard", "public"];
export const TRANSLATION_CONTEXT_FIELDS = [
  "operatorFocus",
  "activeReferents",
  "portalVisibility",
  "exportVisibility",
  "continuitySummaries",
  "ambiguityMarkers",
  "reasonReferences",
  "evidenceReferences"
];

export {
  GENERIC_ACTION_FAMILIES,
  GENERIC_CANDIDATE_SCHEMA_VERSION,
  GENERIC_IDEMPOTENCY_VALUES,
  GENERIC_REVERSIBILITY_VALUES,
  GENERIC_TARGET_CLASSES,
  REQUIRED_NON_AUTHORITY_FLAGS,
  validateGenericCandidate
} from "./generic-candidate.js";

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAbortSignalLike(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function"
  );
}

function assertJsonCompatible(value, path) {
  if (value === null) {
    return;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    assert(Number.isFinite(value), `${path} must contain only finite numbers.`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatible(item, `${path}[${index}]`));
    return;
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, item]) => {
      assert(typeof key === "string" && key.length > 0, `${path} keys must be non-empty strings.`);
      assertJsonCompatible(item, `${path}.${key}`);
    });
    return;
  }

  throw new TypeError(`${path} must contain only JSON-compatible values.`);
}

export function validateTranslationRequest(request) {
  assert(isPlainObject(request), "TranslationRequest must be an object.");
  assert(Array.isArray(request.inputs), "TranslationRequest.inputs must be an array.");
  assert(request.inputs.length > 0, "TranslationRequest.inputs must not be empty.");

  request.inputs.forEach((input, index) => {
    assert(isPlainObject(input), `TranslationRequest.inputs[${index}] must be an object.`);
    assert(
      INPUT_TYPES.includes(input.type),
      `TranslationRequest.inputs[${index}].type must be one of: ${INPUT_TYPES.join(", ")}.`
    );
    assert(
      typeof input.content === "string" && input.content.trim().length > 0,
      `TranslationRequest.inputs[${index}].content must be a non-empty string.`
    );
  });

  assert(
    TRANSLATION_PROFILES.includes(request.profile),
    `TranslationRequest.profile must be one of: ${TRANSLATION_PROFILES.join(", ")}.`
  );
  assert(
    PROVIDER_PREFERENCES.includes(request.providerPreference),
    `TranslationRequest.providerPreference must be one of: ${PROVIDER_PREFERENCES.join(", ")}.`
  );
  assert(
    SECURITY_POSTURES.includes(request.securityPosture),
    `TranslationRequest.securityPosture must be one of: ${SECURITY_POSTURES.join(", ")}.`
  );

  if (request.continuity !== undefined) {
    assert(isPlainObject(request.continuity), "TranslationRequest.continuity must be an object.");
  }

  if (request.context !== undefined) {
    assert(isPlainObject(request.context), "TranslationRequest.context must be an object when provided.");
    Object.keys(request.context).forEach((field) => {
      assert(
        TRANSLATION_CONTEXT_FIELDS.includes(field),
        `TranslationRequest.context.${field} is not supported. Supported context fields: ${TRANSLATION_CONTEXT_FIELDS.join(", ")}.`
      );
      assertJsonCompatible(request.context[field], `TranslationRequest.context.${field}`);
    });
  }

  if (request.timeoutMs !== undefined) {
    assert(
      Number.isFinite(request.timeoutMs) && request.timeoutMs > 0,
      "TranslationRequest.timeoutMs must be a positive number when provided."
    );
  }

  if (request.signal !== undefined) {
    assert(
      isAbortSignalLike(request.signal),
      "TranslationRequest.signal must be an AbortSignal-compatible object when provided."
    );
  }

  if (request.providerPreference === "specific") {
    assert(
      typeof request.provider === "string" && request.provider.trim().length > 0,
      "TranslationRequest.provider is required when providerPreference is \"specific\"."
    );
  } else if (request.provider !== undefined) {
    assert(
      typeof request.provider === "string" && request.provider.trim().length > 0,
      "TranslationRequest.provider must be a non-empty string when provided."
    );
  }

  return request;
}

export function validateTranslationResult(result) {
  assert(isPlainObject(result), "TranslationResult must be an object.");
  assert(isPlainObject(result.grammarCandidate), "TranslationResult.grammarCandidate must be an object.");

  if (result.grammarCandidate.schemaVersion === GENERIC_CANDIDATE_SCHEMA_VERSION) {
    validateGenericCandidate(result.grammarCandidate);
  }

  assert(
    typeof result.confidence === "number" &&
      Number.isFinite(result.confidence) &&
      result.confidence >= 0 &&
      result.confidence <= 1,
    "TranslationResult.confidence must be a number between 0 and 1."
  );
  assert(Array.isArray(result.ambiguities), "TranslationResult.ambiguities must be an array.");
  result.ambiguities.forEach((ambiguity, index) => {
    assert(
      typeof ambiguity === "string",
      `TranslationResult.ambiguities[${index}] must be a string.`
    );
  });
  assert(
    typeof result.needsClarification === "boolean",
    "TranslationResult.needsClarification must be a boolean."
  );

  if (result.notes !== undefined) {
    assert(Array.isArray(result.notes), "TranslationResult.notes must be an array when provided.");
    result.notes.forEach((note, index) => {
      assert(typeof note === "string", `TranslationResult.notes[${index}] must be a string.`);
    });
  }

  assert(isPlainObject(result.providerInfo), "TranslationResult.providerInfo must be an object.");
  assert(
    typeof result.providerInfo.provider === "string" && result.providerInfo.provider.trim().length > 0,
    "TranslationResult.providerInfo.provider must be a non-empty string."
  );
  assert(
    typeof result.providerInfo.model === "string" && result.providerInfo.model.trim().length > 0,
    "TranslationResult.providerInfo.model must be a non-empty string."
  );

  if (result.providerInfo.latency !== undefined) {
    assert(
      typeof result.providerInfo.latency === "number" &&
        Number.isFinite(result.providerInfo.latency) &&
        result.providerInfo.latency >= 0,
      "TranslationResult.providerInfo.latency must be a non-negative number when provided."
    );
  }

  return result;
}
