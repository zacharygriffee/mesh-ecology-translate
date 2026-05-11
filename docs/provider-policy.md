# Provider Policy

`mesh-ecology-translate` is provider-neutral. It is not an Edge submodule, but it owns provider normalization so consumers do not need provider-specific branches.

This policy applies to REST/OpenAI-compatible providers, Ollama, and future local or remote adapters.

## Provider-Neutral Contract

Every provider must return the same validated `TranslationResult` shape.

Provider adapters may differ internally, but their returned contract must be portable. Consumers should not need special handling for REST, Ollama, or a future adapter after a result leaves Translate.

Translate owns the boundary between provider-native output and the portable translation contract.

## Structured Output First

Command/profile providers must prefer structured JSON output.

Free-text interpretation is not a successful command result. If a provider returns free text for a command profile, the adapter must block with a provider invalid response error or return an explicit clarification/error result. It must not wrap prose as a successful command grammar candidate.

Provider output must be parsed, normalized, and validated before it is returned.

## Shared Normalization

REST/OpenAI-compatible providers and Ollama must use shared parser and normalizer logic where practical. Future providers must pass through the same normalization pipeline unless they document and test a narrowly equivalent adapter-specific path.

The following semantics must remain consistent across providers:

- confidence
- ambiguity
- target
- scope
- idempotency
- consequence class
- execution
- success
- provenance
- metadata

Provider-specific quirks belong inside adapters or shared normalization. They must not leak into consumer contracts.

## Confidence Policy

Providers must not use hardcoded confidence for successful structured output.

Confidence must come from validated provider output or from an explicit documented adapter scoring rule. If scoring is adapter-derived, it must be transparent and covered by tests.

Confidence should not silently sit below known consumer thresholds for otherwise valid structured output. A low confidence result is valid only when it reflects actual model or adapter uncertainty.

## Grammar Candidate Shape

Normalized generic candidates must include the portable contract fields needed by downstream consumers:

- `version`
- `profile`
- `sourceText`
- `schemaVersion: "generic_candidate_v1"`
- `actionFamily`
- `targetClass`
- `targetRefs`
- candidate-level `confidence`
- ambiguity information
- `idempotency`
- `reversibility`
- `nonAuthority`
- provenance or metadata when useful

Providers may include additional metadata, but additional fields must not grant authority, imply execution, imply mutation, select truth, or require provider-specific consumer logic. Legacy `intentClass` / `action` structured output is compatibility behavior only.

## Provider Adapter Responsibilities

Each provider adapter must:

- declare provider name, model, and kind
- declare whether it supports structured output
- validate the raw provider response
- normalize provider-specific quirks
- reject malformed or unsafe output clearly
- preserve provider metadata without leaking provider-native shape into the portable contract
- never execute operator intent
- never call tools or functions as part of translation
- preserve timeout and cancellation behavior

## Failure Behavior

Adapters must fail explicitly:

- malformed JSON -> provider invalid response
- missing required fields -> provider invalid response
- unsafe authority or execution claims -> blocked or provider invalid response
- free-text command output -> clarification/error, not successful command candidate
- unsupported provider shape -> explicit error

Adapters must not hide retries, silently repair broad malformed output, invent actor IDs, grant authority, execute actions, publish to mesh, or convert provider reasoning into final output.

## Tests Required For Every Provider

Each provider must have tests for:

- valid structured command result
- malformed response
- missing required fields
- confidence behavior
- target object normalization
- scope object normalization
- idempotency normalization
- unsafe authority claim rejection
- provider metadata preservation
- no execution or tool calls
- timeout and cancellation behavior when the provider performs I/O

Provider tests should also include fixture parity against at least one existing provider when practical.

## Edge Compatibility

Edge is an initial consumer and proof target, not the owner of Translate.

Translate output must remain portable. Edge-compatible fixtures should be included so drift is caught early, but the contract must not depend on Edge runtime internals, Edge imports, Edge calls, or Edge authority.

If Translate changes portable grammar semantics, update Translate tests and notify/update Edge consumers together.

## Future Provider Onboarding Checklist

Before adding a provider:

- implement the adapter
- use the shared parser/normalizer where practical
- add provider policy tests
- add an Edge-compatible fixture if applicable
- document provider environment variables and constructor options
- verify no execution, tool calling, streaming requirement, or hidden retry behavior is introduced
- verify malformed and unsafe provider output fails clearly
- verify no provider-specific consumer branch is needed
