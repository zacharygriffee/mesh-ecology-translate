export {
  INPUT_TYPES,
  PROVIDER_PREFERENCES,
  SECURITY_POSTURES,
  TRANSLATION_PROFILES,
  validateTranslationRequest,
  validateTranslationResult
} from "./contracts/index.js";
export {
  CodexCliProvider,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  OllamaProvider,
  PROFILE_TEMPLATES,
  ProviderAdapter,
  RestProvider,
  buildPrompt,
  buildTranslationResult
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

import { validateTranslationRequest, validateTranslationResult } from "./contracts/index.js";
import { createDefaultRouter } from "./router/index.js";

export async function translate(request, options = {}) {
  validateTranslationRequest(request);

  const router = options.router ?? createDefaultRouter(options);
  const result = await router.translate(request);

  return validateTranslationResult(result);
}
