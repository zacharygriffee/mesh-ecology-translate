# TODO

## Adjacent Tool Interop Alignment

- [ ] Keep translate aligned as the translation-only profile of the shared descriptor/request/receipt seam.
  - Treat "local layer" as operator-facing explicit artifact interop: Edge may submit bounded translation requests and inspect translation results without translate gaining tools, authority, execution, or mesh behavior.
  - Treat existing `TranslationRequest` and `TranslationResult` as the stable request/result pair for Edge ingress.
  - Support richer explicit context payloads from Edge only as translation input:
    - operator focus
    - active referents
    - portal/export visibility
    - continuity summaries
    - ambiguity markers
    - reason/evidence references
  - Consider other translate local-layer surfacable capabilities:
    - provider profile descriptors
    - provider availability posture
    - supported input/context vocabulary
    - normalized provider error receipts
  - Do not add tool calling, execution, authority, mesh interaction, workflow/runtime behavior, hidden memory, or agent loops.
  - Accept when: Edge can use translate for common-language ingress while translate remains provider-routing/normalization only.

## Potential Provider Support Plan

These are possible future provider support targets that fit the current library posture. This is a planning note only, not a commitment.

### Likely To Work With The Current `rest` Adapter

- OpenRouter
  - Good fit for multi-model routing behind a single OpenAI-compatible endpoint.
  - Likely configuration-first support.

- Groq
  - Good fit for low-latency hosted inference.
  - Likely small compatibility review for unsupported OpenAI fields.

- Together AI
  - Good fit for hosted open-source models behind an OpenAI-compatible API.
  - Likely configuration-first support.

- Fireworks
  - Good fit for hosted OSS inference with OpenAI-compatible chat APIs.
  - Likely configuration-first support.

### Likely To Work With Minor Compatibility Review

- Gemini
  - Google exposes an OpenAI-compatible endpoint.
  - Should be treated as compatible with caveats rather than assumed fully drop-in.

- Self-hosted OpenAI-compatible inference stacks
  - Examples: vLLM, TGI, similar gateways.
  - Useful for private or controlled deployments.

### Better Served By A Dedicated Adapter

- Anthropic
  - Important provider to consider, but likely better handled with a native adapter than long-term reliance on OpenAI-compatibility mode.

## Prioritization Suggestion

1. OpenRouter
2. Groq
3. Together AI or Fireworks
4. Gemini
5. Anthropic native adapter

## Guardrails

- Keep provider additions within the existing translation-layer scope.
- Do not add tool calling, execution, authority, orchestration, or agent runtime behavior.
- Prefer configuration-level compatibility over new adapter code when the current `rest` adapter is sufficient.
