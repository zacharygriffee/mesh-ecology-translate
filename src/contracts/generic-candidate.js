export const GENERIC_CANDIDATE_SCHEMA_VERSION = "generic_candidate_v1";

export const GENERIC_ACTION_FAMILIES = Object.freeze([
  "inspect_status",
  "list_ready_targets",
  "call_for_responses",
  "prepare_follow_on_action",
  "review_evidence",
  "compare_evidence",
  "request_clarification",
  "stop_or_hold",
  "consumer_defined"
]);

export const GENERIC_TARGET_CLASSES = Object.freeze([
  "unknown",
  "repo",
  "issue",
  "evidence",
  "document",
  "operator_context",
  "device",
  "service",
  "consumer_defined"
]);

export const GENERIC_IDEMPOTENCY_VALUES = Object.freeze([
  "idempotent",
  "non_idempotent",
  "conditional"
]);

export const GENERIC_REVERSIBILITY_VALUES = Object.freeze([
  "reversible",
  "irreversible",
  "unknown"
]);

export const REQUIRED_NON_AUTHORITY_FLAGS = Object.freeze([
  "doesNotApprove",
  "doesNotExecute",
  "doesNotMutate",
  "doesNotSelectTruth",
  "consumerOwnsAuthority"
]);

const FORBIDDEN_GENERIC_AUTHORITY_FIELDS = Object.freeze([
  "approval",
  "approved",
  "authority",
  "authorityHint",
  "authorization",
  "authorized",
  "capabilities",
  "capabilityHints",
  "command",
  "commands",
  "execute",
  "executes",
  "execution",
  "executionMode",
  "mutates",
  "mutatesRepo",
  "mutation",
  "selectedTruth",
  "toolCalls",
  "tools",
  "truthSelection"
]);

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function assertStringArray(value, path) {
  assert(Array.isArray(value), `${path} must be an array.`);
  value.forEach((item, index) => {
    assert(typeof item === "string", `${path}[${index}] must be a string.`);
  });
}

function assertOptionalNonEmptyString(value, path) {
  if (value === undefined) {
    return;
  }

  assert(typeof value === "string" && value.trim().length > 0, `${path} must be a non-empty string.`);
}

export function validateGenericCandidate(candidate, { path = "grammarCandidate" } = {}) {
  assert(isPlainObject(candidate), `${path} must be an object.`);
  assert(
    candidate.schemaVersion === GENERIC_CANDIDATE_SCHEMA_VERSION,
    `${path}.schemaVersion must be ${GENERIC_CANDIDATE_SCHEMA_VERSION}.`
  );

  for (const field of FORBIDDEN_GENERIC_AUTHORITY_FIELDS) {
    assert(candidate[field] === undefined, `${path}.${field} is not allowed on generic candidates.`);
  }

  assert(
    GENERIC_ACTION_FAMILIES.includes(candidate.actionFamily),
    `${path}.actionFamily must be one of: ${GENERIC_ACTION_FAMILIES.join(", ")}.`
  );
  assert(
    GENERIC_TARGET_CLASSES.includes(candidate.targetClass),
    `${path}.targetClass must be one of: ${GENERIC_TARGET_CLASSES.join(", ")}.`
  );
  assert(Array.isArray(candidate.targetRefs), `${path}.targetRefs must be an array.`);
  candidate.targetRefs.forEach((targetRef, index) => {
    assertJsonCompatible(targetRef, `${path}.targetRefs[${index}]`);
  });

  assert(
    typeof candidate.confidence === "number" &&
      Number.isFinite(candidate.confidence) &&
      candidate.confidence >= 0 &&
      candidate.confidence <= 1,
    `${path}.confidence must be a number between 0 and 1.`
  );
  assertStringArray(candidate.ambiguities, `${path}.ambiguities`);
  assertStringArray(candidate.unresolvedFields, `${path}.unresolvedFields`);
  assert(
    GENERIC_IDEMPOTENCY_VALUES.includes(candidate.idempotency),
    `${path}.idempotency must be one of: ${GENERIC_IDEMPOTENCY_VALUES.join(", ")}.`
  );
  assert(
    GENERIC_REVERSIBILITY_VALUES.includes(candidate.reversibility),
    `${path}.reversibility must be one of: ${GENERIC_REVERSIBILITY_VALUES.join(", ")}.`
  );

  assertOptionalNonEmptyString(candidate.requiredOperatorDecision, `${path}.requiredOperatorDecision`);
  assertOptionalNonEmptyString(candidate.suggestedConsumerSurface, `${path}.suggestedConsumerSurface`);

  assert(isPlainObject(candidate.nonAuthority), `${path}.nonAuthority must be an object.`);
  for (const flag of REQUIRED_NON_AUTHORITY_FLAGS) {
    assert(candidate.nonAuthority[flag] === true, `${path}.nonAuthority.${flag} must be true.`);
  }

  if (candidate.targetClass === "unknown") {
    assert(candidate.targetRefs.length === 0, `${path}.targetRefs must be empty when targetClass is unknown.`);
    assert(
      candidate.unresolvedFields.length > 0,
      `${path}.unresolvedFields must be populated when targetClass is unknown.`
    );
    assert(
      typeof candidate.requiredOperatorDecision === "string" &&
        candidate.requiredOperatorDecision.trim().length > 0,
      `${path}.requiredOperatorDecision is required when targetClass is unknown.`
    );
  }

  if (candidate.actionFamily === "request_clarification") {
    assert(
      typeof candidate.requiredOperatorDecision === "string" &&
        candidate.requiredOperatorDecision.trim().length > 0,
      `${path}.requiredOperatorDecision is required for request_clarification.`
    );
  }

  return candidate;
}
