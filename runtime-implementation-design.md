# runtime-implementation-design.md

## 1. Purpose

This document turns the existing V4 Runtime contracts into an implementation
design for a product-grade headless Runtime.

It is an implementation guide, not a product vision document. It explains how
to move from the current stateless thin `POST /api/runtime` endpoint to a
durable Runtime Core with sessions, state-machine enforcement, Events,
persistence, capabilities, Recovery Points, and a degraded rollback boundary.

Primary source documents:

- `runtime-state-machine.json`
- `runtime.schema.json`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- `specs/001-v4-runtime-state-machine-memory-loop/tasks.md`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-contract-test-matrix.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `ui-contract.schema.json`

## 2. Scope

### 2.1 V4 Runtime P0 Scope

V4 Runtime P0 implements the headless Runtime substrate:

- durable Runtime sessions
- session lifecycle: create, pause, resume, close, and read restore
- Runtime state-machine validation from `runtime-state-machine.json`
- server-generated Runtime Events
- ordered Event stream query
- optimistic locking with `expectedVersion`
- write idempotency with `idempotencyKey`
- atomic Event + Session writes
- independent Runtime SQLite tables in the existing SQLite file
- latest-only Recovery Point storage
- degraded rollback primitive boundary with `rollback_not_supported` for full
  restore, external compensation, and task replay
- capability query using `effectiveCapabilities`
- `RuntimeAdapter` for `/api/runtime/sessions/*`
- `CompatibilityAdapter` for legacy `POST /api/runtime`
- feature-flagged Core adoption with legacy fallback
- shadow comparison without dual writes
- regression tests for existing thin Runtime behavior

### 2.2 V4 Runtime P1 Scope

V4 Runtime P1 starts after P0 is stable. It may add:

- independent Execution domain implementation
- Task and Step lifecycle
- Step attempt history
- bounded retry and timeout policies
- plan-version execution gates
- cancellation and blocking semantics
- Execution repositories
- Runtime integration through summary Events and stable adapters
- richer observability and operational tooling

P1 may initially live in the same FastAPI process. It does not require a
separate worker, outbox, distributed scheduler, or distributed transaction.

Current implementation status:

- P1-A Execution model, repositories, and create/query/advance/cancel API are
  implemented in `execution/` and `/api/executions*`.
- P1-B step attempt count, bounded retry, idempotency, and plan-version gate are
  implemented.
- P1-C Runtime summary Event integration is implemented through stable
  Execution -> Runtime summary Events. Execution still owns Task/Step state;
  Runtime records only summary Events and `activeExecutionId`.
- Delivery grouping is tracked in `RUNTIME_EXECUTION_DELIVERY_AUDIT.md` so
  Runtime/Execution changes can be reviewed separately from UI and saved-plan
  worktree changes.

### 2.3 Out of Scope

P0 does not implement:

- V5 UI cards, buttons, layouts, or page-specific flows
- external booking, payment, queueing, messaging, map, inventory, or merchant APIs
- public collaboration, real user identity, or real external collaborators
- full business replay from Event history
- arbitrary point-in-time restore
- external side-effect compensation
- task replay
- multi-node Runtime
- event bus publication
- operations administration UI
- migration of old thin temporary sessions

## 3. Design Principles

### 3.1 Product-grade Headless Runtime

Runtime is a backend state authority. It owns durable session state, legal
transitions, Events, persistence, Recovery Points, and capability truth. It does
not own frontend rendering.

### 3.2 UI-agnostic Runtime

Runtime DTOs must not contain UI cards, DOM state, button labels, layout hints,
current `app.js` component state, or V5 page-specific assumptions.

V5 UI may render Runtime facts, but it must not read Runtime tables, import
Runtime internals, or infer hidden state from display text.

### 3.3 Contract-first Integration

Implementation follows the machine-readable contracts first:

- state machine: `runtime-state-machine.json`
- schema DTOs and policy metadata: `runtime.schema.json`
- UI access boundary: `ui-contract.schema.json`

Any implementation change that changes public shape must update contract tests
before rollout.

### 3.4 Incremental Upgrade from Thin Runtime

The existing `POST /api/runtime` endpoint remains stable. Product-grade Runtime
is introduced behind new `/api/runtime/sessions/*` endpoints and a feature flag.

The legacy path is protected by golden fixtures and can be restored immediately.

### 3.5 Test-protected Runtime Evolution

Runtime evolution is blocked by tests for:

- schema parse
- state-machine drift
- legal and illegal transitions
- terminal states
- lifecycle rules
- optimistic locking
- idempotency
- atomic Event + Session writes
- persistence restart recovery
- latest Recovery Point storage and rollback boundary
- compatibility projection
- V5 read-only Runtime projection

## 4. Runtime Architecture

### 4.1 Layered Architecture

```text
HTTP API layer
  /api/runtime
  /api/runtime/sessions/*
  /api/runtime/capabilities

Adapter layer
  CompatibilityAdapter
  RuntimeAdapter

Runtime service layer
  RuntimeService
  SessionService
  EventService
  RecoveryService
  CapabilityService

Runtime Core
  TransitionEngine
  StateMachine
  ErrorClassifier
  RecoveryManager
  RollbackManager

Persistence layer
  RuntimeSessionRepository
  RuntimeEventRepository
  RuntimeRecoveryPointRepository
  RuntimeMigrationRepository

Observability layer
  TraceContext
  AuditLogger
  Metrics hooks
```

### 4.2 Module Boundaries

Suggested Python module layout:

```text
runtime/
  __init__.py
  api.py
  adapter.py
  compatibility.py
  capability.py
  core.py
  errors.py
  events.py
  lifecycle.py
  migrations.py
  models.py
  recovery.py
  repositories.py
  state_machine.py
  telemetry.py
  transactions.py
```

The first implementation may keep route registration in `server.py`, but
business logic should move into the `runtime/` package before the new Core is
enabled.

### 4.3 Runtime Core

Runtime Core is the only state authority. It exposes service methods, not HTTP
or UI concepts.

Responsibilities:

- load the persisted session
- validate lifecycle status
- validate Runtime transition
- enforce expected version
- enforce idempotency
- generate authoritative Event envelopes
- update session and insert Event atomically
- create latest Recovery Point when rules allow
- classify failures into stable error codes

### 4.4 RuntimeAdapter

RuntimeAdapter is the stable public access layer for new clients. It accepts
Runtime commands or event intents and returns Runtime DTOs.

It must not expose repository objects, SQLite rows, internal guard details, or
UI fields.

### 4.5 Capability Contract

CapabilityService returns both:

- `targetCapabilities`: frozen product target, not used for enablement
- `effectiveCapabilities`: currently callable implementation truth

Clients must use only `effectiveCapabilities.availability` to enable, disable,
mock, or fallback.

### 4.6 Event Contract

Runtime Events record what happened inside Runtime. Events are immutable after
write.

Runtime clients may query ordered Events. Clients cannot submit trusted Events.
They submit event intents through RuntimeAdapter.

### 4.7 Persistence Layer

Persistence uses the existing SQLite file with independent Runtime tables:

- `runtime_sessions`
- `runtime_events`
- `runtime_recovery_points`
- `runtime_schema_migrations`

Runtime tables must not depend on memory-table internals.

### 4.8 Observability Layer

P0 observability is lightweight:

- every Event includes `traceId`, `correlationId`, `causationId`, `actor`, and
  `createdAt`
- audit writes are best effort unless tied to the same Runtime transaction
- errors use stable error codes
- logs must not contain sensitive payloads or raw large LLM outputs

## 5. Core Runtime Concepts

### 5.1 Session

A Runtime Session is the durable owner of one headless run.

It contains:

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

### 5.2 Task

Task is not owned by V4 Runtime P0.

P0 may reference `activeExecutionId` and append Execution summary Events, but
Task definitions and execution lifecycle belong to the independent Execution P1
domain.

### 5.3 Step

Step is not owned by V4 Runtime P0.

Runtime must not mutate Step status directly. Execution P1 owns Step state,
attempts, retry, timeout, blocking, and cancellation.

### 5.4 Runtime State

Runtime state is the authoritative business state from
`runtime.schema.json#/$defs/RuntimeState`.

The source of truth is `runtime-state-machine.json`.

### 5.5 Runtime Event

A Runtime Event is server generated and append-only. It contains:

- `eventId`
- `sessionId`
- `sequence`
- `eventVersion`
- `machineVersion`
- `commandId`
- `correlationId`
- `causationId`
- `actor`
- `traceId`
- `createdAt`
- `reason`
- safe payload
- either `runtimeTransition` or lifecycle status fields

### 5.6 Snapshot

A Snapshot is a safe state payload used to explain or restore Runtime-level
state. It is not a full UI Contract payload and not a raw LLM dump.

### 5.7 Recovery Point

A Recovery Point is the latest stable restore target:

- `recoveryPointId`
- `sessionId`
- `sessionVersion`
- `runtimeState`
- `snapshot`
- `createdAt`

P0 retains only one latest stable Recovery Point per session.

### 5.8 Rollback Primitive

P0 exposes latest-only Recovery Point storage and a stable rollback boundary.
Full restore/replay is not enabled yet; rollback requests return
`rollback_not_supported` instead of overwriting history or fabricating replay.

### 5.9 Runtime Capability

Runtime capability describes what the current Runtime can actually do. P0
capability query must report unavailable implementation truth until each module
is implemented and tested.

## 6. Runtime State Machine

### 6.1 State Definitions

P0 states are defined only by `runtime-state-machine.json`:

- `intent_loading`
- `clarifying`
- `planning_local`
- `researching_tools`
- `merging_plans`
- `verifying_plan`
- `replanning`
- `ready_for_confirmation`
- `executing_mock_actions`
- `feedback_capture`
- `memory_candidate_review`
- `memory_committed`
- `failed_recoverable`
- `done`

### 6.2 State Transition Rules

Transition Engine validates:

1. current persisted Runtime state
2. submitted event intent type
3. requested target state
4. declared transition from `runtime-state-machine.json`
5. lifecycle status
6. guard requirements
7. `expectedVersion`
8. `idempotencyKey`

The client-provided `fromState` is not trusted. If a client sends it, it is
ignored or rejected depending on the DTO.

### 6.3 Invalid Transitions

Invalid transitions return:

```json
{
  "ok": false,
  "error": "invalid_transition",
  "sessionId": "...",
  "currentState": "...",
  "allowedEvents": ["..."]
}
```

The response must not expose internal guard implementation details.

### 6.4 Failure States

Recoverable failures enter `failed_recoverable` only when the session can safely
continue to `planning_local`.

Operation-specific failures that must preserve context stay in the active
operation state. For example, feedback storage failure remains in
`feedback_capture`.

### 6.5 Recovery States

`recovery_resumed` is the only P0 Event that returns from
`failed_recoverable` to `planning_local`.

Rollback recovery is separate from ordinary recoverable failure. In P0 it is a
stable disabled boundary: Recovery Points can be stored, but full restore/replay
returns `rollback_not_supported`.

## 7. Session Lifecycle

### 7.1 Create Session

Create Session:

- validates initial input envelope
- creates `runtimeState=intent_loading`
- creates `lifecycleStatus=active`
- sets `version=1`
- inserts `session_created` Event
- returns the persisted session DTO

### 7.2 Start Session

P0 does not need a separate start operation. A newly created session is active.

### 7.3 Pause Session

Pause:

- allowed only when lifecycle is `active`
- changes lifecycle to `paused`
- appends `session_paused`
- does not change business `runtimeState`

Paused sessions allow reads but reject business-state advancement with
`session_paused`.

### 7.4 Resume Session

Resume:

- allowed only when lifecycle is `paused`
- changes lifecycle to `active`
- appends `session_resumed`
- does not fabricate a business transition

### 7.5 Close Session

Close:

- allowed when lifecycle is `active` or `paused`
- changes lifecycle to `closed`
- appends `session_closed`
- rejects all later writes with `session_closed`

### 7.6 Restore Session

Restore reads:

- latest session row
- latest Event sequence
- latest Recovery Point reference

Restore must not infer state from frontend snapshots.

## 8. Task and Step Lifecycle

### 8.1 Task Lifecycle

Task lifecycle is P1.

P0 Runtime may store `activeExecutionId` and summary Events such as
`execution_requested_summary` or `execution_completed_summary`.

### 8.2 Step Lifecycle

Step lifecycle is P1. Runtime P0 must not write Step state.

### 8.3 Retry Rules

Runtime P0 retry is limited to idempotent write handling:

- same `idempotencyKey` for same accepted command returns prior result
- same `idempotencyKey` for incompatible command returns conflict
- retry after `version_conflict` requires refetching session

Execution retry policy is P1.

### 8.4 Idempotency Rules

Every non-create public write includes:

- `sessionId`
- `expectedVersion`
- `idempotencyKey`

`idempotencyKey` is unique per session write. The repository enforces uniqueness.

### 8.5 Failure Handling

Runtime failures are classified before response mapping:

- validation failure
- invalid transition
- version conflict
- duplicate idempotency key
- paused session
- closed session
- storage unavailable
- recovery point not found
- rollback not supported
- internal error

## 9. Event Model

### 9.1 Runtime Events

Runtime Event types come from `runtime-state-machine.json`.

Business transition Events carry a `runtimeTransition`.
Lifecycle Events carry `fromLifecycleStatus` and `toLifecycleStatus`.

### 9.2 Event Payload Schema

Event payloads use allowlists per Event type. P0 payloads should store stable
IDs, summaries, reason codes, and safe metadata.

They must not store:

- full UI Contract payload
- raw LLM output
- large execution payload
- secrets, credentials, access tokens, payment data

### 9.3 Event Emission Rules

Only Runtime Core emits authoritative Events.

Adapters may submit intent DTOs. Repositories may persist Events. UI and
CompatibilityAdapter may not create authoritative Events independently.

### 9.4 Event Ordering

Event ordering uses an increasing `sequence` per session.

Atomic write rule:

```text
insert runtime_event(sequence=N)
update runtime_session(version=version+1, lastEventId=eventId)
commit
```

If either write fails, both are rolled back.

### 9.5 Event Consumption by UI / Adapter

UI may render ordered Events as diagnostics or status history. UI must not
mutate Events or use Event display text to infer hidden internal state.

## 10. Persistence Design

### 10.1 What to Persist

P0 persists:

- Runtime sessions
- Runtime Events
- latest Recovery Point
- Runtime schema migration state

P0 does not persist full plan payloads as Runtime state.

### 10.2 When to Persist

Persist on:

- session creation
- accepted Runtime transition
- lifecycle transition
- Recovery Point creation
- future accepted rollback command success or failure; P0 full restore/replay
  requests are rejected before mutation

Do not persist on invalid transition.

### 10.3 Session Store

Suggested table fields:

```text
session_id primary key
lifecycle_status
runtime_state
version
last_event_id
latest_recovery_point_id
active_execution_id
machine_version
schema_version
created_at
updated_at
paused_at
closed_at
```

### 10.4 Snapshot Store

P0 does not need a separate snapshot table beyond Recovery Point snapshots.

If introduced later, snapshots must remain Runtime-safe and UI-agnostic.

### 10.5 Event Store

Suggested table fields:

```text
event_id primary key
session_id
sequence
event_type
event_version
machine_version
from_state
to_state
from_lifecycle_status
to_lifecycle_status
command_id
correlation_id
causation_id
actor_json
trace_id
reason
payload_json
created_at
idempotency_key
```

Constraints:

- unique `(session_id, sequence)`
- unique `(session_id, idempotency_key)` when key is present
- foreign key from Event to Session when SQLite foreign keys are enabled

### 10.6 Data Consistency Rules

- Event insert and Session update use one transaction.
- SQLite busy timeout is required.
- Migration runner creates tables before Runtime Core is enabled.
- Runtime repositories never expose raw SQLite rows to adapters.
- Old thin Runtime temporary sessions are not migrated.

## 11. Recovery Design

### 11.1 Recovery Point Creation

Create Recovery Point after stable milestones:

- after plan verification
- before user confirmation
- before mock execution
- optionally before recoverable failure

The snapshot is a compact Runtime-safe payload.

### 11.2 Recovery Eligibility

Recovery is eligible when:

- session exists
- lifecycle is not closed
- latest Recovery Point exists
- Recovery Point belongs to the session
- no external compensation is required
- target is within P0 latest-only boundary

### 11.3 Restore Boundary

P0 restore is intentionally not enabled as a state-changing operation.

Supported behavior:

1. read session
2. read latest Recovery Point
3. validate that rollback is inside the known boundary
4. return `rollback_not_supported` for full restore/replay attempts

### 11.4 Recovery Failure Handling

Failures return stable codes:

- `recovery_point_not_found`
- `rollback_not_supported`
- `version_conflict`
- `session_closed`
- `storage_unavailable`

Rollback failure appends an Event only in a future phase where the rollback
command is accepted. P0 rejects full restore/replay before state mutation.

### 11.5 UI-facing Recovery Contract

UI sees:

- current Runtime state
- latest Recovery Point availability
- stable error code
- recommended fallback or disabled state

UI does not receive internal recovery snapshots unless explicitly allowed by
the Runtime DTO.

## 12. Rollback Design

### 12.1 Rollback Boundary

P0 rollback is a primitive boundary, not a full version-control system.

It supports latest stable Recovery Point storage. State-changing restore remains
disabled and returns `rollback_not_supported`.

### 12.2 UI-level Rollback vs Runtime-level Rollback

UI-level rollback:

- undo candidate adoption
- restore previous visible plan
- reopen saved UI snapshot
- rollback previous V5 Main branch

Runtime-level rollback:

- read latest Runtime Recovery Point
- return a stable unsupported response for full restore/replay in P0
- avoid overwriting Events or session state

The two must not share names in code without a qualifier.

### 12.3 Rollback Primitive

Runtime rollback:

- checks `expectedVersion`
- checks Recovery Point ownership
- returns `rollback_not_supported` for full restore/replay in P0
- does not overwrite Events

### 12.4 Unsupported Rollback Cases

Unsupported in P0:

- arbitrary historical restore
- business replay
- task replay
- external action compensation
- LLM rerun from Event history
- restoring UI cards

### 12.5 Future Full Rollback Direction

P1+ may add richer plan or execution rollback through separate Plan/Execution
domains. Runtime should expose stable references and summary Events only.

## 13. Error Handling

### 13.1 Error Classification

ErrorClassifier maps internal exceptions to stable Runtime error codes.

Minimum codes:

- `session_not_found`
- `session_paused`
- `session_closed`
- `invalid_transition`
- `version_conflict`
- `recovery_point_not_found`
- `rollback_not_supported`
- `mutually_exclusive_operations`
- `storage_unavailable`
- `internal_error`

### 13.2 Recoverable Errors

Recoverable errors preserve enough state to retry:

- storage unavailable during feedback
- storage unavailable during memory decision
- backend enhancement unavailable
- recoverable planning failure

### 13.3 Non-recoverable Errors

Non-recoverable errors include:

- closed session write
- unsupported rollback target
- invalid request shape
- forbidden sensitive payload

### 13.4 Retryable Errors

Retryable errors include:

- SQLite busy or temporarily unavailable
- transient backend enhancement failure
- version conflict after refetch

### 13.5 User-facing Error Mapping

Runtime returns stable codes. UI maps codes to copy and disabled/fallback
behavior. Runtime must not return frontend copy as the authoritative contract.

## 14. RuntimeAdapter Design

### 14.1 Adapter Responsibility

RuntimeAdapter:

- validates public DTO shape
- calls Runtime services
- returns Runtime DTOs
- maps internal errors to RuntimeAdapter errors

It does not own business transition rules.

### 14.2 Adapter API

P0 methods:

```text
create_session(inputText, overrides, actor, trace)
get_session(sessionId)
submit_event(sessionId, eventIntent, expectedVersion, idempotencyKey, actor, trace)
pause_session(sessionId, expectedVersion, idempotencyKey, actor, trace)
resume_session(sessionId, expectedVersion, idempotencyKey, actor, trace)
close_session(sessionId, expectedVersion, idempotencyKey, actor, trace)
list_events(sessionId, afterSequence?, limit?)
get_capabilities()
create_recovery_point(sessionId, expectedVersion, idempotencyKey, snapshot, actor, trace)
rollback_to_recovery_point(sessionId, recoveryPointId, expectedVersion, idempotencyKey, actor, trace)
```

### 14.3 Capability Query

`get_capabilities()` returns the current `RuntimeCapabilityContract`.

It must report `availability=unavailable` for modules that are still contract
only.

### 14.4 UI Fallback Mapping

V5 maps unavailable or degraded capabilities to:

- fallback for planning unavailable
- disabled for unsupported actions
- mock for simulated Execution
- preserved visible state for conflict

Runtime does not decide V5 layout.

### 14.5 Backward Compatibility

RuntimeAdapter is new. It must not change existing alpha endpoint behavior.

Legacy clients continue using `POST /api/runtime` until feature-flagged Core
adoption is complete.

## 15. API / Interface Draft

### 15.1 RuntimeService

```text
create_session(command) -> PersistedRuntimeSessionDTO
submit_event(command) -> RuntimeWriteResult
pause_session(command) -> RuntimeWriteResult
resume_session(command) -> RuntimeWriteResult
close_session(command) -> RuntimeWriteResult
```

### 15.2 SessionService

```text
get_session(sessionId) -> PersistedRuntimeSessionDTO
assert_writable(session) -> None
assert_expected_version(session, expectedVersion) -> None
```

### 15.3 TaskService

Not implemented in Runtime P0.

TaskService belongs to Execution P1.

### 15.4 StepService

Not implemented in Runtime P0.

StepService belongs to Execution P1.

### 15.5 RecoveryService

```text
create_recovery_point(command) -> RuntimeRecoveryPointDTO
rollback_to_recovery_point(command) -> RuntimeWriteResult
```

### 15.6 EventService

```text
list_events(sessionId, afterSequence, limit) -> list[RuntimeEventDTO]
build_event(session, eventIntent, commandContext) -> RuntimeEventDTO
```

### 15.7 CapabilityService

```text
get_capabilities() -> RuntimeCapabilityContractDTO
```

## 16. Data Model Draft

### 16.1 RuntimeSession

```text
sessionId: string
lifecycleStatus: active | paused | closed
runtimeState: RuntimeState
version: int
lastEventId: string | null
latestRecoveryPointId: string | null
activeExecutionId: string | null
machineVersion: string
schemaVersion: string
createdAt: datetime
updatedAt: datetime
pausedAt: datetime | null
closedAt: datetime | null
```

### 16.2 RuntimeTask

Out of Runtime P0. Execution P1 owns it.

### 16.3 RuntimeStep

Out of Runtime P0. Execution P1 owns it.

### 16.4 RuntimeEvent

```text
eventId: string
sessionId: string
sequence: int
eventType: RuntimeEventType
eventVersion: string
machineVersion: string
runtimeTransition: object | null
fromLifecycleStatus: string | null
toLifecycleStatus: string | null
commandId: string
correlationId: string | null
causationId: string | null
actor: object
traceId: string
reason: string | null
payload: object
createdAt: datetime
idempotencyKey: string | null
```

### 16.5 RuntimeSnapshot

```text
runtimeState: RuntimeState
lifecycleStatus: active | paused | closed
activeExecutionId: string | null
safeContext: object
```

### 16.6 RuntimeRecoveryPoint

```text
recoveryPointId: string
sessionId: string
sessionVersion: int
runtimeState: RuntimeState
snapshot: RuntimeSnapshot
createdAt: datetime
```

### 16.7 RuntimeCapability

```text
name: RuntimeCapabilityName
availability: available | degraded | unavailable
version: string
limits: object
reason: string
```

## 17. Migration from Thin Runtime

### 17.1 Existing Thin Runtime Capabilities

Current thin Runtime:

- accepts `POST /api/runtime`
- aggregates intent, feedback, and memory decision flows
- returns `currentState`, `allowedNextStates`, and transient Events
- does not persist Runtime sessions
- does not enforce full state continuity
- does not expose queryable Event stream

### 17.2 Reused Interfaces

Keep:

- `POST /api/runtime`
- existing `/api/intent`
- existing `/api/feedback`
- existing `/api/memory-candidates/{candidate_id}/decision`
- existing frontend planning fallback

### 17.3 Enhanced Interfaces

Add:

- `POST /api/runtime/sessions`
- `GET /api/runtime/sessions/{sessionId}`
- `POST /api/runtime/sessions/{sessionId}/events`
- `POST /api/runtime/sessions/{sessionId}/pause`
- `POST /api/runtime/sessions/{sessionId}/resume`
- `POST /api/runtime/sessions/{sessionId}/close`
- `GET /api/runtime/sessions/{sessionId}/events`
- `GET /api/runtime/capabilities`

### 17.4 Deprecated Interfaces

No interface is removed in P0.

`POST /api/runtime` becomes legacy-compatible after Core adoption, not
deprecated for existing clients.

### 17.5 Compatibility Layer

CompatibilityAdapter:

- validates legacy request shape
- converts legacy operation to Runtime service call when feature flag is enabled
- projects Runtime results back to legacy response shape
- contains no transition logic
- has golden fixtures for legacy responses

### 17.6 Migration Steps

1. Add Runtime tables and migration runner.
2. Add repositories and transaction helpers.
3. Load `runtime-state-machine.json` in StateMachine.
4. Implement TransitionEngine.
5. Implement RuntimeService.
6. Implement RuntimeAdapter and new session routes.
7. Add `GET /api/runtime/capabilities`.
8. Freeze legacy `POST /api/runtime` golden fixtures.
9. Implement CompatibilityAdapter projection.
10. Add feature flag, disabled by default.
11. Add shadow comparison without dual writes.
12. Enable Core for new session routes.
13. Gradually route legacy endpoint through CompatibilityAdapter.
14. Keep immediate fallback to old thin handler.

### 17.7 Rollback Plan

Rollback of implementation rollout:

- disable product-grade Runtime feature flag
- keep legacy thin handler active
- do not dual-write old and new state
- preserve Runtime tables for inspection
- do not migrate thin temporary sessions back
- run legacy golden tests before and after rollback

## 18. Testing Strategy

### 18.1 Unit Tests

Unit tests cover:

- StateMachine loading
- legal transition lookup
- invalid transition rejection
- ErrorClassifier mapping
- capability profile generation
- Recovery Point snapshot allowlist

### 18.2 Contract Tests

Contract tests cover:

- schema parse
- `runtime-state-machine.json` drift
- all declared transitions
- all undeclared transition combinations
- terminal states
- adapter method enum
- capability profile
- V5 `RuntimeSummary.runtimeState/displayPhase`

### 18.3 Integration Tests

Integration tests cover:

- create session
- submit event
- pause/resume/close
- list events
- version conflict
- duplicate idempotency
- storage unavailable
- legacy `POST /api/runtime` projection

### 18.4 State Machine Tests

Generate tests from `runtime-state-machine.json`. Do not manually duplicate the
transition table in implementation tests unless comparing against the source.

### 18.5 Recovery Tests

Recovery tests cover:

- create latest Recovery Point
- latest-only Recovery Point replacement
- rollback unsupported boundary
- rollback missing point
- closed session rejects future state-changing rollback
- unsupported replay is rejected

### 18.6 Persistence Tests

Persistence tests cover:

- migration idempotency
- busy timeout configuration
- unique `(session_id, sequence)`
- unique `(session_id, idempotency_key)`
- atomic rollback on Event insert failure
- restart session reload

### 18.7 Adapter Tests

Adapter tests cover:

- RuntimeAdapter DTO validation
- CompatibilityAdapter legacy projection
- no UI fields in Runtime responses
- capability query truth

### 18.8 Regression Tests

Regression gates:

- `npm.cmd test`
- `python -m unittest test_contract_schemas.py`
- `pytest test_runtime_api.py`
- future product-grade Runtime integration tests
- V5 adapter compatibility tests

## 19. V5 UI Relationship

### 19.1 What V5 UI Can Depend On

V5 UI can depend on:

- RuntimeAdapter DTOs
- RuntimeCapabilityContract effective capabilities
- RuntimeEventContract read-only Events
- `RuntimeSummary.runtimeState`
- `displayPhase` as presentation-only mapping
- stable error codes

### 19.2 What V5 UI Must Not Depend On

V5 UI must not depend on:

- Runtime repository classes
- SQLite table names
- internal guard data
- internal exception classes
- Event payload fields not in allowlists
- Runtime state-machine implementation code
- UI cards returned by Runtime
- Runtime capabilities created for a single UI button

### 19.3 Mock / Fallback / Disabled Strategy

When Runtime capability is unavailable:

- use adapter fallback for V5 planning
- disable Runtime-dependent write actions
- keep local mock behavior where contract allows it
- preserve visible state on conflict
- never treat `targetCapabilities.status=supported` as callable ability

### 19.4 Low-coupling Check

Before enabling new Runtime integration, verify:

- V5 imports no Runtime internals
- V5 reads no Runtime tables
- Runtime returns no UI card payloads
- all Runtime writes go through RuntimeAdapter or CompatibilityAdapter
- capability query drives enablement
- Event DTOs remain UI-agnostic

### 19.5 Non-goals for V5 P0

V4 Product-grade Runtime must not block V5 P0 UI Contract work.

V5 P0 may continue using:

- `agent-core.js` adapter fallback
- fixture-driven `/api/generative-plan`
- local replan mock behavior
- disabled or placeholder Runtime-dependent actions

## 20. Open Questions and Blockers

Resolved P0 implementation items:

1. Legacy `POST /api/runtime` golden request/response fixtures are frozen under
   `fixtures/runtime_legacy/`.
2. Session API DTOs and HTTP error mappings are implemented in `server.py`.
3. SQLite migration DDL is implemented in `runtime/repositories.py`.
4. Event payload allowlists are enforced by `RuntimeCore`.
5. Legacy Core adoption and shadow comparison switches are implemented as
   `V4_PRODUCT_RUNTIME_LEGACY_CORE` and
   `V4_PRODUCT_RUNTIME_SHADOW_COMPARE`, both defaulting off.

Open questions:

- Should idempotency eventually return a stored full response body, or keep the
  current P0 behavior of returning previous Event/session identifiers?
- Should Recovery Point creation remain explicit through adapter first, or
  become automatic at all recommended milestones?
- Should legacy `POST /api/runtime` shadow comparison run for every request or
  only in development/test mode?

## 21. Implementation Checklist

P0 implementation checklist:

- [x] Freeze legacy `POST /api/runtime` golden fixtures.
- [x] Add `runtime/` package.
- [x] Add migration runner and independent Runtime tables.
- [x] Add repositories with SQLite busy timeout.
- [x] Add StateMachine loader from `runtime-state-machine.json`.
- [x] Add TransitionEngine.
- [x] Add RuntimeService.
- [x] Add RuntimeAdapter.
- [x] Add `/api/runtime/sessions/*` routes.
- [x] Add `/api/runtime/capabilities`.
- [x] Add RecoveryManager and latest-only Recovery Point.
- [x] Add degraded rollback primitive boundary with latest-only Recovery Point
  storage and `rollback_not_supported` for full restore/replay.
- [x] Add ErrorClassifier.
- [x] Add CompatibilityAdapter.
- [x] Add product-grade Runtime feature flag, default off.
- [x] Add shadow comparison without dual writes.
- [x] Add unit, contract, integration, persistence, recovery, and adapter tests.
- [x] Run legacy Runtime API, V4 contract, backend, and V5 compatibility gates.
