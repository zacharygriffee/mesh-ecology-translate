# Non-Goals

This repository intentionally does not include:

- agent runtime behavior
- tool or function use
- authority or policy systems
- mesh adapters or mesh interaction
- execution pipelines
- publication or dispatch logic
- long-lived memory systems
- local mesh assumptions
- automatic environment loading or application bootstrapping

Operational hardening in this repository is limited to translation-layer concerns such as timeout handling, cancellation, conservative output normalization, and explicit provider errors.

If a feature starts to imply execution, authority, or mesh semantics, it belongs elsewhere.
