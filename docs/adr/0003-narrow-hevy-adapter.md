# ADR 0003: Maintain a narrow, runtime-validated Hevy adapter

- Status: Accepted
- Date: 2026-08-19
- Issue: #3

## Context

Hevy publishes an evolving OpenAPI document. An independent MIT implementation
demonstrates that the upstream document has required-field, enum, reference,
example and type inconsistencies. Its generated Hevy package is private to its
monorepo and its MCP transport is unnecessary for MesoForge.

## Decision

MesoForge will maintain a small adapter covering only workout retrieval,
workout-event reconciliation, routine retrieval and routine replacement.
Successful responses are treated as unknown data until Zod validation passes.

Read retries are bounded by one absolute deadline. Routine writes are not
retried after dispatch ambiguity and are blocked unless the exact routine ID is
explicitly allowlisted for sandbox validation.

Diagnostics use endpoint templates and must never contain API keys, resource
identifiers, titles, notes or workout content.

## Consequences

- Hevy contract drift fails closed instead of corrupting training state.
- The adapter is understandable and testable without generating unused API
  operations.
- We must maintain local schemas as the small set of required endpoints evolves.
- Live write semantics still require a controlled disposable-routine test.
