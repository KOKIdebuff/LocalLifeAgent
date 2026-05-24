# Runtime Readiness Checklist: V4 Runtime State Machine and Memory Loop

**Purpose**: Validate cross-artifact readiness before future implementation  
**Created**: 2026-05-24  
**Feature**: [spec.md](../spec.md)

## State Contract

- [x] All current trace stages are mapped to runtime states.
- [x] Every state has an allowed next state.
- [x] Clarification stops planning when key fields are missing.
- [x] Backend failure remains recoverable.

## Memory Boundary

- [x] Feedback does not automatically become long-term memory.
- [x] Adopt/correct is required before long-term memory creation.
- [x] Ignore completes the flow without memory creation.
- [x] L2/L3 sensitive content is blocked by default.

## Compatibility

- [x] `/api/intent` compatibility is documented.
- [x] `/api/feedback` compatibility is documented.
- [x] `/api/memory-candidates/{candidate_id}/decision` compatibility is documented.
- [x] No current wire-shape change is required.

## Mock Honesty

- [x] Mock real-time fields remain distinct from real data.
- [x] Mock execution actions remain distinct from real external execution.
- [x] No artifact claims real booking, payment, queueing, messaging, or inventory access.
