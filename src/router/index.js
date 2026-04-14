import { validateTranslationRequest } from "../contracts/index.js";
import { CodexCliProvider, OllamaProvider, RestProvider } from "../providers/index.js";
import {
  ProviderRoutingError,
  createProviderUnavailableError,
  createUnsupportedProviderError,
  isProviderError
} from "../errors/index.js";

export { ProviderRoutingError } from "../errors/index.js";

function appendRoutingNotes(result, routingNotes) {
  if (routingNotes.length === 0) {
    return result;
  }

  return {
    ...result,
    notes: [...(result.notes ?? []), ...routingNotes]
  };
}

export function createDefaultProviders(options = {}) {
  return {
    ollama: options.ollama ?? new OllamaProvider(options.ollamaOptions),
    rest: options.rest ?? new RestProvider(options.restOptions),
    "codex-cli": options.codexCli ?? new CodexCliProvider(options.codexCliOptions)
  };
}

export class ProviderRouter {
  constructor(options = {}) {
    this.defaultLocalProvider = options.defaultLocalProvider ?? "ollama";
    this.defaultRemoteProvider = options.defaultRemoteProvider ?? "rest";
    this.providers = new Map(Object.entries(options.providers ?? createDefaultProviders(options)));
  }

  getProvider(name) {
    return this.providers.get(name);
  }

  async getAvailability(name) {
    const provider = this.getProvider(name);

    if (!provider) {
      return {
        available: false,
        error: createProviderUnavailableError(name, `Provider "${name}" is not registered.`)
      };
    }

    try {
      const available =
        typeof provider.isAvailable === "function" ? await provider.isAvailable() : true;

      return {
        available,
        error: available
          ? null
          : createProviderUnavailableError(name, `Provider "${name}" is unavailable.`)
      };
    } catch (error) {
      return {
        available: false,
        error: createProviderUnavailableError(
          name,
          `Provider "${name}" availability check failed: ${error.message}`,
          { cause: error }
        )
      };
    }
  }

  getProviderOrder(request) {
    switch (request.providerPreference) {
      case "local_preferred":
        return [this.defaultLocalProvider, this.defaultRemoteProvider];
      case "local_only":
        return [this.defaultLocalProvider];
      case "remote_allowed":
        return [this.defaultRemoteProvider];
      case "specific":
        return [request.provider];
      default:
        throw new ProviderRoutingError(`Unsupported provider preference: ${request.providerPreference}`);
    }
  }

  async translate(request) {
    validateTranslationRequest(request);

    if (request.providerPreference === "specific" && !this.getProvider(request.provider)) {
      throw createUnsupportedProviderError(request.provider);
    }

    const providerOrder = this.getProviderOrder(request);
    const routingNotes = [];
    const failures = [];

    for (const providerName of providerOrder) {
      const availability = await this.getAvailability(providerName);

      if (!availability.available) {
        failures.push(availability.error);
        continue;
      }

      const provider = this.getProvider(providerName);

      try {
        const result = await provider.translate(request);

        if (failures.length > 0) {
          routingNotes.push(
            `Routing fallback: ${failures.map((failure) => failure.message).join(" ")}`
          );
        }

        return appendRoutingNotes(result, routingNotes);
      } catch (error) {
        failures.push(
          isProviderError(error)
            ? error
            : createProviderUnavailableError(
                providerName,
                `Provider "${providerName}" failed: ${error.message}`,
                { cause: error }
              )
        );
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }

    throw new ProviderRoutingError("No provider could satisfy the translation request.", {
      providerPreference: request.providerPreference,
      failures: failures.map((failure) => ({
        code: failure.code,
        provider: failure.provider,
        message: failure.message
      }))
    });
  }
}

export function createDefaultRouter(options = {}) {
  return new ProviderRouter(options);
}
