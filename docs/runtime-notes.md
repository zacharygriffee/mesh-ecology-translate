# Runtime Notes

`mesh-ecology-translate` is library-shaped. Consumers are expected to supply runtime configuration.

Notes:

- The library reads provider configuration from `process.env` only if the host process has already populated it.
- The library does not auto-load `.env` files by default.
- Consumers may pass provider options directly when constructing adapters or routers.
- Provider calls use a default timeout of `30000ms` unless `TranslationRequest.timeoutMs` overrides it.
- Consumers may cancel in-flight requests with `TranslationRequest.signal`.
- Output normalization is conservative and currently strips obvious reasoning wrappers such as `<think>...</think>`.
