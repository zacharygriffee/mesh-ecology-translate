export const PROVIDER_ERROR_CODES = Object.freeze({
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_INVALID_RESPONSE: "PROVIDER_INVALID_RESPONSE",
  UNSUPPORTED_PROVIDER: "UNSUPPORTED_PROVIDER",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
  ROUTING_FAILURE: "ROUTING_FAILURE"
});

export class ProviderError extends Error {
  constructor(message, { code, provider, details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProviderError";
    this.code = code;

    if (provider) {
      this.provider = provider;
    }

    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class ProviderRoutingError extends ProviderError {
  constructor(message, details = {}) {
    super(message, {
      code: PROVIDER_ERROR_CODES.ROUTING_FAILURE,
      details
    });
    this.name = "ProviderRoutingError";
  }
}

export function isProviderError(error) {
  return error instanceof ProviderError;
}

export function createProviderUnavailableError(provider, message, options = {}) {
  return new ProviderError(message, {
    ...options,
    code: PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE,
    provider
  });
}

export function createProviderTimeoutError(provider, timeoutMs, cause, options = {}) {
  return new ProviderError(
    options.message ?? `Provider "${provider}" timed out after ${timeoutMs}ms.`,
    {
      code: PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT,
      provider,
      details: {
        timeoutMs,
        ...(options.details ?? {})
      },
      cause
    }
  );
}

export function createProviderInvalidResponseError(provider, message, options = {}) {
  return new ProviderError(message, {
    ...options,
    code: PROVIDER_ERROR_CODES.PROVIDER_INVALID_RESPONSE,
    provider
  });
}

export function createUnsupportedProviderError(provider) {
  return new ProviderError(`Provider "${provider}" is not supported.`, {
    code: PROVIDER_ERROR_CODES.UNSUPPORTED_PROVIDER,
    provider
  });
}

export function createRequestCancelledError(provider, cause) {
  return new ProviderError(`Provider "${provider}" request was cancelled.`, {
    code: PROVIDER_ERROR_CODES.REQUEST_CANCELLED,
    provider,
    cause
  });
}
