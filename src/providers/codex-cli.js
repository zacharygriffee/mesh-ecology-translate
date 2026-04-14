import { ProviderAdapter, buildTranslationResult } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";

export class CodexCliProvider extends ProviderAdapter {
  constructor(options = {}) {
    super({
      name: "codex-cli",
      model: options.model ?? "stub",
      kind: "manual"
    });
  }

  async isAvailable() {
    return true;
  }

  async translate(request) {
    validateTranslationRequest(request);

    return buildTranslationResult({
      request,
      provider: this.name,
      model: this.model,
      interpretation: `Stubbed codex-cli translation for profile "${request.profile}".`,
      notes: [
        "Stub provider only.",
        "Full Codex CLI or Codex SDK integration is intentionally left out in v1."
      ],
      grammarMetadata: {
        stub: true
      }
    });
  }
}
