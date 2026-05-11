import { extractPrimaryText } from "./base.js";
import { validateTranslationResult } from "../contracts/index.js";
import {
  GENERIC_ACTION_FAMILIES,
  GENERIC_CANDIDATE_SCHEMA_VERSION,
  GENERIC_IDEMPOTENCY_VALUES,
  GENERIC_REVERSIBILITY_VALUES,
  GENERIC_TARGET_CLASSES,
  REQUIRED_NON_AUTHORITY_FLAGS,
  validateGenericCandidate
} from "../contracts/generic-candidate.js";
import { createProviderInvalidResponseError } from "../errors/index.js";

export const DEFAULT_STRUCTURED_GRAMMAR_PROFILE = GENERIC_CANDIDATE_SCHEMA_VERSION;
export const STRUCTURED_GRAMMAR_PROFILES = Object.freeze([
  GENERIC_CANDIDATE_SCHEMA_VERSION,
  "portable_v1",
  "edge_v1"
]);
export const PORTABLE_INTENT_CLASSES = Object.freeze([
  "control",
  "observe",
  "generate",
  "transform",
  "deliver",
  "share_candidate",
  "inform_operator",
  "protected_operation"
]);

export function buildGenericCandidateOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["grammarCandidate", "confidence", "needsClarification", "ambiguities", "notes"],
    properties: {
      grammarCandidate: {
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "actionFamily",
          "targetClass",
          "targetRefs",
          "confidence",
          "ambiguities",
          "unresolvedFields",
          "idempotency",
          "reversibility",
          "requiredOperatorDecision",
          "suggestedConsumerSurface",
          "parameters",
          "rawInterpretation",
          "nonAuthority"
        ],
        properties: {
          schemaVersion: { type: "string", const: GENERIC_CANDIDATE_SCHEMA_VERSION },
          actionFamily: { type: "string", enum: GENERIC_ACTION_FAMILIES },
          targetClass: { type: "string", enum: GENERIC_TARGET_CLASSES },
          targetRefs: {
            type: "array",
            items: { type: "string" }
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          ambiguities: {
            type: "array",
            items: { type: "string" }
          },
          unresolvedFields: {
            type: "array",
            items: { type: "string" }
          },
          idempotency: { type: "string", enum: GENERIC_IDEMPOTENCY_VALUES },
          reversibility: { type: "string", enum: GENERIC_REVERSIBILITY_VALUES },
          requiredOperatorDecision: { type: ["string", "null"] },
          suggestedConsumerSurface: { type: ["string", "null"] },
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {}
          },
          rawInterpretation: { type: ["string", "null"] },
          nonAuthority: {
            type: "object",
            additionalProperties: false,
            required: REQUIRED_NON_AUTHORITY_FLAGS,
            properties: Object.fromEntries(
              REQUIRED_NON_AUTHORITY_FLAGS.map((flag) => [flag, { type: "boolean", const: true }])
            )
          }
        }
      },
      confidence: { type: "number" },
      needsClarification: { type: "boolean" },
      ambiguities: {
        type: "array",
        items: { type: "string" }
      },
      notes: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}

const PORTABLE_INTENT_CLASS_SET = new Set(PORTABLE_INTENT_CLASSES);
const INTENT_CLASS_SYNONYMS = new Map([
  ["device_control", "control"],
  ["status", "observe"],
  ["read_only", "observe"],
  ["readonly", "observe"],
  ["read", "observe"]
]);
const CONTROL_ACTION_DEFAULTS = new Map([
  ["turn_off", { desiredState: "off", successCriteria: "Target reports off state." }],
  ["turn_on", { desiredState: "on", successCriteria: "Target reports on state." }]
]);
const ALLOWED_CONSEQUENCE_CLASSES = new Set([
  "reversible_operational",
  "informational",
  "candidate_only",
  "protected_operation"
]);
const ALLOWED_EXECUTION_MODES = new Set(["one_shot", "none"]);
const ALLOWED_RESPONSIVENESS = new Set(["responsive", "deferred"]);
const ALLOWED_SUCCESS_EVIDENCE_TYPES = new Set(["report", "candidate", "none"]);
const ALLOWED_IDEMPOTENCY = new Set(["conditional", "not_applicable"]);
const IDEMPOTENCY_SYNONYMS = new Map([
  ["idempotent", "conditional"],
  ["repeatable", "conditional"]
]);
const ALLOWED_AUDIENCES = new Set(["bounded", "operator"]);
const ALLOWED_AUTHORITY_HINTS = new Set(["none"]);
const ALLOWED_CAPABILITY_HINTS = new Set(["publish_candidate"]);
const GENERIC_ACTION_FAMILY_SET = new Set(GENERIC_ACTION_FAMILIES);
const GENERIC_TARGET_CLASS_SET = new Set(GENERIC_TARGET_CLASSES);
const GENERIC_IDEMPOTENCY_SET = new Set(GENERIC_IDEMPOTENCY_VALUES);
const GENERIC_REVERSIBILITY_SET = new Set(GENERIC_REVERSIBILITY_VALUES);
const GENERIC_NON_AUTHORITY = Object.freeze(
  Object.fromEntries(REQUIRED_NON_AUTHORITY_FLAGS.map((flag) => [flag, true]))
);
const GENERIC_ACTION_SYNONYMS = new Map([
  ["status", "inspect_status"],
  ["show_status", "inspect_status"],
  ["current_status", "inspect_status"],
  ["get_status", "inspect_status"],
  ["read_status", "inspect_status"],
  ["observe", "inspect_status"],
  ["ready", "list_ready_targets"],
  ["list_ready", "list_ready_targets"],
  ["ready_targets", "list_ready_targets"],
  ["whats_ready", "list_ready_targets"],
  ["what_s_ready", "list_ready_targets"],
  ["call_for_response", "call_for_responses"],
  ["request_responses", "call_for_responses"],
  ["collect_responses", "call_for_responses"],
  ["follow_on", "prepare_follow_on_action"],
  ["next_action", "prepare_follow_on_action"],
  ["prepare_next_action", "prepare_follow_on_action"],
  ["review", "review_evidence"],
  ["review_claim", "review_evidence"],
  ["compare", "compare_evidence"],
  ["clarify", "request_clarification"],
  ["ask_clarification", "request_clarification"],
  ["ask_operator", "request_clarification"],
  ["stop", "stop_or_hold"],
  ["hold", "stop_or_hold"],
  ["pause", "stop_or_hold"],
  ["control", "consumer_defined"],
  ["device_control", "consumer_defined"],
  ["turn_on", "consumer_defined"],
  ["turn_off", "consumer_defined"]
]);
const GENERIC_TARGET_CLASS_SYNONYMS = new Map([
  ["repository", "repo"],
  ["pull_request", "issue"],
  ["pr", "issue"],
  ["claim", "evidence"],
  ["file", "document"],
  ["doc", "document"],
  ["operator", "operator_context"],
  ["context", "operator_context"],
  ["unknown_target", "unknown"]
]);
const GENERIC_IDEMPOTENCY_SYNONYMS = new Map([
  ["repeatable", "idempotent"],
  ["read_only", "idempotent"],
  ["readonly", "idempotent"],
  ["not_applicable", "idempotent"],
  ["not_applicable_read", "idempotent"],
  ["not_idempotent", "non_idempotent"],
  ["non-idempotent", "non_idempotent"],
  ["unsafe_repeat", "non_idempotent"]
]);
const GENERIC_REVERSIBILITY_SYNONYMS = new Map([
  ["not_reversible", "irreversible"],
  ["non_reversible", "irreversible"],
  ["unknown_reversibility", "unknown"]
]);

export const GENERIC_CANDIDATE_OUTPUT_SCHEMA = Object.freeze({
  grammarCandidate: {
    schemaVersion: GENERIC_CANDIDATE_SCHEMA_VERSION,
    actionFamily: GENERIC_ACTION_FAMILIES.join("|"),
    targetClass: GENERIC_TARGET_CLASSES.join("|"),
    targetRefs: [],
    confidence: 0,
    ambiguities: [],
    unresolvedFields: [],
    idempotency: GENERIC_IDEMPOTENCY_VALUES.join("|"),
    reversibility: GENERIC_REVERSIBILITY_VALUES.join("|"),
    requiredOperatorDecision: "string optional",
    suggestedConsumerSurface: "string optional",
    nonAuthority: GENERIC_NON_AUTHORITY,
    rawInterpretation: "string",
    parameters: {}
  },
  confidence: 0,
  needsClarification: false,
  ambiguities: [],
  notes: []
});

export const STRUCTURED_OUTPUT_SCHEMA = Object.freeze({
  grammarCandidate: {
    intentClass: PORTABLE_INTENT_CLASSES.join("|"),
    target: {
      actorGroup: "string|null",
      selectedActorIds: [],
      desiredState: "string|null"
    },
    scope: {
      area: "string|null"
    },
    action: "string",
    consequenceClass: "reversible_operational|informational|candidate_only|protected_operation",
    execution: {
      mode: "one_shot|none"
    },
    responsiveness: "responsive|deferred",
    success: {
      evidenceType: "report|candidate|none",
      criteria: "string"
    },
    idempotency: "conditional|not_applicable",
    provenance: {
      source: "translation_provider",
      ingressType: "operator_input"
    },
    audience: "bounded|operator",
    authorityHint: "none",
    capabilityHints: ["publish_candidate"],
    ambiguity: {
      unresolvedFields: []
    },
    parameters: {},
    rawInterpretation: "string"
  },
  confidence: 0,
  needsClarification: false,
  ambiguities: [],
  notes: []
});

const REDACTED_CONTENT_PREFIX_LENGTH = 160;
const COMPACT_CONTEXT_STRING_LIMIT = 240;
const COMPACT_CONTEXT_ARRAY_LIMIT = 8;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateCompactString(value) {
  if (value.length <= COMPACT_CONTEXT_STRING_LIMIT) {
    return value;
  }

  return `${value.slice(0, COMPACT_CONTEXT_STRING_LIMIT)}...`;
}

function compactJsonValue(value, depth = 0) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return truncateCompactString(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, COMPACT_CONTEXT_ARRAY_LIMIT).map((item) => compactJsonValue(item, depth + 1));
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  if (depth >= 2) {
    if (typeof value.id === "string") {
      return { id: truncateCompactString(value.id) };
    }

    if (typeof value.name === "string") {
      return { name: truncateCompactString(value.name) };
    }

    return undefined;
  }

  const compactEntries = Object.entries(value)
    .map(([key, item]) => [key, compactJsonValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined);

  return Object.fromEntries(compactEntries);
}

function buildCompactStructuredContext(context) {
  if (!isPlainObject(context)) {
    return null;
  }

  const compact = {};

  if (context.operatorFocus !== undefined) {
    compact.operatorFocus = compactJsonValue(context.operatorFocus);
  }

  if (Array.isArray(context.activeReferents)) {
    compact.activeReferents = context.activeReferents
      .slice(0, COMPACT_CONTEXT_ARRAY_LIMIT)
      .map((referent) => {
        if (!isPlainObject(referent)) {
          return compactJsonValue(referent);
        }

        return Object.fromEntries(
          ["id", "type", "name", "label", "actorGroup", "selectedActorIds"]
            .filter((key) => referent[key] !== undefined)
            .map((key) => [key, compactJsonValue(referent[key])])
        );
      });
  }

  for (const key of ["ambiguityMarkers", "reasonReferences", "evidenceReferences"]) {
    if (context[key] !== undefined) {
      compact[key] = compactJsonValue(context[key]);
    }
  }

  return Object.keys(compact).length > 0 ? compact : null;
}

export function buildStructuredProviderMessages(request, { structuredGrammarProfile }) {
  const compactContext = buildCompactStructuredContext(request.context);
  const usesGenericCandidate = structuredGrammarProfile === GENERIC_CANDIDATE_SCHEMA_VERSION;
  const schema = JSON.stringify(
    usesGenericCandidate ? GENERIC_CANDIDATE_OUTPUT_SCHEMA : STRUCTURED_OUTPUT_SCHEMA
  );

  if (usesGenericCandidate) {
    return [
      {
        role: "system",
        content: [
          "You translate operator input into a provider-neutral generic candidate interpretation.",
          `Profile: ${structuredGrammarProfile}.`,
          "Return only valid JSON. No markdown. No prose. No code fences. No reasoning. No explanations.",
          `grammarCandidate.schemaVersion must be ${GENERIC_CANDIDATE_SCHEMA_VERSION}.`,
          `actionFamily enum: ${GENERIC_ACTION_FAMILIES.join(", ")}.`,
          `targetClass enum: ${GENERIC_TARGET_CLASSES.join(", ")}.`,
          "Use request_clarification for unclear action, target, or context instead of failing.",
          "Unknown targets must use targetClass unknown, targetRefs [], populated unresolvedFields, and requiredOperatorDecision.",
          `idempotency enum: ${GENERIC_IDEMPOTENCY_VALUES.join(", ")}.`,
          `reversibility enum: ${GENERIC_REVERSIBILITY_VALUES.join(", ")}.`,
          "nonAuthority flags must all be true: doesNotApprove, doesNotExecute, doesNotMutate, doesNotSelectTruth, consumerOwnsAuthority.",
          "Do not approve, execute, mutate, select truth, call tools, or map to consumer-specific commands."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `profile: ${request.profile}`,
          `securityPosture: ${request.securityPosture}`,
          `input: ${extractPrimaryText(request)}`,
          `context: ${compactContext ? JSON.stringify(compactContext) : "none"}`,
          `schema: ${schema}`
        ].join("\n")
      }
    ];
  }

  return [
    {
      role: "system",
      content: [
        "You translate operator input into a provider-neutral portable grammar candidate.",
        `Profile: ${structuredGrammarProfile}.`,
        "Return only valid JSON. No markdown. No prose. No code fences. No reasoning. No explanations.",
        `intentClass enum: ${PORTABLE_INTENT_CLASSES.join(", ")}.`,
        "target must be an object. Do not invent selectedActorIds.",
        "scope must be an object or null, never a string.",
        "Yard-lights example: target {\"actorGroup\":\"yard_lights\",\"selectedActorIds\":[],\"desiredState\":\"off\"}; scope {\"area\":\"yard\"}; idempotency \"conditional\".",
        "authorityHint must be none. capabilityHints must contain only publish_candidate."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `profile: ${request.profile}`,
        `securityPosture: ${request.securityPosture}`,
        `input: ${extractPrimaryText(request)}`,
        `context: ${compactContext ? JSON.stringify(compactContext) : "none"}`,
        `schema: ${schema}`
      ].join("\n")
    }
  ];
}

export function buildStructuredProviderPrompt(request, options) {
  return buildStructuredProviderMessages(request, options)
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function createInvalidStructuredResponseError(provider, message) {
  return createProviderInvalidResponseError(provider, `Provider structured response invalid: ${message}`);
}

function assertString(value, path, provider) {
  if (typeof value !== "string") {
    throw createInvalidStructuredResponseError(provider, `${path} must be a string.`);
  }
}

function assertNonEmptyString(value, path, provider) {
  assertString(value, path, provider);

  if (value.trim().length === 0) {
    throw createInvalidStructuredResponseError(provider, `${path} must be a non-empty string.`);
  }
}

function normalizeIntentToken(value) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeIntentClass(grammarCandidate, provider) {
  if (grammarCandidate.intentClass !== undefined) {
    assertNonEmptyString(grammarCandidate.intentClass, "grammarCandidate.intentClass", provider);
    const intentClass = normalizeIntentToken(grammarCandidate.intentClass);

    if (PORTABLE_INTENT_CLASS_SET.has(intentClass)) {
      return {
        intentClass,
        rawIntentClass: grammarCandidate.intentClass,
        normalizedFrom: grammarCandidate.intentClass === intentClass ? null : "intentClass"
      };
    }

    if (INTENT_CLASS_SYNONYMS.has(intentClass)) {
      return {
        intentClass: INTENT_CLASS_SYNONYMS.get(intentClass),
        rawIntentClass: grammarCandidate.intentClass,
        normalizedFrom: "intentClass"
      };
    }

    throw createInvalidStructuredResponseError(
      provider,
      `grammarCandidate.intentClass must be one of: ${PORTABLE_INTENT_CLASSES.join(", ")}.`
    );
  }

  if (grammarCandidate.intent !== undefined) {
    assertNonEmptyString(grammarCandidate.intent, "grammarCandidate.intent", provider);
    const intent = normalizeIntentToken(grammarCandidate.intent);

    if (INTENT_CLASS_SYNONYMS.has(intent)) {
      return {
        intentClass: INTENT_CLASS_SYNONYMS.get(intent),
        rawIntentClass: grammarCandidate.intent,
        normalizedFrom: "intent"
      };
    }
  }

  throw createInvalidStructuredResponseError(provider, "grammarCandidate.intentClass is required.");
}

function normalizeStableTargetId(value) {
  if (value === null) {
    return null;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeAction(value, provider) {
  const action = normalizeIntentToken(value);

  if (action.length === 0) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.action must be a non-empty string.");
  }

  return action;
}

function readOptionalString(value, path, provider) {
  if (value === undefined || value === null) {
    return null;
  }

  assertNonEmptyString(value, path, provider);
  return value;
}

function normalizeStringEnum(value, { path, allowed, fallback, provider }) {
  if (value === undefined || value === null) {
    return fallback;
  }

  assertNonEmptyString(value, path, provider);
  const normalized = normalizeIntentToken(value);

  if (!allowed.has(normalized)) {
    throw createInvalidStructuredResponseError(
      provider,
      `${path} must be one of: ${Array.from(allowed).join(", ")}.`
    );
  }

  return normalized;
}

function normalizeIdempotency(value, provider) {
  if (value === undefined || value === null) {
    return "conditional";
  }

  assertNonEmptyString(value, "grammarCandidate.idempotency", provider);
  const normalized = normalizeIntentToken(value);

  if (IDEMPOTENCY_SYNONYMS.has(normalized)) {
    return IDEMPOTENCY_SYNONYMS.get(normalized);
  }

  if (ALLOWED_IDEMPOTENCY.has(normalized)) {
    return normalized;
  }

  throw createInvalidStructuredResponseError(
    provider,
    `grammarCandidate.idempotency must be one of: ${Array.from(ALLOWED_IDEMPOTENCY).join(", ")}.`
  );
}

function assertStringArray(value, path, provider) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createInvalidStructuredResponseError(provider, `${path} must be an array of strings.`);
  }
}

function normalizeStringArray(value, { path, fallback = [], provider }) {
  if (value === undefined || value === null) {
    return fallback;
  }

  assertStringArray(value, path, provider);
  return value;
}

function normalizeScope(value, provider) {
  if (value === undefined || value === null) {
    return {
      scope: null,
      normalizedFrom: null
    };
  }

  if (typeof value === "string") {
    const area = normalizeStableTargetId(value);

    if (area.length === 0) {
      throw createInvalidStructuredResponseError(
        provider,
        "grammarCandidate.scope must be an object or null."
      );
    }

    return {
      scope: {
        area
      },
      normalizedFrom: "string"
    };
  }

  if (!isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.scope must be an object or null.");
  }

  return {
    scope: compactJsonValue(value),
    normalizedFrom: null
  };
}

function normalizeTarget(value, { action, provider }) {
  const actionDefaults = CONTROL_ACTION_DEFAULTS.get(action);

  if (typeof value === "string") {
    const actorGroup = normalizeStableTargetId(value);

    if (actorGroup.length === 0) {
      throw createInvalidStructuredResponseError(
        provider,
        "grammarCandidate.target must resolve to a non-empty object."
      );
    }

    return {
      target: {
        actorGroup,
        selectedActorIds: [],
        ...(actionDefaults ? { desiredState: actionDefaults.desiredState } : {})
      },
      normalizedFrom: "string"
    };
  }

  if (!isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.target must be an object.");
  }

  const actorGroup =
    value.actorGroup === undefined || value.actorGroup === null
      ? null
      : normalizeStableTargetId(value.actorGroup);

  if (actorGroup !== null && actorGroup.length === 0) {
    throw createInvalidStructuredResponseError(
      provider,
      "grammarCandidate.target.actorGroup must be a non-empty string or null."
    );
  }

  const selectedActorIds = normalizeStringArray(value.selectedActorIds, {
    path: "grammarCandidate.target.selectedActorIds",
    fallback: [],
    provider
  });
  const desiredState = readOptionalString(
    value.desiredState ?? actionDefaults?.desiredState,
    "grammarCandidate.target.desiredState",
    provider
  );

  return {
    target: {
      actorGroup,
      selectedActorIds,
      ...(desiredState !== null ? { desiredState } : {})
    },
    normalizedFrom: null
  };
}

function normalizeExecution(value, provider) {
  if (value === undefined || value === null) {
    return { mode: "one_shot" };
  }

  if (!isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.execution must be an object.");
  }

  return {
    mode: normalizeStringEnum(value.mode, {
      path: "grammarCandidate.execution.mode",
      allowed: ALLOWED_EXECUTION_MODES,
      fallback: "one_shot",
      provider
    })
  };
}

function normalizeSuccess(value, { action, provider }) {
  const actionDefaults = CONTROL_ACTION_DEFAULTS.get(action);

  if (value !== undefined && value !== null && !isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.success must be an object.");
  }

  const success = value ?? {};

  return {
    evidenceType: normalizeStringEnum(success.evidenceType, {
      path: "grammarCandidate.success.evidenceType",
      allowed: ALLOWED_SUCCESS_EVIDENCE_TYPES,
      fallback: "report",
      provider
    }),
    criteria:
      readOptionalString(success.criteria, "grammarCandidate.success.criteria", provider) ??
      actionDefaults?.successCriteria ??
      "Target reports requested state."
  };
}

function normalizeProvenance(value, provider) {
  if (value !== undefined && value !== null && !isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.provenance must be an object.");
  }

  const provenance = value ?? {};

  if (provenance.source !== undefined && provenance.source !== "translation_provider") {
    throw createInvalidStructuredResponseError(
      provider,
      "grammarCandidate.provenance.source must be translation_provider."
    );
  }

  if (provenance.ingressType !== undefined && provenance.ingressType !== "operator_input") {
    throw createInvalidStructuredResponseError(
      provider,
      "grammarCandidate.provenance.ingressType must be operator_input."
    );
  }

  return {
    source: "translation_provider",
    ingressType: "operator_input"
  };
}

function normalizeAmbiguity(value, provider) {
  if (value === undefined || value === null) {
    return {
      unresolvedFields: []
    };
  }

  if (!isPlainObject(value)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.ambiguity must be an object.");
  }

  return {
    unresolvedFields: normalizeStringArray(value.unresolvedFields, {
      path: "grammarCandidate.ambiguity.unresolvedFields",
      fallback: [],
      provider
    })
  };
}

function normalizeGenericToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeGenericStringArray(value, { path, fallback = [], provider }) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 ? [value] : fallback;
  }

  assertStringArray(value, path, provider);
  return value;
}

function normalizeGenericActionFamily(value, provider) {
  if (value === undefined || value === null) {
    return {
      actionFamily: "request_clarification",
      unresolvedField: "actionFamily",
      ambiguity: "The requested action family was not clear."
    };
  }

  assertNonEmptyString(value, "grammarCandidate.actionFamily", provider);
  const normalized = normalizeGenericToken(value);

  if (GENERIC_ACTION_FAMILY_SET.has(normalized)) {
    return { actionFamily: normalized };
  }

  if (GENERIC_ACTION_SYNONYMS.has(normalized)) {
    return {
      actionFamily: GENERIC_ACTION_SYNONYMS.get(normalized),
      rawActionFamily: value,
      normalizedFrom: "actionFamily"
    };
  }

  return {
    actionFamily: "request_clarification",
    rawActionFamily: value,
    normalizedFrom: "actionFamily",
    unresolvedField: "actionFamily",
    ambiguity: `Unsupported action family "${value}" requires consumer clarification.`
  };
}

function normalizeGenericTargetClass(value, provider) {
  if (value === undefined || value === null) {
    return {
      targetClass: "unknown",
      unresolvedField: "targetClass",
      ambiguity: "The target class was not clear."
    };
  }

  assertNonEmptyString(value, "grammarCandidate.targetClass", provider);
  const normalized = normalizeGenericToken(value);

  if (GENERIC_TARGET_CLASS_SET.has(normalized)) {
    return { targetClass: normalized };
  }

  if (GENERIC_TARGET_CLASS_SYNONYMS.has(normalized)) {
    return {
      targetClass: GENERIC_TARGET_CLASS_SYNONYMS.get(normalized),
      rawTargetClass: value,
      normalizedFrom: "targetClass"
    };
  }

  return {
    targetClass: "unknown",
    rawTargetClass: value,
    normalizedFrom: "targetClass",
    unresolvedField: "targetClass",
    ambiguity: `Unsupported target class "${value}" requires consumer clarification.`
  };
}

function normalizeGenericIdempotency(value, { actionFamily, provider }) {
  if (value === undefined || value === null) {
    return ["inspect_status", "list_ready_targets", "review_evidence", "compare_evidence", "request_clarification", "stop_or_hold"].includes(actionFamily)
      ? "idempotent"
      : "conditional";
  }

  assertNonEmptyString(value, "grammarCandidate.idempotency", provider);
  const normalized = normalizeGenericToken(value);

  if (GENERIC_IDEMPOTENCY_SYNONYMS.has(normalized)) {
    return GENERIC_IDEMPOTENCY_SYNONYMS.get(normalized);
  }

  if (GENERIC_IDEMPOTENCY_SET.has(normalized)) {
    return normalized;
  }

  throw createInvalidStructuredResponseError(
    provider,
    `grammarCandidate.idempotency must be one of: ${GENERIC_IDEMPOTENCY_VALUES.join(", ")}.`
  );
}

function normalizeGenericReversibility(value, { actionFamily, provider }) {
  if (value === undefined || value === null) {
    return actionFamily === "consumer_defined" ? "unknown" : "reversible";
  }

  assertNonEmptyString(value, "grammarCandidate.reversibility", provider);
  const normalized = normalizeGenericToken(value);

  if (GENERIC_REVERSIBILITY_SYNONYMS.has(normalized)) {
    return GENERIC_REVERSIBILITY_SYNONYMS.get(normalized);
  }

  if (GENERIC_REVERSIBILITY_SET.has(normalized)) {
    return normalized;
  }

  throw createInvalidStructuredResponseError(
    provider,
    `grammarCandidate.reversibility must be one of: ${GENERIC_REVERSIBILITY_VALUES.join(", ")}.`
  );
}

function normalizeGenericTargetRefs(value, provider) {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string") {
    const label = value.trim();
    return label ? [{ label }] : [];
  }

  if (!Array.isArray(value)) {
    return [compactJsonValue(value)].filter((item) => item !== undefined);
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label ? { label } : null;
      }

      const compact = compactJsonValue(item);
      return compact === undefined ? null : compact;
    })
    .filter((item) => item !== null);
}

function normalizeGenericNonAuthority(value, provider) {
  if (value !== undefined && value !== null) {
    if (!isPlainObject(value)) {
      throw createInvalidStructuredResponseError(provider, "grammarCandidate.nonAuthority must be an object.");
    }

    for (const flag of REQUIRED_NON_AUTHORITY_FLAGS) {
      if (value[flag] !== undefined && value[flag] !== true) {
        throw createInvalidStructuredResponseError(
          provider,
          `grammarCandidate.nonAuthority.${flag} must be true.`
        );
      }
    }
  }

  return { ...GENERIC_NON_AUTHORITY };
}

function assertNoGenericAuthorityClaims(grammarCandidate, provider) {
  const blockedFields = [
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
  ];

  for (const field of blockedFields) {
    if (grammarCandidate[field] !== undefined) {
      throw createInvalidStructuredResponseError(
        provider,
        `grammarCandidate.${field} is not allowed on generic candidates.`
      );
    }
  }
}

function readGenericConfidence(parsed, grammarCandidate, provider) {
  const confidence = grammarCandidate.confidence ?? parsed.confidence;

  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw createInvalidStructuredResponseError(provider, "confidence must be a number between 0 and 1.");
  }

  return confidence;
}

function readOptionalGenericString(value, path, provider) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  assertNonEmptyString(value, path, provider);
  return value;
}

export function normalizeGenericCandidate({ parsed, request, provider, templateId, structuredGrammarProfile }) {
  const rawCandidate = parsed.grammarCandidate;
  assertNoGenericAuthorityClaims(rawCandidate, provider);

  const action = normalizeGenericActionFamily(
    rawCandidate.actionFamily ?? rawCandidate.action ?? rawCandidate.intentClass ?? rawCandidate.intent,
    provider
  );
  const targetClass = normalizeGenericTargetClass(
    rawCandidate.targetClass ?? rawCandidate.targetType,
    provider
  );
  let actionFamily = action.actionFamily;
  const targetRefs = normalizeGenericTargetRefs(rawCandidate.targetRefs ?? rawCandidate.target, provider);
  const confidence = readGenericConfidence(parsed, rawCandidate, provider);
  const ambiguities = normalizeGenericStringArray(rawCandidate.ambiguities ?? parsed.ambiguities, {
    path: "grammarCandidate.ambiguities",
    fallback: [],
    provider
  });
  const unresolvedFields = normalizeGenericStringArray(rawCandidate.unresolvedFields, {
    path: "grammarCandidate.unresolvedFields",
    fallback: [],
    provider
  });
  const notes = normalizeGenericStringArray(parsed.notes, {
    path: "notes",
    fallback: [],
    provider
  });

  if (action.unresolvedField && !unresolvedFields.includes(action.unresolvedField)) {
    unresolvedFields.push(action.unresolvedField);
  }

  if (targetClass.unresolvedField && !unresolvedFields.includes(targetClass.unresolvedField)) {
    unresolvedFields.push(targetClass.unresolvedField);
  }

  for (const ambiguity of [action.ambiguity, targetClass.ambiguity]) {
    if (ambiguity && !ambiguities.includes(ambiguity)) {
      ambiguities.push(ambiguity);
    }
  }

  if (targetClass.targetClass === "unknown") {
    if (!unresolvedFields.includes("targetRefs")) {
      unresolvedFields.push("targetRefs");
    }

    if (actionFamily === "consumer_defined") {
      actionFamily = "request_clarification";
    }
  }

  const needsClarification =
    parsed.needsClarification === true ||
    actionFamily === "request_clarification" ||
    targetClass.targetClass === "unknown" ||
    unresolvedFields.length > 0;

  if (parsed.needsClarification !== undefined && typeof parsed.needsClarification !== "boolean") {
    throw createInvalidStructuredResponseError(provider, "needsClarification must be a boolean.");
  }

  let requiredOperatorDecision = readOptionalGenericString(
    rawCandidate.requiredOperatorDecision,
    "grammarCandidate.requiredOperatorDecision",
    provider
  );
  const suggestedConsumerSurface = readOptionalGenericString(
    rawCandidate.suggestedConsumerSurface,
    "grammarCandidate.suggestedConsumerSurface",
    provider
  );

  if (!requiredOperatorDecision && targetClass.targetClass === "unknown") {
    requiredOperatorDecision = "Clarify the intended target or context before any consumer maps this candidate.";
  }

  if (!requiredOperatorDecision && actionFamily === "request_clarification") {
    requiredOperatorDecision = "Clarify the intended action before any consumer maps this candidate.";
  }

  const candidate = {
    version: "v1",
    profile: request.profile,
    sourceText: extractPrimaryText(request),
    template: templateId,
    continuity: request.continuity ?? null,
    context: request.context ?? null,
    schemaVersion: GENERIC_CANDIDATE_SCHEMA_VERSION,
    actionFamily,
    targetClass: targetClass.targetClass,
    targetRefs: targetClass.targetClass === "unknown" ? [] : targetRefs,
    confidence,
    ambiguities,
    unresolvedFields,
    idempotency: normalizeGenericIdempotency(rawCandidate.idempotency, { actionFamily, provider }),
    reversibility: normalizeGenericReversibility(rawCandidate.reversibility, { actionFamily, provider }),
    ...(requiredOperatorDecision ? { requiredOperatorDecision } : {}),
    ...(suggestedConsumerSurface ? { suggestedConsumerSurface } : {}),
    nonAuthority: normalizeGenericNonAuthority(rawCandidate.nonAuthority, provider),
    rawInterpretation:
      readOptionalGenericString(rawCandidate.rawInterpretation, "grammarCandidate.rawInterpretation", provider) ??
      extractPrimaryText(request),
    parameters: isPlainObject(rawCandidate.parameters) ? rawCandidate.parameters : {},
    metadata: {
      structured: true,
      structuredGrammarProfile,
      rawGrammarCandidate: rawCandidate,
      ...(action.normalizedFrom
        ? {
            normalizedActionFamilyFrom: action.normalizedFrom,
            rawActionFamily: action.rawActionFamily
          }
        : {}),
      ...(targetClass.normalizedFrom
        ? {
            normalizedTargetClassFrom: targetClass.normalizedFrom,
            rawTargetClass: targetClass.rawTargetClass
          }
        : {})
    }
  };

  validateGenericCandidate(candidate);

  return {
    grammarCandidate: candidate,
    confidence,
    ambiguities,
    needsClarification,
    notes
  };
}

function createRedactedContentPrefix(content) {
  return content
    .slice(0, REDACTED_CONTENT_PREFIX_LENGTH)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/VENICE_[A-Z0-9_]+_[A-Za-z0-9._~+/=-]+/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9._~+/=-]+/g, "sk-[REDACTED]");
}

export function parseStructuredProviderOutput({
  content,
  request,
  provider,
  model,
  latency,
  templateId,
  structuredGrammarProfile,
  contentPath = "message.content"
}) {
  const output = typeof content === "string" ? content.trim() : "";

  if (!output) {
    throw createInvalidStructuredResponseError(provider, `${contentPath} must contain JSON output.`);
  }

  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw createInvalidStructuredResponseError(
      provider,
      `${contentPath} must be valid JSON. contentPrefix=${JSON.stringify(createRedactedContentPrefix(output))}.`
    );
  }

  if (!isPlainObject(parsed)) {
    throw createInvalidStructuredResponseError(provider, "top-level output must be an object.");
  }

  if (!isPlainObject(parsed.grammarCandidate)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate must be an object.");
  }

  const usesGenericCandidate =
    parsed.grammarCandidate.schemaVersion === GENERIC_CANDIDATE_SCHEMA_VERSION ||
    parsed.grammarCandidate.actionFamily !== undefined ||
    (structuredGrammarProfile === GENERIC_CANDIDATE_SCHEMA_VERSION &&
      parsed.grammarCandidate.intentClass === undefined &&
      parsed.grammarCandidate.intent === undefined);

  if (usesGenericCandidate) {
    const normalized = normalizeGenericCandidate({
      parsed,
      request,
      provider,
      templateId,
      structuredGrammarProfile
    });

    return validateTranslationResult({
      ...normalized,
      providerInfo: {
        provider,
        model,
        latency
      }
    });
  }

  const normalizedIntent = normalizeIntentClass(parsed.grammarCandidate, provider);

  if (parsed.grammarCandidate.target === undefined) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.target must be an object.");
  }

  const normalizedScope = normalizeScope(parsed.grammarCandidate.scope, provider);
  assertNonEmptyString(parsed.grammarCandidate.action, "grammarCandidate.action", provider);
  const action = normalizeAction(parsed.grammarCandidate.action, provider);

  if (normalizedIntent.intentClass === "control" && !CONTROL_ACTION_DEFAULTS.has(action)) {
    throw createInvalidStructuredResponseError(
      provider,
      "grammarCandidate.action is not a supported control action."
    );
  }

  if (!isPlainObject(parsed.grammarCandidate.parameters)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.parameters must be an object.");
  }

  assertNonEmptyString(
    parsed.grammarCandidate.rawInterpretation,
    "grammarCandidate.rawInterpretation",
    provider
  );

  const normalizedTarget = normalizeTarget(parsed.grammarCandidate.target, { action, provider });
  const ambiguity = normalizeAmbiguity(parsed.grammarCandidate.ambiguity, provider);

  if (
    normalizedIntent.intentClass === "control" &&
    normalizedTarget.target.selectedActorIds.length === 0 &&
    !ambiguity.unresolvedFields.includes("target.selectedActorIds")
  ) {
    ambiguity.unresolvedFields.push("target.selectedActorIds");
  }

  const consequenceClass = normalizeStringEnum(parsed.grammarCandidate.consequenceClass, {
    path: "grammarCandidate.consequenceClass",
    allowed: ALLOWED_CONSEQUENCE_CLASSES,
    fallback: normalizedIntent.intentClass === "control" ? "reversible_operational" : "candidate_only",
    provider
  });
  const execution = normalizeExecution(parsed.grammarCandidate.execution, provider);
  const responsiveness = normalizeStringEnum(parsed.grammarCandidate.responsiveness, {
    path: "grammarCandidate.responsiveness",
    allowed: ALLOWED_RESPONSIVENESS,
    fallback: "responsive",
    provider
  });
  const success = normalizeSuccess(parsed.grammarCandidate.success, { action, provider });
  const idempotency = normalizeIdempotency(parsed.grammarCandidate.idempotency, provider);
  const provenance = normalizeProvenance(parsed.grammarCandidate.provenance, provider);
  const audience = normalizeStringEnum(parsed.grammarCandidate.audience, {
    path: "grammarCandidate.audience",
    allowed: ALLOWED_AUDIENCES,
    fallback: "bounded",
    provider
  });
  const authorityHint = normalizeStringEnum(parsed.grammarCandidate.authorityHint, {
    path: "grammarCandidate.authorityHint",
    allowed: ALLOWED_AUTHORITY_HINTS,
    fallback: "none",
    provider
  });
  const capabilityHints = normalizeStringArray(parsed.grammarCandidate.capabilityHints, {
    path: "grammarCandidate.capabilityHints",
    fallback: ["publish_candidate"],
    provider
  });

  if (capabilityHints.some((hint) => !ALLOWED_CAPABILITY_HINTS.has(hint))) {
    throw createInvalidStructuredResponseError(
      provider,
      `grammarCandidate.capabilityHints must contain only: ${Array.from(ALLOWED_CAPABILITY_HINTS).join(", ")}.`
    );
  }

  if (
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    throw createInvalidStructuredResponseError(provider, "confidence must be a number between 0 and 1.");
  }

  if (typeof parsed.needsClarification !== "boolean") {
    throw createInvalidStructuredResponseError(provider, "needsClarification must be a boolean.");
  }

  assertStringArray(parsed.ambiguities, "ambiguities", provider);
  assertStringArray(parsed.notes, "notes", provider);

  return validateTranslationResult({
    grammarCandidate: {
      version: "v1",
      profile: request.profile,
      sourceText: extractPrimaryText(request),
      template: templateId,
      continuity: request.continuity ?? null,
      context: request.context ?? null,
      intentClass: normalizedIntent.intentClass,
      target: normalizedTarget.target,
      ...(normalizedScope.scope !== null ? { scope: normalizedScope.scope } : {}),
      action,
      consequenceClass,
      execution,
      responsiveness,
      success,
      idempotency,
      provenance,
      audience,
      authorityHint,
      capabilityHints,
      ambiguity,
      parameters: parsed.grammarCandidate.parameters,
      rawInterpretation: parsed.grammarCandidate.rawInterpretation,
      metadata: {
        structured: true,
        structuredGrammarProfile,
        rawGrammarCandidate: parsed.grammarCandidate,
        ...(normalizedTarget.normalizedFrom ? { normalizedTargetFrom: normalizedTarget.normalizedFrom } : {}),
        ...(normalizedScope.normalizedFrom ? { normalizedScopeFrom: normalizedScope.normalizedFrom } : {}),
        ...(normalizedIntent.normalizedFrom
          ? {
              normalizedIntentClassFrom: normalizedIntent.normalizedFrom,
              rawIntentClass: normalizedIntent.rawIntentClass
            }
          : {})
      }
    },
    confidence: parsed.confidence,
    ambiguities: parsed.ambiguities,
    needsClarification: parsed.needsClarification,
    notes: parsed.notes,
    providerInfo: {
      provider,
      model,
      latency
    }
  });
}
