import { ProviderAdapter, buildPrompt, readErrorBody } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { executeWithRequestControl } from "./runtime.js";
import {
  DEFAULT_STRUCTURED_GRAMMAR_PROFILE,
  STRUCTURED_GRAMMAR_PROFILES,
  buildStructuredProviderPrompt,
  parseStructuredProviderOutput
} from "./structured.js";

export const DEFAULT_OLLAMA_WARMUP_TIMEOUT_MS = 120000;

function readStructuredGrammarProfile(options) {
  const configured =
    options.structuredGrammarProfile ??
    process.env.OLLAMA_STRUCTURED_GRAMMAR_PROFILE ??
    DEFAULT_STRUCTURED_GRAMMAR_PROFILE;

  return STRUCTURED_GRAMMAR_PROFILES.includes(configured)
    ? configured
    : DEFAULT_STRUCTURED_GRAMMAR_PROFILE;
}

function readBooleanOption(value, envValue, fallback = false) {
  const configured = value ?? envValue;

  if (typeof configured === "boolean") {
    return configured;
  }

  if (typeof configured !== "string") {
    return fallback;
  }

  switch (configured.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

function readPositiveNumberOption(value, envValue, fallback) {
  const configured = value ?? envValue ?? fallback;
  const parsed = Number(configured);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildOllamaTimeoutMessage(timeoutMs) {
  return [
    `Provider "ollama" timed out after ${timeoutMs}ms.`,
    "Ollama can exceed the normal timeout while a local model is loading.",
    "Increase TranslationRequest.timeoutMs for this call, or enable OllamaProvider warmup with a larger warmupTimeoutMs."
  ].join(" ");
}

function buildOllamaWarmupTimeoutMessage(timeoutMs) {
  return [
    `Provider "ollama" warmup timed out after ${timeoutMs}ms.`,
    "Increase OllamaProvider warmupTimeoutMs or OLLAMA_WARMUP_TIMEOUT_MS for large local models."
  ].join(" ");
}

export class OllamaProvider extends ProviderAdapter {
  constructor(options = {}) {
    super({
      name: "ollama",
      model: options.model ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b",
      kind: "local"
    });

    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.structuredGrammarProfile = readStructuredGrammarProfile(options);
    this.warmup = readBooleanOption(options.warmup, process.env.OLLAMA_WARMUP);
    this.warmupTimeoutMs = readPositiveNumberOption(
      options.warmupTimeoutMs,
      process.env.OLLAMA_WARMUP_TIMEOUT_MS,
      DEFAULT_OLLAMA_WARMUP_TIMEOUT_MS
    );
    this.keepAlive = options.keepAlive ?? process.env.OLLAMA_KEEP_ALIVE;
  }

  async isAvailable() {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }

  createGenerateBody(fields = {}) {
    return {
      model: this.model,
      ...fields,
      ...(this.keepAlive !== undefined ? { keep_alive: this.keepAlive } : {})
    };
  }

  async warmupModel(request) {
    return executeWithRequestControl({
      provider: this.name,
      request: {
        ...request,
        timeoutMs: this.warmupTimeoutMs
      },
      timeoutMessage: buildOllamaWarmupTimeoutMessage,
      timeoutDetails: {
        phase: "warmup"
      },
      operation: async ({ signal }) => {
        let response;

        try {
          response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(
              this.createGenerateBody({
                prompt: "",
                stream: false
              })
            ),
            signal
          });
        } catch (error) {
          if (isProviderError(error)) {
            throw error;
          }

          throw createProviderUnavailableError(
            this.name,
            `Ollama warmup request failed before a response was received: ${error.message}`,
            { cause: error }
          );
        }

        if (!response.ok) {
          const body = await readErrorBody(response);
          throw createProviderUnavailableError(
            this.name,
            `Ollama warmup request failed with status ${response.status}: ${body}`
          );
        }

        try {
          await response.json();
        } catch (error) {
          throw createProviderInvalidResponseError(
            this.name,
            "Ollama warmup returned invalid JSON.",
            { cause: error }
          );
        }
      }
    });
  }

  async translate(request) {
    validateTranslationRequest(request);

    if (this.warmup) {
      await this.warmupModel(request);
    }

    return executeWithRequestControl({
      provider: this.name,
      request,
      timeoutMessage: buildOllamaTimeoutMessage,
      operation: async ({ signal }) => {
        const prompt = buildPrompt(request);
        const structuredPrompt = buildStructuredProviderPrompt(request, {
          structuredGrammarProfile: this.structuredGrammarProfile
        });
        const startedAt = performance.now();
        let response;

        try {
          response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(
              this.createGenerateBody({
                prompt: structuredPrompt,
                format: "json",
                stream: false
              })
            ),
            signal
          });
        } catch (error) {
          if (isProviderError(error)) {
            throw error;
          }

          throw createProviderUnavailableError(
            this.name,
            `Ollama request failed before a response was received: ${error.message}`,
            { cause: error }
          );
        }

        if (!response.ok) {
          const body = await readErrorBody(response);
          throw createProviderUnavailableError(
            this.name,
            `Ollama request failed with status ${response.status}: ${body}`
          );
        }

        let payload;

        try {
          payload = await response.json();
        } catch (error) {
          throw createProviderInvalidResponseError(
            this.name,
            "Ollama returned invalid JSON.",
            { cause: error }
          );
        }

        return parseStructuredProviderOutput({
          content: payload?.response,
          request,
          provider: this.name,
          model: this.model,
          latency: Math.round(performance.now() - startedAt),
          templateId: prompt.templateId,
          structuredGrammarProfile: this.structuredGrammarProfile,
          contentPath: "response"
        });
      }
    });
  }
}
