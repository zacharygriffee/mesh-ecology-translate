# Contracts

## TranslationRequest

`TranslationRequest` is the input contract for the translation layer.

Fields:

- `inputs`: array of `{ type: "text", content: string }`
- `profile`: one of `command`, `conversational`, `clarification`
- `continuity`: optional object carrying prior grammar or conversation state
- `providerPreference`: one of `local_preferred`, `local_only`, `remote_allowed`, `specific`
- `provider`: optional provider name, required when `providerPreference` is `specific`
- `securityPosture`: one of `sensitive`, `standard`, `public`

Validation rules:

- v1 accepts text inputs only
- `inputs` must be non-empty
- `content` must be a non-empty string
- enum fields must match the supported values
- `provider` is required only for `specific`

## TranslationResult

`TranslationResult` is the normalized provider output.

Fields:

- `grammarCandidate`: opaque object for downstream consumers
- `confidence`: number from `0` to `1`
- `ambiguities`: array of strings
- `needsClarification`: boolean
- `notes`: optional array of strings
- `providerInfo`: object containing:
  - `provider`
  - `model`
  - `latency` optional

The grammar candidate remains intentionally opaque in this repository. The seed implementation returns a simple structure that records profile, source text, interpretation, template, and continuity.

## ProviderAdapter

Provider adapters implement a single required method:

```js
translate(request: TranslationRequest): Promise<TranslationResult>
```

The seed providers also expose `isAvailable()` so the router can make explicit routing decisions. Availability checks are operational helpers, not part of the core translation contract.
