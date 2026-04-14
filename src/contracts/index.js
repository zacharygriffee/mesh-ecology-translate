export const INPUT_TYPES = ["text"];
export const TRANSLATION_PROFILES = ["command", "conversational", "clarification"];
export const PROVIDER_PREFERENCES = [
  "local_preferred",
  "local_only",
  "remote_allowed",
  "specific"
];
export const SECURITY_POSTURES = ["sensitive", "standard", "public"];

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
