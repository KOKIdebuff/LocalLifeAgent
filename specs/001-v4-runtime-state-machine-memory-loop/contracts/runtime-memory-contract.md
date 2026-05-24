# Runtime and Memory Contract

## Compatibility Rule

This feature does not require request or response shape changes. Existing clients
must continue to work against the current endpoints.

## POST /api/intent

Purpose: return a normalized intent and relevant lessons when the optional backend
is available, or a documented error shape that the front end can recover from.

Compatibility requirements:
- Success keeps `ok: true`, `source: "llm"`, `runtimePath`, `intent`, and `lessonsUsed`.
- Error keeps `ok: false`, `source`, `runtimePath`, `intent: null`, `error`, and `lessonsUsed`.
- `runtimePath` continues to distinguish `langgraph` and `direct_llm`.
- Missing API key, LLM errors, low confidence, or invalid intent remain recoverable.

Runtime state mapping:
- Success: `intent_loading -> planning_local` or `intent_loading -> clarifying`.
- Recoverable error: `intent_loading -> failed_recoverable -> planning_local`.

## POST /api/feedback

Purpose: record user feedback and optionally create a pending memory candidate.

Compatibility requirements:
- Existing request fields remain `input`, `llmIntent`, `userCorrection`, and `failureType`.
- Existing response keeps `ok`, `feedbackId`, `candidate`, and `message`.
- Feedback containing sensitive or non-actionable content may return `candidate: null`.

Runtime state mapping:
- `feedback_capture -> memory_candidate_review` when a candidate is created.
- `feedback_capture -> done` when no reusable candidate is created.

## POST /api/memory-candidates/{candidate_id}/decision

Purpose: apply the user decision for a pending candidate.

Compatibility requirements:
- Existing actions remain `adopt`, `ignore`, and `correct`.
- Existing response keeps `ok`, `candidateId`, `status`, `memoryId`, and `memory` on success.
- Already-decided or missing candidates remain explicit errors.

Runtime state mapping:
- Adopt/correct: `memory_candidate_review -> memory_committed -> done`.
- Ignore: `memory_candidate_review -> done`.

## Mock Boundary Contract

The runtime contract must keep these categories separate:
- LLM or local rule understanding.
- Seed or LLM-assisted POI candidates.
- Mock real-time fields such as distance, queue, availability, and route time.
- Mock execution actions such as booking, ordering, buying, queueing, notifying, and reminding.

No state transition may imply real external execution until a later integration
spec explicitly changes this contract.
