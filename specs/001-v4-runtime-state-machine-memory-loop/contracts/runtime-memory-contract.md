# Runtime, Feedback, and Memory Contract

## Contract Layers

This feature defines contracts and a thin `POST /api/runtime` backend endpoint.
The endpoint does not take over full planning, Mock tools, candidate plan
generation, or execution queue logic.

The V4 contract has three layers:

1. Existing compatible endpoints:
   - `POST /api/intent`
   - `POST /api/feedback`
   - `POST /api/memory-candidates/{candidate_id}/decision`
2. Thin aggregate endpoint:
   - `POST /api/runtime`
3. Mock boundary:
   - execution actions remain simulated until a later integration spec explicitly
     allows real external platform actions.

Machine-readable schemas:

- `intent.schema.json` covers the existing intent endpoint.
- `feedback-memory.schema.json` covers feedback, memory candidates, decisions,
  long-term memory, and memory usage records.
- `runtime.schema.json` covers the thin runtime aggregate request/response,
  runtime session, runtime event, runtime state, allowed transition table, and
  frontend migration boundary.

## Compatibility Rule

Existing clients must continue to work against the current alpha endpoints. The
schemas document current and thin Runtime contracts; they do not require old
clients to migrate away from the existing alpha endpoints. Existing success
shapes remain stable, while explicit privacy rejection and recoverable storage
failure responses are additive safety behavior.

## Existing Endpoint: POST /api/intent

Purpose: return a normalized intent and relevant lessons when the optional backend
is available, or a documented error shape that the front end can recover from.

Compatibility requirements:

- Success keeps `ok: true`, `source: "llm"`, `runtimePath`, `intent`, and
  `lessonsUsed`.
- Error keeps `ok: false`, `source`, `runtimePath`, `intent: null`, `error`, and
  `lessonsUsed`.
- `runtimePath` continues to distinguish `langgraph` and `direct_llm`.
- Missing API key, LLM errors, low confidence, or invalid intent remain
  recoverable.
- If SQLite cannot be read, the endpoint keeps the recoverable error shape with
  `source: "sqlite_unavailable"`, `error: "storage_unavailable"`, and
  `lessonsUsed: []`.

Runtime state mapping:

- Success with complete required fields:
  `intent_loading -> planning_local`.
- Success with missing required fields:
  `intent_loading -> clarifying`.
- Recoverable error:
  `intent_loading -> failed_recoverable -> planning_local`.

## Existing Endpoint: POST /api/feedback

Purpose: record user feedback and optionally create a pending memory candidate.

Compatibility requirements:

- Existing request fields remain `input`, `llmIntent`, `userCorrection`, and
  `failureType`.
- Existing response keeps `ok`, `feedbackId`, `candidate`, and `message`.
- Feedback containing sensitive or non-actionable content may return
  `candidate: null`.
- A created candidate must remain `pending` until a later user decision.
- If SQLite cannot accept feedback, the endpoint returns HTTP `503` with
  `ok: false`, `error: "storage_unavailable"`, and `recoverable: true`.

Runtime state mapping:

- Candidate created:
  `feedback_capture -> memory_candidate_review`.
- No reusable candidate:
  `feedback_capture -> done`.

Memory rules:

- Feedback is always an event first, not long-term memory.
- L2/L3 sensitive feedback is blocked from long-term memory by default.
- A reusable memory requires explicit `adopt` or `correct`.

## Existing Endpoint: POST /api/memory-candidates/{candidate_id}/decision

Purpose: apply the user decision for a pending candidate.

Compatibility requirements:

- Existing actions remain `adopt`, `ignore`, and `correct`.
- Existing success response keeps `ok`, `candidateId`, `status`, `memoryId`, and
  `memory`.
- Already-decided or missing candidates remain explicit errors.
- `ignore` must not create long-term memory.
- `correct` requires a non-blank `correctedValue` and re-runs the unified
  long-term memory admission gate before any long-term memory write.
- The long-term memory admission gate evaluates every field that will be written
  or indexed as memory, including `type`, `key`, `value`, `evidence`, `scope`,
  `source`, and derived `search_text`.
- L2/L3 corrected content or third-party execution authorization data returns
  `sensitive_correction_blocked`; the candidate stays `pending` so the user can
  retry with a safe correction.
- `adopt` defensively re-checks the full stored candidate before writing, so a
  legacy or externally corrupted sensitive candidate cannot bypass the boundary.
- Privacy rejection responses must not echo `candidate.value`,
  `candidate.evidence`, or other candidate text; they return only safe metadata
  such as `candidateId`, `candidateStatus`, `error`, and `sensitivityLevel`.
- If SQLite cannot apply the decision, the endpoint returns HTTP `503` with the
  recoverable storage failure shape.

Runtime state mapping:

- Adopt:
  `memory_candidate_review -> memory_committed -> done`.
- Correct:
  `memory_candidate_review -> memory_committed -> done`.
- Ignore:
  `memory_candidate_review -> done`.

## Thin Endpoint: POST /api/runtime

`POST /api/runtime` is a thin V4 aggregation endpoint. It is frontend-agnostic
and carries runtime state plus backend enhancement results only.

Intended role:

- Accept a user input plus optional session/event data.
- Coordinate intent, recoverable fallback, feedback, and memory contracts behind
  one stable runtime boundary.
- Return the current runtime state and allowed next states after each turn.
- Let the current frontend or a future UI continue to obtain plan results from
  `agent-core.js` until a later planning migration.

Required contract properties:

- Every response exposes `currentState` and `allowedNextStates`.
- Clarification responses stop before tool research or plan merge.
- Intent and lesson-retrieval failures route through `failed_recoverable` and
  preserve fallback to local planning.
- Storage failure while capturing feedback or deciding a candidate returns
  `operation_recoverable_failure` and preserves the active review state for
  retry rather than returning to planning.
- Audit JSONL writes are best-effort telemetry for this alpha slice. Audit write
  failure after a successful SQLite commit must not turn the committed operation
  into a client-visible failure or retry instruction.
- A privacy-rejected correction returns `memory_decision_rejected` in
  `memory_candidate_review`; malformed actions are request-validation failures
  and do not create runtime events.
- Feedback and memory responses preserve the existing candidate-first memory
  loop.
- Current request constraints always override retrieved long-term memory.
- Runtime responses must not contain DOM fields, current `app.js` component
  state, or frontend-specific display structures.
- Runtime responses must not expose `agentLoopTrace` as a contract field; clients
  may render their own trace from `events`.

The minimum response scenarios are:

- `planning_ready`: backend enhancement is complete enough for frontend planning.
- `clarification_required`: the system must ask for missing group or time data.
- `recoverable_failure`: backend, LLM, LangGraph, or SQLite failed but local
  planning may continue.
- `feedback_captured`: feedback was stored and may have produced a candidate.
- `memory_committed`: an adopted or corrected candidate became long-term memory.
- `memory_decision_rejected`: a valid decision request was not committed and the
  candidate remains reviewable.
- `operation_recoverable_failure`: feedback or candidate-decision storage is
  temporarily unavailable and the current operation may be retried.

## Frontend Migration Rule

When the UI is replaced, the new frontend must use a hybrid dependency model:

- `agent-core.js` remains the temporary planning engine for local planning, Mock
  tools, candidate packages, verifier/revise, and execution queue behavior.
- `POST /api/runtime` provides backend Runtime state, intent/fallback,
  feedback, memory candidate, and memory decision results.
- The new UI should consume both contracts without making Runtime depend on a
  specific page structure.
- A later migration may move planning behind Runtime, but that requires a
  separate plan because it changes the project core flow.

## Runtime State Machine

The state machine is fixed for this contract phase:

| State | Allowed next states |
| --- | --- |
| `intent_loading` | `clarifying`, `planning_local`, `failed_recoverable` |
| `clarifying` | `planning_local` |
| `planning_local` | `researching_tools` |
| `researching_tools` | `merging_plans` |
| `merging_plans` | `verifying_plan` |
| `verifying_plan` | `ready_for_confirmation`, `replanning` |
| `replanning` | `verifying_plan` |
| `ready_for_confirmation` | `executing_mock_actions`, `feedback_capture` |
| `executing_mock_actions` | `feedback_capture` |
| `feedback_capture` | `feedback_capture`, `memory_candidate_review`, `done` |
| `memory_candidate_review` | `memory_candidate_review`, `memory_committed`, `done` |
| `memory_committed` | `done` |
| `failed_recoverable` | `planning_local` |
| `done` | none |

The same table is encoded in `runtime.schema.json` under
`x-runtimeTransitions` so automated tests can detect drift.

## Mock Boundary Contract

The runtime contract must keep these categories separate:

- LLM or local rule understanding.
- Seed or LLM-assisted POI candidates.
- Mock real-time fields such as distance, queue, availability, and route time.
- Mock execution actions such as booking, ordering, buying, queueing, notifying,
  and reminding.

No state transition may imply real external execution until a later integration
spec explicitly changes this contract.

Contact, identity, order, payment, authorization codes, access tokens, refresh
tokens, API keys, credentials, and similar data authorized for future real
platform execution are not long-term preference memories. A later integration
spec must define a separate purpose-limited authorization channel before such
data can be handled.

## Implementation Boundary

This contract implements a thin backend Runtime in `server.py`; the current
hardening updates `backend_core.py` privacy enforcement, safe rejection response
shapes, best-effort audit behavior, and storage failure responses without
migrating frontend planning or Mock execution. The three existing alpha
endpoints remain available for old clients unless a later migration spec says
otherwise.
