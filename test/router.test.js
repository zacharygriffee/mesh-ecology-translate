import test from "node:test";
import assert from "node:assert/strict";

import { ProviderRouter, ProviderRoutingError } from "../src/router/index.js";
import { validateTranslationResult } from "../src/contracts/index.js";

function createRequest(overrides = {}) {
  return {
    inputs: [{ type: "text", content: "summarize the wetland note" }],
    profile: "conversational",
    providerPreference: "local_preferred",
    securityPosture: "standard",
    ...overrides
  };
}

function createProvider(name, { available = true, note = `${name} response` } = {}) {
  return {
    async isAvailable() {
      return available;
    },
    async translate(request) {
      return {
        grammarCandidate: {
          version: "v1",
          profile: request.profile,
          sourceText: request.inputs[0].content,
          interpretation: `${name} interpreted the input`,
          template: request.profile,
          continuity: request.continuity ?? null,
          metadata: {}
        },
        confidence: 0.7,
        ambiguities: [],
        needsClarification: false,
        notes: [note],
        providerInfo: {
          provider: name,
          model: `${name}-model`
        }
      };
    }
  };
}

test("local_preferred uses the local provider when available", async () => {
  const router = new ProviderRouter({
    providers: {
      ollama: createProvider("ollama"),
      rest: createProvider("rest")
    }
  });

  const result = await router.translate(createRequest());
  validateTranslationResult(result);
  assert.equal(result.providerInfo.provider, "ollama");
});

test("local_preferred falls back to remote when local is unavailable", async () => {
  const router = new ProviderRouter({
    providers: {
      ollama: createProvider("ollama", { available: false }),
      rest: createProvider("rest")
    }
  });

  const result = await router.translate(createRequest());
  assert.equal(result.providerInfo.provider, "rest");
  assert.match(result.notes.at(-1), /Routing fallback/);
});

test("local_only fails when the local provider is unavailable", async () => {
  const router = new ProviderRouter({
    providers: {
      ollama: createProvider("ollama", { available: false }),
      rest: createProvider("rest")
    }
  });

  await assert.rejects(
    () =>
      router.translate(
        createRequest({
          providerPreference: "local_only"
        })
      ),
    ProviderRoutingError
  );
});

test("remote_allowed selects the default remote provider", async () => {
  const router = new ProviderRouter({
    providers: {
      ollama: createProvider("ollama"),
      rest: createProvider("rest")
    }
  });

  const result = await router.translate(
    createRequest({
      providerPreference: "remote_allowed"
    })
  );

  assert.equal(result.providerInfo.provider, "rest");
});

test("specific provider uses the named provider when available", async () => {
  const router = new ProviderRouter({
    providers: {
      ollama: createProvider("ollama"),
      rest: createProvider("rest"),
      "codex-cli": createProvider("codex-cli")
    }
  });

  const result = await router.translate(
    createRequest({
      providerPreference: "specific",
      provider: "codex-cli"
    })
  );

  assert.equal(result.providerInfo.provider, "codex-cli");
});
