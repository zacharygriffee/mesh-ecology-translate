# mesh-ecology-translate

Lightweight translation layer for turning input context into structured translation results across multiple AI providers.

This package accepts a `TranslationRequest`, selects a provider, and returns a `TranslationResult`. It is designed as a small reusable library with a local-first posture and explicit provider behavior.

## Installation

```bash
npm install mesh-ecology-translate
```

## Basic Usage

```js
import { translate } from "mesh-ecology-translate";

const result = await translate({
  inputs: [{ type: "text", content: "Summarize the habitat report for later review." }],
  profile: "command",
  providerPreference: "local_preferred",
  securityPosture: "standard"
});

console.log(result.grammarCandidate);
console.log(result.providerInfo);
```

## TranslationRequest

`TranslationRequest` is the input contract for a translation call.

Fields:

- `inputs`: array of `{ type: "text", content: string }`
- `profile`: one of `command`, `conversational`, `clarification`
- `continuity`: optional object for prior grammar or conversation state
- `context`: optional explicit translation context object from Edge
- `providerPreference`: one of `local_preferred`, `local_only`, `remote_allowed`, `specific`
- `provider`: optional provider name, required when `providerPreference` is `specific`
- `securityPosture`: one of `sensitive`, `standard`, `public`
- `timeoutMs`: optional per-request timeout override
- `signal`: optional `AbortSignal` for cancellation

Notes:

- v1 accepts text inputs only.
- `context` is limited to explicit translation input fields: `operatorFocus`, `activeReferents`, `portalVisibility`, `exportVisibility`, `continuitySummaries`, `ambiguityMarkers`, `reasonReferences`, and `evidenceReferences`.
- `signal` is runtime-only and should not be treated as serialized data.

## TranslationResult

`TranslationResult` is the normalized provider output. Providers may differ internally, but REST/OpenAI-compatible APIs, Ollama, and future adapters are expected to return the same portable contract-level shape.

Fields:

- `grammarCandidate`: portable candidate object returned for downstream consumers
- `confidence`: number from `0` to `1`
- `ambiguities`: array of strings
- `needsClarification`: boolean
- `notes`: optional array of strings
- `providerInfo`: object with:
  - `provider`
  - `model`
  - `latency` optional

## Providers

Current providers:

- `ollama`: local Ollama integration
- `rest`: OpenAI-compatible REST APIs
- `codex-cli`: optional local Codex CLI integration

Provider adapters must normalize raw model/provider output before returning. Command/profile providers should prefer structured JSON output; free-text command output is not a successful command result unless explicitly represented as clarification or error.

See [Provider Policy](./docs/provider-policy.md) for adapter requirements and future provider onboarding.

Routing supports:

- `local_preferred`
- `local_only`
- `remote_allowed`
- `specific`

## Behavior

The library includes a small amount of operational hardening:

- timeout support for provider calls
- cancellation via `AbortSignal`
- structured provider parsing, normalization, and validation before return
- classified provider and routing errors for easier consumer handling

Structured normalization is intentionally narrow. It validates required fields, normalizes documented synonyms, blocks unsafe authority or execution claims, and does not attempt broad JSON repair or hidden execution.

## Configuration

This package is library-shaped and expects configuration to be supplied by the consumer.

- It does not auto-load `.env` files.
- Environment values must already be present in `process.env`, or provider options must be supplied directly when constructing adapters or routers.
- The default provider timeout is `30000ms`, which can be overridden per request with `timeoutMs`.
- REST providers use `REST_BASE_URL`, `REST_API_KEY`, and `REST_MODEL`.
- REST request bodies include bounded OpenAI-compatible `max_tokens`; the default is `512` and can be overridden with `REST_MAX_TOKENS` or `RestProvider` options `maxTokens` / `max_tokens`.
- REST `temperature` defaults to `0.2` and can be overridden with `REST_TEMPERATURE` or `RestProvider` option `temperature`.
- REST provider-specific body fields are sent only through explicit `extraBodyFields` configuration. Tool/function/stream fields are filtered out.
- REST output uses `message.content` as the translation text. `message.reasoning_content` is ignored by default and can only be used with explicit `allowReasoningContentFallback: true`.
- REST structured JSON output is enabled by default. It sends `response_format: { type: "json_object" }`, instructs the model to return only JSON, and validates `grammarCandidate`, `confidence`, `needsClarification`, `ambiguities`, and `notes`.
- REST structured output can be disabled only with explicit `structuredOutput: false` or `REST_STRUCTURED_OUTPUT=false`. `responseFormat` or `REST_RESPONSE_FORMAT` may provide `json_object` or `json_schema` response formats.
- REST structured grammar defaults to the provider-neutral `portable_v1` profile. `structuredGrammarProfile` or `REST_STRUCTURED_GRAMMAR_PROFILE` can select `portable_v1` or `edge_v1`; both use the safe `intentClass` enum: `control`, `observe`, `generate`, `transform`, `deliver`, `share_candidate`, `inform_operator`, and `protected_operation`.
- REST structured normalization maps explicit synonyms such as `device_control` to `control`, `status` / `read-only` to `observe`, and simple targets like `yard lights` to object-shaped targets such as `{ actorGroup: "yard_lights", selectedActorIds: [] }`.
- REST structured control normalization handles known safe actions such as `turn_off` / `turn_on`, adds bounded grammar defaults such as `execution.mode: "one_shot"` and `authorityHint: "none"`, and never invents concrete actor IDs.
- REST structured normalization maps flat scope strings to object scope, for example `"yard"` to `{ area: "yard" }`, and normalizes idempotency synonyms such as `idempotent` / `repeatable` to `conditional`.
- REST structured prompts are compact by default: they include profile, security posture, input text, minimal explicit context, allowed enums, and the target schema instead of dumping full continuity or large control surfaces.
- REST structured invalid-JSON errors include only a short redacted `message.content` prefix for provider debugging; request headers, API keys, and full prompts are not included.
- Ollama structured output uses the same shared parser and normalizer as REST where practical, requests JSON from `/api/generate`, preserves validated model confidence, and blocks malformed/free-text command output instead of returning a hardcoded confidence.
- Codex CLI output uses `codex exec --sandbox read-only --json --color never --ephemeral --output-last-message --output-schema`, reads the structured prompt from stdin, and parses the final assistant message through the shared structured normalizer.
- Codex CLI requires a locally installed and configured `codex` executable. It is optional, explicit, and not required for CI; live tests run only with `RUN_CODEX_CLI_LIVE_TESTS=1`.
- Codex CLI options can be supplied with `CODEX_CLI_COMMAND`, `CODEX_CLI_MODEL`, and `CODEX_CLI_STRUCTURED_GRAMMAR_PROFILE`, or by constructor options.
- Future providers should use the shared structured parser/normalizer and add provider policy tests.

## Non-Goals

This package does not:

- execute actions
- call tools or functions
- act as an agent runtime
- manage long-lived memory
- orchestrate workflows
- interact with mesh systems

## Notes

- `grammarCandidate` is intentionally flexible. This package does not deeply enforce its internal shape beyond result validation.
- The package is intended as a reusable building block for applications that want a small, explicit translation layer over multiple provider backends.
