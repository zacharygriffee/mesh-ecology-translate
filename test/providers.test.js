import test from "node:test";
import assert from "node:assert/strict";

import { validateTranslationResult } from "../src/contracts/index.js";
import { CodexCliProvider, OllamaProvider, RestProvider } from "../src/providers/index.js";
import { translate } from "../src/index.js";

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

test("codex-cli provider returns a valid stubbed structure", async () => {
  const provider = new CodexCliProvider();
  const result = await provider.translate(createRequest());

  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "codex-cli");
  assert.equal(result.grammarCandidate.metadata.stub, true);
});

test("rest provider reports unavailable when env config is missing", async () => {
  const provider = new RestProvider({
    baseUrl: "",
    apiKey: "",
    model: ""
  });

  assert.equal(await provider.isAvailable(), false);
  await assert.rejects(() => provider.translate(createRequest()), /requires REST_BASE_URL/);
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
        response: "Local interpretation"
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
  assert.equal(calls.length, 2);
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
