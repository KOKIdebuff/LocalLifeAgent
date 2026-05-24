# Research: V4 Runtime State Machine and Memory Loop

## Decision: Start with documentation and contract governance

**Rationale**: The current project already has a V3 demo path and V4 alpha endpoints.
Changing runtime code before agreeing on state and memory boundaries would risk
breaking fallback behavior.

**Alternatives considered**:
- Implement the state machine immediately: rejected because API and memory semantics
  still need stable documentation.
- Leave existing docs only: rejected because V4 high-risk work needs a stricter gate.

## Decision: Preserve existing endpoint behavior in the first V4 slice

**Rationale**: `/api/intent`, `/api/feedback`, and
`/api/memory-candidates/{candidate_id}/decision` already support the alpha flow.
The first step should document compatibility, not introduce new wire shapes.

**Alternatives considered**:
- Add a new `/api/runtime` endpoint immediately: rejected as too broad for this phase.
- Move all planning to the backend now: rejected because the static demo fallback is
  still a non-negotiable project principle.

## Decision: Treat memory as candidate-first, not automatic storage

**Rationale**: The current implementation already distinguishes feedback events,
memory candidates, adopted memories, and memory usage events. This matches the
project's privacy boundary.

**Alternatives considered**:
- Store all feedback directly: rejected due to sensitive-data and trust risk.
- Disable memory until later: rejected because the alpha loop already exists and
  needs governance.

## Decision: Map current trace stages before adding new runtime states

**Rationale**: The UI already exposes `understand`, `planner`, `researchers`,
`merger`, `verifier`, `revise`, and `reflect`. V4 should explain and stabilize
those stages rather than inventing a separate hidden flow.

**Alternatives considered**:
- Replace trace stages with backend-only state names: rejected because it would
  weaken user-visible explainability.
- Keep trace as UI-only decoration: rejected because future runtime work needs a
  shared lifecycle vocabulary.
