# Contracts

## TranslationRequest

`TranslationRequest` is the input contract for the translation layer.

Fields:

- `inputs`: array of `{ type: "text", content: string }`
- `profile`: one of `command`, `conversational`, `clarification`
- `continuity`: optional object carrying prior grammar or conversation state
- `context`: optional explicit Edge context object, limited to the supported translation context vocabulary
- `providerPreference`: one of `local_preferred`, `local_only`, `remote_allowed`, `specific`
- `provider`: optional provider name, required when `providerPreference` is `specific`
- `securityPosture`: one of `sensitive`, `standard`, `public`
- `timeoutMs`: optional positive number for provider call timeout budget
- `signal`: optional AbortSignal-compatible object for runtime cancellation

Validation rules:

- v1 accepts text inputs only
- `inputs` must be non-empty
- `content` must be a non-empty string
- enum fields must match the supported values
- `provider` is required only for `specific`
- `context` may contain only JSON-compatible values under supported context fields
- `timeoutMs` must be positive when provided
- `signal` is runtime-only and is not meant for serialization

Supported context fields:

- `operatorFocus`
- `activeReferents`
- `portalVisibility`
- `exportVisibility`
- `continuitySummaries`
- `ambiguityMarkers`
- `reasonReferences`
- `evidenceReferences`

Context is translation input only. It may help providers interpret user text, but it does not grant tools, authority, execution behavior, mesh access, hidden memory, or workflow behavior.

## TranslationResult

`TranslationResult` is the normalized provider output.

Fields:

- `grammarCandidate`: portable candidate object for downstream consumers
- `confidence`: number from `0` to `1`
- `ambiguities`: array of strings
- `needsClarification`: boolean
- `notes`: optional array of strings
- `providerInfo`: object containing:
  - `provider`
  - `model`
  - `latency` optional

The grammar candidate is portable provider output. Structured provider results are normalized before return so REST/OpenAI-compatible providers, Ollama, codex-cli, and future adapters can expose the same contract-level shape.

The default structured candidate schema is `generic_candidate_v1`. It includes `actionFamily`, `targetClass`, `targetRefs`, candidate-level `confidence`, `ambiguities`, `unresolvedFields`, `idempotency`, `reversibility`, optional clarification fields, and required `nonAuthority` flags. When `schemaVersion` is `generic_candidate_v1`, public `validateTranslationResult` deeply validates the candidate.

Unknown targets are valid bounded candidates. They use `targetClass: "unknown"`, `targetRefs: []`, populated `unresolvedFields`, and a `requiredOperatorDecision`; when the action or target cannot be mapped safely, the normalized `actionFamily` is `request_clarification`.

Legacy structured grammar candidates with fields such as `intentClass`, `action`, object-shaped `target`, `scope`, `idempotency`, `consequenceClass`, `execution`, and `success` remain adapter compatibility behavior, but they are not the default provider prompt.

Free-text interpretation is legacy behavior and is not a successful command/profile result unless explicitly represented as clarification or error. See [Provider Policy](./provider-policy.md).

## ProviderAdapter

Provider adapters implement a single required method:

```js
translate(request: TranslationRequest): Promise<TranslationResult>
```

The seed providers also expose `isAvailable()` so the router can make explicit routing decisions. Availability checks are operational helpers, not part of the core translation contract.

Provider adapters must normalize raw provider output into the portable contract before returning. Consumers should not need provider-specific branches for REST, Ollama, or future adapters.

## Failure Shape

Provider and routing failures use a small explicit error shape with a `code` field. Current codes include:

- `PROVIDER_UNAVAILABLE`
- `PROVIDER_TIMEOUT`
- `PROVIDER_INVALID_RESPONSE`
- `UNSUPPORTED_PROVIDER`
- `REQUEST_CANCELLED`
- `ROUTING_FAILURE`
