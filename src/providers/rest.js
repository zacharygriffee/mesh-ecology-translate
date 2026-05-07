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
    intent: "string",
    target: "string|null",
    scope: "string|null",
    action: "string|null",
    parameters: {},
    rawInterpretation: "string"
  },
  confidence: 0,
  needsClarification: false,
  ambiguities: [],
  notes: []
});

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

function buildRestMessages(prompt, { structuredOutput }) {
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

  return [
    {
      role: "system",
      content: [
        prompt.system,
        "Return only JSON. No markdown. No prose. No reasoning text. No code fences."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        prompt.user,
        "Return exactly one JSON object matching this shape:",
        JSON.stringify(STRUCTURED_OUTPUT_SCHEMA, null, 2)
      ].join("\n\n")
    }
  ];
}

function createInvalidStructuredResponseError(provider, message) {
  return createProviderInvalidResponseError(provider, `REST provider structured response invalid: ${message}`);
}

function assertString(value, path, provider) {
  if (typeof value !== "string") {
    throw createInvalidStructuredResponseError(provider, `${path} must be a string.`);
  }
}

function assertNullableString(value, path, provider) {
  if (value !== null && typeof value !== "string") {
    throw createInvalidStructuredResponseError(provider, `${path} must be a string or null.`);
  }
}

function assertStringArray(value, path, provider) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createInvalidStructuredResponseError(provider, `${path} must be an array of strings.`);
  }
}

function parseStructuredOutput({ payload, request, provider, model, latency, prompt }) {
  const content = flattenContent(payload?.choices?.[0]?.message?.content);

  if (!content) {
    throw createInvalidStructuredResponseError(provider, "message.content must contain JSON output.");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw createInvalidStructuredResponseError(provider, "message.content must be valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw createInvalidStructuredResponseError(provider, "top-level output must be an object.");
  }

  if (!isPlainObject(parsed.grammarCandidate)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate must be an object.");
  }

  assertString(parsed.grammarCandidate.intent, "grammarCandidate.intent", provider);
  assertNullableString(parsed.grammarCandidate.target, "grammarCandidate.target", provider);
  assertNullableString(parsed.grammarCandidate.scope, "grammarCandidate.scope", provider);
  assertNullableString(parsed.grammarCandidate.action, "grammarCandidate.action", provider);

  if (!isPlainObject(parsed.grammarCandidate.parameters)) {
    throw createInvalidStructuredResponseError(provider, "grammarCandidate.parameters must be an object.");
  }

  assertString(parsed.grammarCandidate.rawInterpretation, "grammarCandidate.rawInterpretation", provider);

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
      intent: parsed.grammarCandidate.intent,
      target: parsed.grammarCandidate.target,
      scope: parsed.grammarCandidate.scope,
      action: parsed.grammarCandidate.action,
      parameters: parsed.grammarCandidate.parameters,
      rawInterpretation: parsed.grammarCandidate.rawInterpretation,
      metadata: {
        structured: true
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
              structuredOutput: this.structuredOutput
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
            prompt
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
