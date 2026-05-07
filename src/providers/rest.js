import {
  ProviderAdapter,
  buildPrompt,
  buildTranslationResult,
  extractPrimaryText,
  readErrorBody
} from "./base.js";
import { validateTranslationRequest, validateTranslationResult } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { normalizeProviderText } from "../normalize/index.js";
import { executeWithRequestControl } from "./runtime.js";

export const DEFAULT_REST_MAX_TOKENS = 512;
export const DEFAULT_REST_TEMPERATURE = 0.2;
export const DEFAULT_REST_RESPONSE_FORMAT = Object.freeze({ type: "json_object" });
export const DEFAULT_REST_STRUCTURED_GRAMMAR_PROFILE = "portable_v1";
export const REST_STRUCTURED_GRAMMAR_PROFILES = Object.freeze(["portable_v1", "edge_v1"]);
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

const PORTABLE_INTENT_CLASS_SET = new Set(PORTABLE_INTENT_CLASSES);
const INTENT_CLASS_SYNONYMS = new Map([
  ["device_control", "control"],
  ["status", "observe"],
  ["read_only", "observe"],
  ["readonly", "observe"],
  ["read", "observe"]
]);
const CONTROL_ACTION_DEFAULTS = new Map([
  [
    "turn_off",
    {
      desiredState: "off",
      successCriteria: "Target reports off state."
    }
  ],
  [
    "turn_on",
    {
      desiredState: "on",
      successCriteria: "Target reports on state."
    }
  ]
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
const ALLOWED_IDEMPOTENCY = new Set(["conditional", "idempotent", "not_applicable"]);
const ALLOWED_AUDIENCES = new Set(["bounded", "operator"]);
const ALLOWED_AUTHORITY_HINTS = new Set(["none"]);
const ALLOWED_CAPABILITY_HINTS = new Set(["publish_candidate"]);

const BLOCKED_EXTRA_BODY_FIELDS = new Set([
  "function_call",
  "functions",
  "max_tokens",
  "messages",
  "model",
  "response_format",
  "stream",
  "temperature",
  "tool_choice",
  "tools"
]);

const STRUCTURED_OUTPUT_SCHEMA = Object.freeze({
  grammarCandidate: {
    intentClass: PORTABLE_INTENT_CLASSES.join("|"),
    target: {
      actorGroup: "string|null",
      selectedActorIds: [],
      desiredState: "string|null"
    },
    scope: "string|null",
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
    idempotency: "conditional|idempotent|not_applicable",
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

function flattenContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item?.type === "text" && typeof item.text === "string") {
        return item.text;
      }

      if (typeof item?.text === "string") {
        return item.text;
      }

      return "";
    })
    .join("\n")
    .trim();
}

function extractInterpretation(payload, { allowReasoningContentFallback = false } = {}) {
  const choice = payload?.choices?.[0];
  const directContent = flattenContent(choice?.message?.content);

  if (directContent) {
    return directContent;
  }

  if (!allowReasoningContentFallback) {
    return "";
  }

  const reasoningContent = flattenContent(choice?.message?.reasoning_content ?? choice?.reasoning_content);

  if (reasoningContent) {
    return reasoningContent;
  }

  return "";
}

function readMaxTokens(options) {
  const configured =
    options.maxTokens ?? options.max_tokens ?? process.env.REST_MAX_TOKENS ?? DEFAULT_REST_MAX_TOKENS;
  const parsed = Number(configured);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_REST_MAX_TOKENS;
  }

  return parsed;
}

function readTemperature(options) {
  const configured = options.temperature ?? process.env.REST_TEMPERATURE ?? DEFAULT_REST_TEMPERATURE;
  const parsed = Number(configured);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_REST_TEMPERATURE;
  }

  return parsed;
}

function readExtraBodyFields(options) {
  const extraBodyFields = options.extraBodyFields ?? {};

  if (!extraBodyFields || typeof extraBodyFields !== "object" || Array.isArray(extraBodyFields)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(extraBodyFields).filter(([key]) => !BLOCKED_EXTRA_BODY_FIELDS.has(key))
  );
}

function readStructuredOutput(options) {
  if (options.structuredOutput !== undefined) {
    return options.structuredOutput !== false;
  }

  if (process.env.REST_STRUCTURED_OUTPUT !== undefined) {
    return process.env.REST_STRUCTURED_OUTPUT !== "false";
  }

  return true;
}

function readResponseFormat(options) {
  const configured = options.responseFormat ?? readResponseFormatEnv();

  if (configured === undefined) {
    return DEFAULT_REST_RESPONSE_FORMAT;
  }

  if (!isPlainObject(configured)) {
    return DEFAULT_REST_RESPONSE_FORMAT;
  }

  if (configured.type === "json_object") {
    return { type: "json_object" };
  }

  if (configured.type === "json_schema" && isPlainObject(configured.json_schema)) {
    return {
      type: "json_schema",
      json_schema: configured.json_schema
    };
  }

  return DEFAULT_REST_RESPONSE_FORMAT;
}

function readResponseFormatEnv() {
  if (!process.env.REST_RESPONSE_FORMAT) {
    return undefined;
  }

  try {
    return JSON.parse(process.env.REST_RESPONSE_FORMAT);
  } catch {
    return undefined;
  }
}

function readStructuredGrammarProfile(options) {
  const configured =
    options.structuredGrammarProfile ??
    process.env.REST_STRUCTURED_GRAMMAR_PROFILE ??
    DEFAULT_REST_STRUCTURED_GRAMMAR_PROFILE;

  return REST_STRUCTURED_GRAMMAR_PROFILES.includes(configured)
    ? configured
    : DEFAULT_REST_STRUCTURED_GRAMMAR_PROFILE;
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

function buildStructuredRestMessages(request, { structuredGrammarProfile }) {
  const compactContext = buildCompactStructuredContext(request.context);
  const schema = JSON.stringify(STRUCTURED_OUTPUT_SCHEMA);

  return [
    {
      role: "system",
      content: [
        "You translate operator input into a provider-neutral portable grammar candidate.",
        `Profile: ${structuredGrammarProfile}.`,
        "Return only valid JSON. No markdown. No prose. No code fences. No reasoning. No explanations.",
        `intentClass enum: ${PORTABLE_INTENT_CLASSES.join(", ")}.`,
        "target must be an object. Do not invent selectedActorIds.",
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

function buildRestMessages(prompt, { structuredOutput, structuredGrammarProfile, request }) {
  if (!structuredOutput) {
    return [
      {
        role: "system",
        content: prompt.system
      },
      {
        role: "user",
        content: prompt.user
      }
    ];
  }

  return buildStructuredRestMessages(request, { structuredGrammarProfile });
}

function createInvalidStructuredResponseError(provider, message) {
  return createProviderInvalidResponseError(provider, `REST provider structured response invalid: ${message}`);
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

function assertNullableString(value, path, provider) {
  if (value !== null && typeof value !== "string") {
    throw createInvalidStructuredResponseError(provider, `${path} must be a string or null.`);
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

function normalizeStringArray(value, { path, fallback = [], provider }) {
  if (value === undefined || value === null) {
    return fallback;
  }

  assertStringArray(value, path, provider);
  return value;
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

  if (
    provenance.source !== undefined &&
    provenance.source !== "translation_provider"
  ) {
    throw createInvalidStructuredResponseError(
      provider,
      "grammarCandidate.provenance.source must be translation_provider."
    );
  }

  if (
    provenance.ingressType !== undefined &&
    provenance.ingressType !== "operator_input"
  ) {
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

function assertStringArray(value, path, provider) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createInvalidStructuredResponseError(provider, `${path} must be an array of strings.`);
  }
}

function createRedactedContentPrefix(content) {
  return content
    .slice(0, REDACTED_CONTENT_PREFIX_LENGTH)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/VENICE_[A-Z0-9_]+_[A-Za-z0-9._~+/=-]+/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9._~+/=-]+/g, "sk-[REDACTED]");
}

function parseStructuredOutput({
  payload,
  request,
  provider,
  model,
  latency,
  prompt,
  structuredGrammarProfile
}) {
  const content = flattenContent(payload?.choices?.[0]?.message?.content);

  if (!content) {
    throw createInvalidStructuredResponseError(provider, "message.content must contain JSON output.");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw createInvalidStructuredResponseError(
      provider,
      `message.content must be valid JSON. contentPrefix=${JSON.stringify(createRedactedContentPrefix(content))}.`
    );
  }

  if (!isPlainObject(parsed)) {
    throw createInvalidStructuredResponseError(provider, "top-level output must be an object.");
  }

  if (!isPlainObject(parsed.grammarCandidate)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate must be an object.");
  }

  const normalizedIntent = normalizeIntentClass(parsed.grammarCandidate, provider);
  if (parsed.grammarCandidate.target === undefined) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.target must be an object.");
  }

  const scope = readOptionalString(parsed.grammarCandidate.scope, "grammarCandidate.scope", provider);
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

  const normalizedTarget = normalizeTarget(parsed.grammarCandidate.target, {
    action,
    provider
  });
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
  const success = normalizeSuccess(parsed.grammarCandidate.success, {
    action,
    provider
  });
  const idempotency = normalizeStringEnum(parsed.grammarCandidate.idempotency, {
    path: "grammarCandidate.idempotency",
    allowed: ALLOWED_IDEMPOTENCY,
    fallback: "conditional",
    provider
  });
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
      template: prompt.templateId,
      continuity: request.continuity ?? null,
      context: request.context ?? null,
      intentClass: normalizedIntent.intentClass,
      target: normalizedTarget.target,
      scope,
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
        ...(normalizedTarget.normalizedFrom
          ? {
              normalizedTargetFrom: normalizedTarget.normalizedFrom
            }
          : {}),
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

export class RestProvider extends ProviderAdapter {
  constructor(options = {}) {
    super({
      name: "rest",
      model: options.model ?? process.env.REST_MODEL ?? "",
      kind: "remote"
    });

    this.baseUrl = options.baseUrl ?? process.env.REST_BASE_URL ?? "";
    this.apiKey = options.apiKey ?? process.env.REST_API_KEY ?? "";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxTokens = readMaxTokens(options);
    this.temperature = readTemperature(options);
    this.extraBodyFields = readExtraBodyFields(options);
    this.structuredOutput = readStructuredOutput(options);
    this.responseFormat = readResponseFormat(options);
    this.structuredGrammarProfile = readStructuredGrammarProfile(options);
    this.allowReasoningContentFallback = options.allowReasoningContentFallback === true;
  }

  async isAvailable() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async translate(request) {
    validateTranslationRequest(request);

    if (!(await this.isAvailable())) {
      throw createProviderUnavailableError(
        this.name,
        "REST provider requires REST_BASE_URL, REST_API_KEY, and REST_MODEL."
      );
    }

    return executeWithRequestControl({
      provider: this.name,
      request,
      operation: async ({ signal }) => {
        const prompt = buildPrompt(request);
        const startedAt = performance.now();
        let response;

        try {
          const body = {
            model: this.model,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            messages: buildRestMessages(prompt, {
              structuredOutput: this.structuredOutput,
              structuredGrammarProfile: this.structuredGrammarProfile,
              request
            }),
            ...(this.structuredOutput ? { response_format: this.responseFormat } : {}),
            ...this.extraBodyFields
          };

          response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal
          });
        } catch (error) {
          if (isProviderError(error)) {
            throw error;
          }

          throw createProviderUnavailableError(
            this.name,
            `REST provider request failed before a response was received: ${error.message}`,
            { cause: error }
          );
        }

        if (!response.ok) {
          const body = await readErrorBody(response);
          throw createProviderUnavailableError(
            this.name,
            `REST provider request failed with status ${response.status}: ${body}`
          );
        }

        let payload;

        try {
          payload = await response.json();
        } catch (error) {
          throw createProviderInvalidResponseError(
            this.name,
            "REST provider returned invalid JSON.",
            { cause: error }
          );
        }

        if (this.structuredOutput) {
          return parseStructuredOutput({
            payload,
            request,
            provider: this.name,
            model: this.model,
            latency: Math.round(performance.now() - startedAt),
            prompt,
            structuredGrammarProfile: this.structuredGrammarProfile
          });
        }

        const interpretation = normalizeProviderText(
          extractInterpretation(payload, {
            allowReasoningContentFallback: this.allowReasoningContentFallback
          })
        );

        if (!interpretation) {
          throw createProviderInvalidResponseError(
            this.name,
            "REST provider response did not contain usable message.content translation text."
          );
        }

        return buildTranslationResult({
          request,
          provider: this.name,
          model: this.model,
          latency: Math.round(performance.now() - startedAt),
          interpretation,
          notes: [
            "Minimal OpenAI-compatible REST translation template.",
            "Normalization strips obvious reasoning wrappers only."
          ]
        });
      }
    });
  }
}
