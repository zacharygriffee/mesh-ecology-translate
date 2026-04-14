import {
  createProviderTimeoutError,
  createRequestCancelledError
} from "../errors/index.js";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;

function isAbortSignalLike(signal) {
  return Boolean(signal) && typeof signal.aborted === "boolean" && typeof signal.addEventListener === "function";
}

export function createRequestExecutionContext(request, defaultTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS) {
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  const upstreamSignal = isAbortSignalLike(request.signal) ? request.signal : null;
  let abortReason = null;
  let timeoutId = null;

  const onUpstreamAbort = () => {
    if (abortReason !== null) {
      return;
    }

    abortReason = "cancelled";
    controller.abort(upstreamSignal?.reason);
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      abortReason = "cancelled";
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  timeoutId = setTimeout(() => {
    if (abortReason !== null) {
      return;
    }

    abortReason = "timeout";
    controller.abort(new Error(`Timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    timeoutMs,
    getAbortReason() {
      return abortReason;
    },
    cleanup() {
      clearTimeout(timeoutId);

      if (upstreamSignal) {
        upstreamSignal.removeEventListener("abort", onUpstreamAbort);
      }
    }
  };
}

export async function executeWithRequestControl({ provider, request, operation }) {
  const context = createRequestExecutionContext(request);

  try {
    if (context.signal.aborted) {
      throw createRequestCancelledError(provider);
    }

    return await operation(context);
  } catch (error) {
    const abortReason = context.getAbortReason();

    if (abortReason === "timeout") {
      throw createProviderTimeoutError(provider, context.timeoutMs, error);
    }

    if (abortReason === "cancelled") {
      throw createRequestCancelledError(provider, error);
    }

    throw error;
  } finally {
    context.cleanup();
  }
}
