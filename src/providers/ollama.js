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

function readStructuredGrammarProfile(options) {
  const configured =
    options.structuredGrammarProfile ??
    process.env.OLLAMA_STRUCTURED_GRAMMAR_PROFILE ??
    DEFAULT_STRUCTURED_GRAMMAR_PROFILE;

  return STRUCTURED_GRAMMAR_PROFILES.includes(configured)
    ? configured
    : DEFAULT_STRUCTURED_GRAMMAR_PROFILE;
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
  }

  async isAvailable() {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async translate(request) {
    validateTranslationRequest(request);

    return executeWithRequestControl({
      provider: this.name,
      request,
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
            body: JSON.stringify({
              model: this.model,
              prompt: structuredPrompt,
              format: "json",
              stream: false
            }),
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
