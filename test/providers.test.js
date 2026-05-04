import test from "node:test";
import assert from "node:assert/strict";

import { validateTranslationResult } from "../src/contracts/index.js";
import { buildPrompt, CodexCliProvider, OllamaProvider, RestProvider } from "../src/providers/index.js";
import { translate } from "../src/index.js";
import { PROVIDER_ERROR_CODES, ProviderError } from "../src/errors/index.js";

function createRequest(overrides = {}) {
  return {
    inputs: [{ type: "text", content: "translate this into a grammar candidate" }],
    profile: "clarification",
    providerPreference: "specific",
    provider: "codex-cli",
    securityPosture: "sensitive",
    ...overrides
  };
}

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

function createAbortablePendingFetch() {
  return async (url, options = {}) =>
    new Promise((resolve, reject) => {
      const abortError = new Error("The operation was aborted.");
      abortError.name = "AbortError";

      if (options.signal?.aborted) {
        reject(abortError);
        return;
      }

      options.signal?.addEventListener(
        "abort",
        () => {
          reject(abortError);
        },
        { once: true }
      );
    });
}

test("codex-cli provider returns a valid stubbed structure", async () => {
  const provider = new CodexCliProvider();
  const result = await provider.translate(createRequest());

  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "codex-cli");
  assert.equal(result.grammarCandidate.metadata.stub, true);
});

test("prompt and grammar candidate include explicit context as translation input only", async () => {
  const request = createRequest({
    context: {
      operatorFocus: "habitat report",
      activeReferents: [{ id: "report-7" }],
      ambiguityMarkers: ["report target is ambiguous"]
    }
  });
  const prompt = buildPrompt(request);
  const provider = new CodexCliProvider();
  const result = await provider.translate(request);

  assert.match(prompt.user, /Explicit context:/);
  assert.match(prompt.user, /habitat report/);
  assert.deepEqual(result.grammarCandidate.context, request.context);
});

test("rest provider reports unavailable when env config is missing", async () => {
  const provider = new RestProvider({
    baseUrl: "",
    apiKey: "",
    model: ""
  });

  assert.equal(await provider.isAvailable(), false);
  await assert.rejects(() => provider.translate(createRequest()), (error) => {
    assert(error instanceof ProviderError);
    assert.equal(error.code, PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE);
    return true;
  });
});

test("rest provider returns a valid structure with a mocked OpenAI-compatible response", async () => {
  const provider = new RestProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "remote-model",
    fetchImpl: async () =>
      createJsonResponse({
        choices: [
          {
            message: {
              content: "Remote interpretation"
            }
          }
        ]
      })
  });

  const result = await provider.translate(
    createRequest({
      provider: "rest"
    })
  );

  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "rest");
});

test("rest provider falls back to reasoning_content when content is empty", async () => {
  const provider = new RestProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "remote-model",
    fetchImpl: async () =>
      createJsonResponse({
        choices: [
          {
            message: {
              content: "",
              reasoning_content: "<think>private chain</think>\nReasoning interpretation"
            }
          }
        ]
      })
  });

  const result = await provider.translate(
    createRequest({
      provider: "rest"
    })
  );

  validateTranslationResult(result);
  assert.equal(result.grammarCandidate.interpretation, "Reasoning interpretation");
});

test("rest provider flattens array content responses", async () => {
  const provider = new RestProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "remote-model",
    fetchImpl: async () =>
      createJsonResponse({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "First line." },
                { type: "text", text: "Second line." }
              ]
            }
          }
        ]
      })
  });

  const result = await provider.translate(
    createRequest({
      provider: "rest"
    })
  );

  validateTranslationResult(result);
  assert.equal(result.grammarCandidate.interpretation, "First line.\nSecond line.");
});

test("ollama provider checks availability and returns a valid structure", async () => {
  const calls = [];
  const provider = new OllamaProvider({
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2:3b",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });

      if (url.endsWith("/api/tags")) {
        return createJsonResponse({ models: [] });
      }

      return createJsonResponse({
        response: "<think>private chain</think>\nLocal interpretation"
      });
    }
  });

  assert.equal(await provider.isAvailable(), true);

  const result = await provider.translate(
    createRequest({
      provider: "ollama"
    })
  );

  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "ollama");
  assert.equal(result.grammarCandidate.interpretation, "Local interpretation");
  assert.equal(calls.length, 2);
});

test("rest provider times out with a classified error", async () => {
  const provider = new RestProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "remote-model",
    fetchImpl: createAbortablePendingFetch()
  });

  await assert.rejects(
    () =>
      provider.translate(
        createRequest({
          provider: "rest",
          timeoutMs: 20
        })
      ),
    (error) => {
      assert(error instanceof ProviderError);
      assert.equal(error.code, PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT);
      assert.equal(error.details.timeoutMs, 20);
      return true;
    }
  );
});

test("rest provider rejects invalid empty responses with a classified error", async () => {
  const provider = new RestProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "remote-model",
    fetchImpl: async () =>
      createJsonResponse({
        choices: [
          {
            message: {
              content: ""
            }
          }
        ]
      })
  });

  await assert.rejects(
    () =>
      provider.translate(
        createRequest({
          provider: "rest"
        })
      ),
    (error) => {
      assert(error instanceof ProviderError);
      assert.equal(error.code, PROVIDER_ERROR_CODES.PROVIDER_INVALID_RESPONSE);
      return true;
    }
  );
});

test("ollama provider respects cancellation signals", async () => {
  const controller = new AbortController();
  const provider = new OllamaProvider({
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2:3b",
    fetchImpl: createAbortablePendingFetch()
  });

  setTimeout(() => controller.abort(), 10);

  await assert.rejects(
    () =>
      provider.translate(
        createRequest({
          provider: "ollama",
          timeoutMs: 100,
          signal: controller.signal
        })
      ),
    (error) => {
      assert(error instanceof ProviderError);
      assert.equal(error.code, PROVIDER_ERROR_CODES.REQUEST_CANCELLED);
      return true;
    }
  );
});

test("top-level translate validates the full request to result flow", async () => {
  const result = await translate(createRequest(), {
    providers: {
      "codex-cli": new CodexCliProvider()
    },
    defaultLocalProvider: "codex-cli",
    defaultRemoteProvider: "codex-cli"
  });

  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "codex-cli");
});
