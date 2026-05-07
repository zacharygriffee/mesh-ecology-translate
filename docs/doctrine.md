# Doctrine

`mesh-ecology-translate` is a translation layer only.

It accepts input context, selects a provider, and returns grammar candidates for downstream consumers such as Edge.

Edge may pass explicit translation context such as operator focus, active referents, visibility hints, continuity summaries, ambiguity markers, and reason or evidence references. The context is treated only as provider input for translation.

Core doctrine:

- Produce grammar candidates only.
- Remain local-first.
- Keep provider behavior explicit and readable.
- Normalize provider outputs into one portable `TranslationResult` contract.
- Avoid mesh semantics and execution semantics.
- Fail explicitly on timeout, cancellation, and invalid provider responses.
- Prefer structured provider output for command profiles.

This repository does not:

- execute commands or workflows
- authorize anything
- publish anything
- interact with mesh infrastructure
- call tools or functions
- run an agent loop
- turn explicit context into authority, execution, workflow behavior, or hidden memory

Translate owns provider normalization and emits portable candidate structures. Edge is an initial consumer and proof target, not the owner of this repository's provider contract.

Downstream consumers own their own execution, policy, authority, and mesh interaction. This repository only translates input into candidate structures that consumers can inspect.

As a library, this repository expects runtime configuration to be supplied by the consumer. It does not auto-load `.env` files by default.

See [Provider Policy](./provider-policy.md) for adapter requirements and future provider onboarding rules.
