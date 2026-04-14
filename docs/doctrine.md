# Doctrine

`mesh-ecology-translate` is a translation layer only.

It accepts input context, selects a provider, and returns grammar candidates for downstream consumers such as Edge.

Core doctrine:

- Produce grammar candidates only.
- Remain local-first.
- Keep provider behavior explicit and readable.
- Avoid mesh semantics and execution semantics.

This repository does not:

- execute commands or workflows
- authorize anything
- publish anything
- interact with mesh infrastructure
- call tools or functions
- run an agent loop

Edge owns grammar definition, execution, policy, authority, and mesh interaction. This repository only translates input into candidate structures that Edge can consume.
