# Data Model: V4 Runtime State Machine and Memory Loop

## RuntimeSession

- `inputText`: original user request.
- `overrides`: user or system-provided planning hints.
- `currentState`: one of the documented RuntimeState values.
- `selectedPlanId`: chosen plan when available.
- `executedActions`: simulated execution results after confirmation.
- Relationship: owns one IntentResult and may reference FeedbackEvent and MemoryUsageEvent records.

Product-grade direction:

- `RuntimeSession` becomes the durable owner of a headless run.
- It records `lifecycleStatus` as `active`, `paused`, or `closed`.
- It records authoritative `runtimeState`, optimistic-lock `version`,
  `lastEventId`, state-machine version, schema version, and update time.
- `done` is a terminal Runtime state; `closed` is a terminal lifecycle status.
- It may point to the latest recovery point.
- It must not store UI cards, button state, DOM state, or page layout.

## RuntimeCore

The V4 Runtime Core owns only the durable execution substrate:

- session lifecycle
- runtime state machine
- runtime events
- persistence
- recovery points
- basic failure classification
- rollback primitive to a recovery point

It does not own V5 UI cards, buttons, layout, rendering decisions, or frontend
interaction flows. V5 UI may display Runtime facts, but it must not depend on
Runtime internals.

It also does not own Execution task/step lifecycle. V4 P0 may retain an
`activeExecutionId` and append authoritative Execution summary events, but
Execution owns step state, attempt history, retry/timeout policy, cancellation,
blocking, and Mock execution results.

## RuntimeAdapter

The RuntimeAdapter is the stable UI-agnostic calling surface for Runtime. The
product-grade target methods are:

- `create_session`
- `get_session`
- `submit_event`
- `pause_session`
- `resume_session`
- `close_session`
- `list_events`
- `get_capabilities`
- `create_recovery_point`
- `rollback_to_recovery_point`

Adapter responses are Runtime DTOs. They must not contain UI cards, button
definitions, layout hints, or frontend-specific component state.

`submit_event` accepts an event intent through the RuntimeAdapter. It does not
accept a trusted persisted Event or a trusted `fromState`. Runtime reads the
current state from the persisted session, validates lifecycle, transition,
version, and idempotency, then generates the authoritative Event.

Approved entry architecture:

- Existing `POST /api/runtime` remains wire-compatible and passes through a
  conversion-only `CompatibilityAdapter`.
- New `/api/runtime/sessions/*` endpoints call `RuntimeAdapter`.
- Both adapters use one Runtime Core and one authoritative state machine.
- P0 forbids old/new dual writes and requires a feature flag plus immediate
  fallback to the legacy path.

## RuntimeCommand

- `commandId`: unique Command identifier.
- `commandType`: declared P0 Command.
- `sessionId`: required except for `CreateSession`.
- `expectedVersion`: optimistic-lock version, required except for
  `CreateSession`.
- `idempotencyKey`: required unique key preventing duplicate writes.
- `correlationId`: optional cross-operation correlation.
- `payload`: Command-specific input.

## PersistedRuntimeSession

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

The session repository is the only write entry. Event insertion and session
update must use the same database transaction.

## RuntimeCapability

The Runtime capability contract separates product intent from runtime truth:

- `targetCapabilities` describes the frozen V4 P0 product target. It is used for
  planning and contract acceptance, not feature enablement.
- `effectiveCapabilities` describes what the current running implementation can
  actually provide. It is authoritative for enable, disable, mock, and fallback
  decisions.

Target capability contract statuses are:

- `supported`: the capability contract is frozen.
- `degraded`: the capability contract is frozen with declared P0 limits.
- `unsupported`: exclusion from the target is explicitly frozen.

Effective capability availability values are:

- `available`: implemented and callable.
- `degraded`: partially callable with declared limits.
- `unavailable`: not callable in the current Runtime.

The V5 UI must use `effectiveCapabilities`. It can hide, disable, mock, or
fallback when availability is degraded or unavailable. Target capability
declarations cannot enable a feature, expand V5 P0 scope, or turn mock external
execution into real execution.

## RuntimeEventContract

Runtime events are the source of truth for "what happened" inside Runtime.
Events are UI-agnostic. A frontend may render them as a timeline or status
summary, but it must not mutate them or infer hidden Runtime state from display
text.

The Event envelope reserves `eventId`, `sessionId`, `sequence`, `eventVersion`,
`machineVersion`, `commandId`, `correlationId`, `causationId`, actor, trace,
created time, reason, and payload. Business transition Events carry
`runtimeTransition`. Lifecycle Events carry `fromLifecycleStatus` and
`toLifecycleStatus` and do not fabricate a business-state transition.

## RuntimeRecoveryPoint

- `recoveryPointId`
- `sessionId`
- `sessionVersion`
- `runtimeState`
- `snapshot`
- `createdAt`

P0 retains only the latest stable Recovery Point. Rollback creates a new
session version and a new Event; it does not overwrite Event history, compensate
external side effects, or replay tasks. The snapshot excludes full UI Contract
data, raw LLM output, and large execution payloads.

## RuntimeStateMachineSource

`runtime-state-machine.json` is the single source of truth for Runtime states,
Events, legal transitions, terminal markers, lifecycle transitions, guards, and
P0 recovery / replay boundaries.

`runtime.schema.json` contains generated or verified projections. Its
`x-runtimeTransitions` field is explanatory metadata only. Legal transition
enforcement is performed by JSON Schema transition branches and the server-side
Transition Engine.

Machine version `v4-p0-2` corrects three event semantics:

- confirmation acceptance enters `executing_mock_actions`;
- Mock execution completion enters `feedback_capture`;
- recovery resumption returns `failed_recoverable` to `planning_local`.

## RuntimeState

| State | Current trace/API source | Purpose | Allowed next states |
| --- | --- | --- | --- |
| `intent_loading` | `/api/intent`, local fallback | Load structured intent and lessons | `clarifying`, `planning_local`, `failed_recoverable` |
| `clarifying` | `planner` | Ask for missing group or time information | `planning_local` |
| `planning_local` | `planner` | Build parsed request and assumptions | `researching_tools` |
| `researching_tools` | `researchers` | Use Mock tools for weather, activities, restaurants, routes, availability | `merging_plans` |
| `merging_plans` | `merger` | Produce candidate service packages | `verifying_plan` |
| `verifying_plan` | `verifier` | Check feasibility, budget, risk, and high-impact actions | `ready_for_confirmation`, `replanning` |
| `replanning` | `revise` | Handle rain, full restaurant, no tickets, party size change, fatigue, or budget events | `verifying_plan` |
| `ready_for_confirmation` | UI selected plan | Wait for user confirmation | `executing_mock_actions`, `feedback_capture` |
| `executing_mock_actions` | execution queue | Simulate booking, queueing, ticket, group-buy, message, and reminder actions | `feedback_capture` |
| `feedback_capture` | `/api/feedback`, `reflect` | Record user correction or satisfaction signal | `feedback_capture`, `memory_candidate_review`, `done` |
| `memory_candidate_review` | candidate decision endpoint | User adopts, ignores, or corrects reusable lesson | `memory_candidate_review`, `memory_committed`, `done` |
| `memory_committed` | SQLite memory | Store adopted reusable lesson | `done` |
| `failed_recoverable` | fallback behavior | Recover from unavailable backend/LLM/LangGraph/SQLite | `planning_local` |
| `done` | UI result | Session is complete | none |

## IntentResult

- `source`: LLM or fallback source.
- `runtimePath`: LangGraph, direct LLM, or null when missing configuration.
- `intent`: normalized group, time, party size, preferences, budget, child age, missing fields, confidence, and summary.
- `lessonsUsed`: retrieved long-term memories used as planning context.
- Rule: low confidence or invalid response falls back to local planning.

## FeedbackEvent

- `inputText`: request that produced the feedback.
- `llmIntentJson`: optional structured intent at the time of feedback.
- `userCorrection`: user-provided correction.
- `failureType`: general or skill-specific failure category.
- Relationship: may create one MemoryCandidate.

## MemoryCandidate

- `type`: preference, negative preference, planning skill, or episode memory.
- `key`: reusable category such as pace, budget, transport, family context.
- `value`: abstracted memory text.
- `confidence`: candidate confidence.
- `sensitivityLevel`: L0, L1, L2, or L3.
- `status`: pending, adopted, or ignored.
- Rule: L2/L3 candidates do not become long-term memory by default.

## LongTermMemory

- Created only from adopted or corrected candidates.
- Used as reference context for later intent recognition and planning.
- Must not override explicit current request constraints.

## MemoryUsageEvent

- Records which long-term memories were considered for an input.
- Current alpha meaning: a memory reference record, not a complete audit record.
- Supports debugging which memories were considered.
- Future lightweight DB update: add `priority_rule` with default
  `current_request_overrides_memory`, plus a test proving the field is written
  when memory usage is recorded.

## Current Implementation Boundary

- The current V4 implementation is a stateless thin Runtime aggregator. It does
  not persist backend sessions or verify full state continuity.
- Future V4 lightweight hardening should make Runtime return a recoverable
  downgrade state for low-confidence intent results.
- `feedback` and `memoryDecision` are both retained Runtime operations, but
  `runtime.schema.json` rejects any request containing both field names. This
  presence-based rule also rejects `feedback: null` combined with
  `memoryDecision`, or the inverse. The current alpha handler still needs
  implementation alignment.
- `runtime-state-machine.json` is the source of truth for states, Events, and
  legal transitions. `runtime.schema.json` is a generated / verified contract
  projection.
- V4 Runtime P0 is the planned persisted headless state machine. V5 consumes
  Runtime through adapter, capability, and Event contracts and does not run the
  state machine in the browser.
