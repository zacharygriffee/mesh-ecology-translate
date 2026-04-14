import { ProviderAdapter, buildPrompt, buildTranslationResult, readErrorBody } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { normalizeProviderText } from "../normalize/index.js";
import { executeWithRequestControl } from "./runtime.js";

export class OllamaProvider extends ProviderAdapter {
  constructor(options = {}) {
    super({
      name: "ollama",
      model: options.model ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b",
      kind: "local"
    });

    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
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
              prompt: `${prompt.system}\n\n${prompt.user}`,
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

        const interpretation = normalizeProviderText(payload?.response);

        if (!interpretation) {
          throw createProviderInvalidResponseError(
            this.name,
            "Ollama response did not contain usable translation text."
          );
        }

        return buildTranslationResult({
          request,
          provider: this.name,
          model: this.model,
          latency: Math.round(performance.now() - startedAt),
          interpretation,
          notes: ["Minimal Ollama translation template.", "Normalization strips obvious reasoning wrappers only."]
        });
      }
    });
  }
}
