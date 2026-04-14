import { ProviderAdapter, buildPrompt, buildTranslationResult, readErrorBody } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { normalizeProviderText } from "../normalize/index.js";
import { executeWithRequestControl } from "./runtime.js";

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

function extractInterpretation(payload) {
  const choice = payload?.choices?.[0];
  const directContent = flattenContent(choice?.message?.content);

  if (directContent) {
    return directContent;
  }

  const reasoningContent = flattenContent(choice?.message?.reasoning_content ?? choice?.reasoning_content);

  if (reasoningContent) {
    return reasoningContent;
  }

  return "";
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
          response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              model: this.model,
              temperature: 0.2,
              messages: [
                {
                  role: "system",
                  content: prompt.system
                },
                {
                  role: "user",
                  content: prompt.user
                }
              ]
            }),
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

        const interpretation = normalizeProviderText(extractInterpretation(payload));

        if (!interpretation) {
          throw createProviderInvalidResponseError(
            this.name,
            "REST provider response did not contain usable translation text."
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
