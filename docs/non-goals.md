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
- Edge runtime fetches, Edge calls, or Edge mutation
- provider calls from static review evidence helpers
- translation generation from static review fixtures
- evals or benchmarks for static review fixtures
- scheduler, runner, or live discovery behavior
- mesh publication
- production proof, project completion proof, mesh truth, translation truth, translation quality proof, or model correctness claims
- adjacent acceptance from static packet presence

Operational hardening in this repository is limited to translation-layer concerns such as timeout handling, cancellation, conservative output normalization, and explicit provider errors.

If a feature starts to imply execution, authority, or mesh semantics, it belongs elsewhere.
