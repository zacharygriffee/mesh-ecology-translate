import { validateTranslationRequest } from "../contracts/index.js";
import { CodexCliProvider, OllamaProvider, RestProvider } from "../providers/index.js";

export class ProviderRoutingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProviderRoutingError";
    this.details = details;
  }
}

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
        reason: `Provider "${name}" is not registered.`
      };
    }

    try {
      const available =
        typeof provider.isAvailable === "function" ? await provider.isAvailable() : true;

      return {
        available,
        reason: available ? null : `Provider "${name}" is unavailable.`
      };
    } catch (error) {
      return {
        available: false,
        reason: `Provider "${name}" availability check failed: ${error.message}`
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

    const providerOrder = this.getProviderOrder(request);
    const routingNotes = [];
    const failures = [];

    for (const providerName of providerOrder) {
      const availability = await this.getAvailability(providerName);

      if (!availability.available) {
        failures.push(availability.reason);
        continue;
      }

      const provider = this.getProvider(providerName);

      try {
        const result = await provider.translate(request);

        if (failures.length > 0) {
          routingNotes.push(`Routing fallback: ${failures.join(" ")}`);
        }

        return appendRoutingNotes(result, routingNotes);
      } catch (error) {
        failures.push(`Provider "${providerName}" failed: ${error.message}`);
      }
    }

    throw new ProviderRoutingError("No provider could satisfy the translation request.", {
      providerPreference: request.providerPreference,
      failures
    });
  }
}

export function createDefaultRouter(options = {}) {
  return new ProviderRouter(options);
}
