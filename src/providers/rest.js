import {
  ProviderAdapter,
  buildPrompt,
  buildTranslationResult,
  readErrorBody
} from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { normalizeProviderText } from "../normalize/index.js";
import { executeWithRequestControl } from "./runtime.js";
import {
  DEFAULT_STRUCTURED_GRAMMAR_PROFILE,
  PORTABLE_INTENT_CLASSES as STRUCTURED_PORTABLE_INTENT_CLASSES,
  STRUCTURED_GRAMMAR_PROFILES,
  buildStructuredProviderMessages,
  parseStructuredProviderOutput
} from "./structured.js";

export const DEFAULT_REST_MAX_TOKENS = 512;
export const DEFAULT_REST_TEMPERATURE = 0.2;
export const DEFAULT_REST_RESPONSE_FORMAT = Object.freeze({ type: "json_object" });
export const DEFAULT_REST_STRUCTURED_GRAMMAR_PROFILE = DEFAULT_STRUCTURED_GRAMMAR_PROFILE;
export const REST_STRUCTURED_GRAMMAR_PROFILES = STRUCTURED_GRAMMAR_PROFILES;
export const PORTABLE_INTENT_CLASSES = STRUCTURED_PORTABLE_INTENT_CLASSES;

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

  return buildStructuredProviderMessages(request, { structuredGrammarProfile });
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
          return parseStructuredProviderOutput({
            content: flattenContent(payload?.choices?.[0]?.message?.content),
            request,
            provider: this.name,
            model: this.model,
            latency: Math.round(performance.now() - startedAt),
            templateId: prompt.templateId,
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
