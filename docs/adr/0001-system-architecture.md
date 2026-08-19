# ADR 0001: Separate the hypertrophy domain from delivery infrastructure

- Status: Accepted
- Date: 2026-08-19
- Issue: #1

## Context

MesoForge must make bodybuilding decisions using workout performance and
recovery feedback while integrating with Hevy and Cloudflare. If those rules are
implemented inside HTTP or database handlers, they become difficult to test,
explain, replay, or move to another platform.

## Decision

The hypertrophy model will be a framework-independent TypeScript package.
Cloudflare Workers, Hevy clients, persistence, and user interfaces are adapters
around that domain.

Domain functions must be deterministic for the same versioned inputs. Their
outputs must include rationale suitable for an audit trail.

## Consequences

- Historical workouts can be replayed without network calls.
- Training-policy changes can be reviewed independently from infrastructure.
- External payloads require explicit translation and validation.
- Some types will be duplicated at boundaries rather than leaking vendor models
  into the domain.
