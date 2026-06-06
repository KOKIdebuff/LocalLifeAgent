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

## Product-Grade Headless Boundary

The V4 product-grade target is a headless Runtime, not a UI runtime. The Runtime
Core owns session lifecycle, state-machine transitions, runtime events,
persistence, and recovery points. It must not own cards, buttons, layout,
frontend interaction details, external real execution, public collaboration, or
payment / booking / messaging platform behavior.

The stable access surface is split into three contracts:

- `RuntimeAdapter`: how clients call Runtime operations such as create session,
  get session, submit an event intent, pause, resume, close, list events, query
  capabilities, create recovery point, and rollback to a recovery point.
- `Capability Contract`: both the frozen `targetCapabilities` product target and
  the authoritative `effectiveCapabilities` of the current running
  implementation. Clients use only effective capabilities for enablement and
  fallback decisions.
- `Event Contract`: what happened inside Runtime, expressed as UI-agnostic
  events that a frontend may render but must not mutate.

V5 UI must consume Runtime only through these three contracts. It must not read
Runtime tables, depend on Runtime internal classes, require Runtime to return UI
cards, or add Runtime capabilities merely because a UI sketch contains a button.

## Runtime P0 State-Machine Source

`runtime-state-machine.json` is the single source of truth for V4 Runtime P0:

- Runtime states and terminal-state markers.
- Lifecycle states.
- Command to Event mappings.
- Legal Runtime and lifecycle transitions.
- Transition guards.
- Recovery Point retention and replay boundaries.

`RuntimeState`, `RuntimeEventType`, `RuntimeTransition`,
`x-runtimeTransitions`, state-machine documentation, and the transition test
matrix are generated or verified against this file. CI must fail when a derived
artifact drifts from the source.

`x-runtimeTransitions` remains explanatory metadata. It is not a security or
correctness mechanism. Standard JSON Schema `oneOf` transition constraints and
the server-side Transition Engine enforce legal transitions.

The approved machine version is `v4-p0-2`. It replaces three semantically
incorrect transition Events:

- `ready_for_confirmation -> confirmation_accepted -> executing_mock_actions`
- `executing_mock_actions -> mock_execution_completed -> feedback_capture`
- `failed_recoverable -> recovery_resumed -> planning_local`

The removed combinations remain invalid in the product-grade Event stream.

## Runtime P0 Transition Engine

All product-grade state changes must pass through one Transition Engine:

1. Validate the Adapter write envelope and event intent.
2. Read the persisted session; client-provided `fromState` is not trusted.
3. Check lifecycle state, current Runtime state, declared Event, target state,
   and guards.
4. Compare `expectedVersion` with persisted `session.version`.
5. Enforce the unique `idempotencyKey`.
6. Generate the authoritative Event.
7. Write the Event and updated session in the same database transaction.

An illegal transition returns `invalid_transition` with the current Runtime
state and allowed Events, without exposing internal guard data. A stale write
returns `version_conflict`. `done` and lifecycle `closed` are terminal and cannot
continue.

## Runtime P0 Session and Optimistic Lock

The persisted session contract contains:

- `sessionId`
- `lifecycleStatus`
- `runtimeState`
- `version`
- `lastEventId`
- `latestRecoveryPointId`
- `pausedAt`
- `closedAt`
- `machineVersion`
- `schemaVersion`
- `updatedAt`

Every non-create write carries `expectedVersion`. The session update succeeds
only when the stored version matches, then increments the version. P0 uses a
single session repository write boundary. Database row locking or a serialized
session mailbox may be added later without changing the external contract.

## Runtime P0 Command and Event Boundary

The public RuntimeAdapter method is `submit_event`, but its input is an event
intent, not a trusted persisted Event. The client cannot submit a trusted
`fromState`. Runtime reads the persisted session, applies lifecycle and
transition guards, checks `expectedVersion` and `idempotencyKey`, generates the
authoritative Event, and atomically persists the Event and session update.

The internal Command model remains available as an implementation DTO and
compatibility mechanism. It is not the V5 UI access contract.

P0 Commands include:

- `CreateSession`
- `SubmitClarification`
- `PauseSession`
- `ResumeSession`
- `CloseSession`
- `CreateRecoveryPoint`
- `RollbackToRecoveryPoint`

Every public write carries `sessionId`, `expectedVersion`, and
`idempotencyKey`, except session creation, which establishes version 1.

The Event envelope reserves `eventId`, `sessionId`, `sequence`, `eventVersion`,
`machineVersion`, `commandId`, `correlationId`, `causationId`, actor, trace,
created time, reason, and a safe payload. Business Events carry
`runtimeTransition`; lifecycle Events carry `fromLifecycleStatus` and
`toLifecycleStatus` without inventing a business-state transition. V4 P0 does
not require tenant isolation, outbox publication, consumer idempotency, or
internal/external event classes; those remain product-grade extensions.

Lifecycle rules are independent of `runtimeState`:

- `active -> pause_session -> paused`
- `paused -> resume_session -> active`
- `active|paused -> close_session -> closed`
- `paused` permits reads but rejects business-state advancement with
  `session_paused`
- `closed` rejects all writes with `session_closed`

## Runtime P0 Recovery Point

A Recovery Point is a small complete Runtime recovery snapshot, not only a state
name. It contains:

- recovery point and session identifiers
- session version
- Runtime state
- small safe snapshot
- creation time

P0 retains only the latest stable Recovery Point. A rollback appends
`rollback_completed` or `rollback_failed`, creates a new session version, and
does not overwrite Event history. It must not copy the full UI Contract, raw
LLM output, or large execution payloads.

Recommended creation points are after plan verification, before user
confirmation, before mock execution, and optionally before a recoverable
failure.

## Runtime P0 Capability Profile

`targetCapabilities` records the V4 P0 target:

- session lifecycle, state machine, Event stream, persistence, Recovery Point,
  RuntimeAdapter, capability query, and contract tests: `supported`, meaning
  their contracts are frozen
- rollback primitive: `degraded`, meaning its limited P0 contract is frozen;
  latest Recovery Point only, no external compensation, no task replay
- task replay and external compensation: `unsupported`, meaning their exclusion
  from the target is explicitly frozen

`effectiveCapabilities` records current V4 alpha truth:

- contract tests: `available`
- state machine and Event stream: `degraded`; the thin endpoint returns
  state-shaped responses and transient Events but has no persisted Transition
  Engine or queryable Event stream
- session lifecycle, Runtime persistence, Recovery Point, rollback primitive,
  RuntimeAdapter, and capability query: `unavailable`
- task replay and external compensation: `unavailable`

Clients must not use `targetCapabilities` to enable a UI action.

## Runtime P0 Persistence

P0 continues to use the existing SQLite file but adds logically independent
`runtime_sessions`, `runtime_events`, `runtime_recovery_points`, and
`runtime_schema_migrations` tables. Runtime repositories must not expose SQLite
details or depend on memory-table internals. Session update and Event insertion
share one transaction. Session version is the optimistic lock,
`idempotencyKey` is unique, SQLite uses a busy timeout, Event payloads use field
allowlists, rollback appends history, and old thin Runtime temporary sessions
are not migrated.

P0 does not add database splitting, read/write separation, outbox publication,
event compression, or an operations administration backend.

## Dual Entry and Compatibility Adapter

The approved architecture is dual-entry with one Runtime Core:

```text
POST /api/runtime
  -> CompatibilityAdapter
  -> Runtime Core

/api/runtime/sessions/*
  -> RuntimeAdapter
  -> Runtime Core
```

The CompatibilityAdapter only validates, converts, and projects. It must not
own state transitions, failure rules, or persistence. The legacy request and
response contract is protected by golden fixtures. Adoption of the new Core is
feature-flagged, uses shadow comparison before rollout, forbids old/new dual
writes, and retains an immediate legacy fallback.

The new P0 API surface is:

- `POST /api/runtime/sessions`
- `GET /api/runtime/sessions/{sessionId}`
- `POST /api/runtime/sessions/{sessionId}/events`
- `POST /api/runtime/sessions/{sessionId}/pause`
- `POST /api/runtime/sessions/{sessionId}/resume`
- `POST /api/runtime/sessions/{sessionId}/close`
- `GET /api/runtime/sessions/{sessionId}/events`
- `GET /api/runtime/capabilities`

Capability query reports effective implementation truth, not target intent.

## Runtime and Execution Boundary

V4 Runtime P0 owns session lifecycle, Runtime state, Runtime Events, persistence,
Recovery Points, and an optional current Execution reference. It does not own
task/step definitions, step advancement, attempt history, retry/timeout,
cancellation, blocking, or Mock result storage.

Execution is an independent domain and contract. In V4 P0 only Execution
references and summary Event names are frozen. Execution implementation starts
in P1 and may initially remain a separate module in the same FastAPI process.
Runtime never directly mutates a Step; Execution reports authoritative summary
events through a stable service/adapter boundary.

## Runtime P0 Replay Boundary

P0 supports ordered Event queries, diagnostic Event inspection, recovery from
the latest Recovery Point, and reducer verification in tests. It does not
provide business-level replay, repeat external actions, rerun the LLM from
history, rebuild every business object, or restore an arbitrary historical
instant.

## Language-Neutral Consumption

The Runtime state-machine source is language-neutral JSON. V4 P0 does not
generate multiple Runtime engines. The Python backend reads and enforces the
source through the Transition Engine. Tests verify that generated schema,
documentation, and transition matrices stay aligned. V5 only consumes
read-only state, capability, and Event DTOs; it does not run the Runtime state
machine in the browser.

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

Current implementation boundary: this endpoint is a stateless thin aggregator.
It does not persist backend sessions, verify full state continuity, or take over
planning. V4 Runtime P0 is the planned persisted headless state-machine stage;
V5 consumes its stable adapter, capability, and Event contracts.

Intended role:

- Accept a user input plus optional session and operation data.
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
- Future V4 lightweight hardening should make low-confidence intent return a
  recoverable downgrade state from Runtime itself, not rely only on frontend
  confidence checks.
- `feedback` and `memoryDecision` are both supported, but they are mutually
  exclusive per Runtime request. If both field names are present, the request
  is rejected with `mutually_exclusive_operations`, including when either value
  is `null`. Callers must submit feedback capture and memory-candidate decision
  as separate requests.
- Audit JSONL writes are best-effort telemetry for this alpha slice. Audit write
  failure after a successful SQLite commit must not turn the committed operation
  into a client-visible failure or retry instruction.
- A privacy-rejected correction returns `memory_decision_rejected` in
  `memory_candidate_review`; malformed actions are request-validation failures
  and do not create runtime events.
- Feedback and memory responses preserve the existing candidate-first memory
  loop.
- Current request constraints always override retrieved long-term memory.
- Current `MemoryUsageEvent` records are memory reference records, not complete
  audit records. A future lightweight DB update should add `priority_rule` with
  default `current_request_overrides_memory` and test that it is written when
  memory usage is recorded.
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
