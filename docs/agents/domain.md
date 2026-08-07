# Domain Docs

Pixel Forge uses a single-context domain-documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

These rules apply across the browser editor, shared contracts, server, and telemetry worker. Nested `AGENTS.md` files continue to define runtime-specific engineering rules.

If a domain file or ADR directory does not exist, proceed silently. Do not propose creating it upfront. The domain-modeling workflow creates documentation lazily when terminology or decisions are resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
├── src/
├── shared/
├── server/
└── workers/
    └── telemetry/
```

## Use the glossary’s vocabulary

When naming a domain concept in an issue, proposal, hypothesis, test, or implementation, use the term defined in `CONTEXT.md`. Do not drift to synonyms that the glossary explicitly avoids.

If a required concept is absent, reconsider whether the new term is necessary or record the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it:

> _Contradicts ADR-0007 — but worth reopening because…_
