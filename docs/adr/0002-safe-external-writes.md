# ADR 0002: Default to recommendation-only operation

- Status: Accepted
- Date: 2026-08-19
- Issue: #1

## Context

MesoForge will eventually update the next Hevy routine. A faulty rule, stale
event, or incorrect routine mapping could otherwise alter a live prescription
without an obvious recovery path.

## Decision

All environments default to `recommendation-only`. Domain output explicitly
marks external writes as disallowed. Enabling writes later will require:

1. a versioned and replay-tested rule set;
2. a positive mapping between the completed workout and next routine;
3. freshness and supersession checks;
4. an auditable proposed request;
5. an explicit deployment configuration change.

Workout history will never be rewritten. Only the intended future routine may
be updated.

## Consequences

- Early releases can ingest real data without changing training plans.
- End-to-end write behavior cannot be tested in production until explicitly
  enabled.
- The persistence model must retain blocked and proposed routine updates.
