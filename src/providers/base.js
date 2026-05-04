import { validateTranslationRequest, validateTranslationResult } from "../contracts/index.js";

export const PROFILE_TEMPLATES = {
  command:
    "Translate the user text into a concise command-oriented grammar candidate. Do not execute anything.",
  conversational:
    "Translate the user text into a conversational grammar candidate. Do not add tool use or execution steps.",
  clarification:
    "Translate the user text into a clarification-focused grammar candidate and surface uncertainty explicitly."
};

export class ProviderAdapter {
  constructor({ name, model, kind }) {
    this.name = name;
    this.model = model;
    this.kind = kind;
  }

  async isAvailable() {
    return true;
  }

  async translate() {
    throw new Error(`Provider "${this.name}" must implement translate(request).`);
  }
}

export function extractPrimaryText(request) {
  return validateTranslationRequest(request)
    .inputs.map((input) => input.content.trim())
    .join("\n");
}

export function buildPrompt(request) {
  const inputText = extractPrimaryText(request);
  const template = PROFILE_TEMPLATES[request.profile];
  const continuity = request.continuity ? JSON.stringify(request.continuity, null, 2) : "none";
  const context = request.context ? JSON.stringify(request.context, null, 2) : "none";

  return {
    templateId: request.profile,
    inputText,
    system: [
      "You are a translation provider layer.",
      "Return an interpretation suitable for a grammar candidate.",
      "Do not execute commands, call tools, assume authority, or reference mesh internals."
    ].join(" "),
    user: [
      `Profile: ${request.profile}`,
      `Security posture: ${request.securityPosture}`,
      `Instructions: ${template}`,
      `Continuity: ${continuity}`,
      `Explicit context: ${context}`,
      `Input:\n${inputText}`
    ].join("\n\n")
  };
}

export function createGrammarCandidate({ request, templateId, interpretation, metadata = {} }) {
  return {
    version: "v1",
    profile: request.profile,
    sourceText: extractPrimaryText(request),
    interpretation,
    template: templateId,
    continuity: request.continuity ?? null,
    context: request.context ?? null,
    metadata
  };
}

export function buildTranslationResult({
  request,
  provider,
  model,
  latency,
  interpretation,
  ambiguities = [],
  needsClarification = false,
  notes = [],
  grammarMetadata = {}
}) {
  const prompt = buildPrompt(request);
  const result = {
    grammarCandidate: createGrammarCandidate({
      request,
      templateId: prompt.templateId,
      interpretation,
      metadata: grammarMetadata
    }),
    confidence: needsClarification ? 0.45 : 0.72,
    ambiguities,
    needsClarification,
    notes,
    providerInfo: {
      provider,
      model,
      ...(latency !== undefined ? { latency } : {})
    }
  };

  return validateTranslationResult(result);
}

export async function readErrorBody(response) {
  try {
    return await response.text();
  } catch {
    return "<unavailable>";
  }
}
