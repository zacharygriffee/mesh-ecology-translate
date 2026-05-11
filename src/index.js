export {
  GENERIC_ACTION_FAMILIES,
  GENERIC_CANDIDATE_SCHEMA_VERSION,
  GENERIC_IDEMPOTENCY_VALUES,
  GENERIC_REVERSIBILITY_VALUES,
  GENERIC_TARGET_CLASSES,
  INPUT_TYPES,
  PROVIDER_PREFERENCES,
  REQUIRED_NON_AUTHORITY_FLAGS,
  SECURITY_POSTURES,
  TRANSLATION_CONTEXT_FIELDS,
  TRANSLATION_PROFILES,
  validateGenericCandidate,
  validateTranslationRequest,
  validateTranslationResult
} from "./contracts/index.js";
export {
  CodexCliProvider,
  DEFAULT_CODEX_CLI_COMMAND,
  DEFAULT_CODEX_CLI_MODEL,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  OllamaProvider,
  PROFILE_TEMPLATES,
  ProviderAdapter,
  RestProvider,
  buildPrompt,
  buildTranslationResult,
  DEFAULT_OLLAMA_WARMUP_TIMEOUT_MS,
  runCodexCliCommand
} from "./providers/index.js";
export {
  ProviderRouter,
  ProviderRoutingError,
  createDefaultProviders,
  createDefaultRouter
} from "./router/index.js";
export {
  PROVIDER_ERROR_CODES,
  ProviderError
} from "./errors/index.js";
export {
  EDGE_IMPORT_CLASSIFICATION,
  EDGE_PHASE_174_STATIC_FIXTURE_PATH,
  PROJECT_REVIEW_STATUSES,
  REQUIRED_NON_CLAIM_FLAGS,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_ARTIFACT_KIND,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA,
  TRANSLATE_PROJECT_REVIEW_EVIDENCE_SCHEMA_VERSION,
  createProjectReviewEvidenceFromFixture
} from "./review-evidence/index.js";

import { validateTranslationRequest, validateTranslationResult } from "./contracts/index.js";
import { createDefaultRouter } from "./router/index.js";

export async function translate(request, options = {}) {
  validateTranslationRequest(request);

  const router = options.router ?? createDefaultRouter(options);
  const result = await router.translate(request);

  return validateTranslationResult(result);
}
