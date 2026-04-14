import { ProviderAdapter, buildPrompt, buildTranslationResult, readErrorBody } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";

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

    const prompt = buildPrompt(request);
    const startedAt = performance.now();
    const response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        prompt: `${prompt.system}\n\n${prompt.user}`,
        stream: false
      })
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(`Ollama request failed with status ${response.status}: ${body}`);
    }

    const payload = await response.json();
    const interpretation =
      typeof payload.response === "string" && payload.response.trim().length > 0
        ? payload.response.trim()
        : `Ollama translation placeholder for ${request.profile}.`;

    return buildTranslationResult({
      request,
      provider: this.name,
      model: this.model,
      latency: Math.round(performance.now() - startedAt),
      interpretation,
      notes: ["Minimal Ollama translation template."]
    });
  }
}
