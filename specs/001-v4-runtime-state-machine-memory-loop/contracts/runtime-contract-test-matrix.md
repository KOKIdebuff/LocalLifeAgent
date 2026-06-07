# Runtime Contract Test Matrix

## Goal

Validate that the V4 thin runtime, feedback, and memory contracts are ready for
frontend-independent consumption without changing current planning behavior.

## Schema Syntax

| Case | Artifact | Expected result |
| --- | --- | --- |
| Intent schema parses | `intent.schema.json` | JSON syntax is valid |
| Feedback/memory schema parses | `feedback-memory.schema.json` | JSON syntax is valid |
| Runtime schema parses | `runtime.schema.json` | JSON syntax is valid |
| Runtime status | `runtime.schema.json` | `x-apiStatus` is `thin_runtime_and_product_runtime_p0_implemented` |
| Hybrid frontend rule | `runtime.schema.json` and contract docs | new UI uses `agent-core.js` for planning and Runtime for state/enhancement |

## Feedback and Memory

| Case | Contract source | Expected result |
| --- | --- | --- |
| Feedback creates candidate | `feedback-memory.schema.json` | `FeedbackResponse.candidate` may be a pending `MemoryCandidate` |
| Feedback creates no candidate | `feedback-memory.schema.json` | `FeedbackResponse.candidate` may be `null` |
| Sensitive feedback blocked | `feedback-memory.schema.json` | `x-privacyRules.blockedByDefault` includes `L2` and `L3` |
| Adopt candidate | `feedback-memory.schema.json` | decision action includes `adopt`; success status is `adopted`; memory may be created |
| Correct candidate | `feedback-memory.schema.json` | decision action includes `correct`; success status is `adopted`; memory may be created |
| Ignore candidate | `feedback-memory.schema.json` | decision action includes `ignore`; success status is `ignored`; memory remains `null` |
| Current request wins | `feedback-memory.schema.json` | `memoryConflictPriority` is `current_request_overrides_memory` |

## Runtime State Machine

| Case | Contract source | Expected result |
| --- | --- | --- |
| State-machine fact source | `runtime-state-machine.json` | file is the single source for states, events, transitions, lifecycle, guards, recovery, and replay boundaries |
| State-machine version | state-machine source and `runtime.schema.json` | approved machine version is `v4-p0-2` |
| Correct confirmation Event | transition source | `confirmation_accepted` enters `executing_mock_actions`; `mock_execution_completed` does not |
| Correct execution completion Event | transition source | `mock_execution_completed` enters `feedback_capture`; generic `feedback_captured` does not finish execution |
| Correct recovery Event | transition source | `recovery_resumed` returns to `planning_local`; `planning_completed` does not represent recovery |
| Generated state enum | state-machine source and `runtime.schema.json` | `RuntimeState` exactly matches source states |
| Generated event enum | state-machine source and `runtime.schema.json` | `RuntimeEventType` exactly matches source events |
| Generated transition schema | state-machine source and `runtime.schema.json` | every source transition has one JSON Schema success branch |
| Undeclared state combinations | state-machine source and `runtime.schema.json` | every undeclared `(fromState, eventType, toState)` combination fails |
| Every state is declared | `runtime.schema.json` | all `x-runtimeTransitions` keys are in `RuntimeState.enum` |
| Every next state is declared | `runtime.schema.json` | all transition targets are in `RuntimeState.enum` |
| Required transition table | `runtime.schema.json` | transition table equals the fixed V4 plan |
| Terminal state | `runtime.schema.json` | `done` has no allowed next states |
| Recoverable failure | `runtime.schema.json` | `failed_recoverable` can only transition to `planning_local` |
| Lifecycle terminal state | state-machine source | `closed` cannot transition further |
| Event type mismatch | `RuntimeTransition` | a valid state pair with the wrong Event fails |
| State source authority | RuntimeAdapter write input and Transition Engine contract | `submit_event` is an intent; clients cannot submit trusted `fromState`; server reads persisted session |
| Session lifecycle | persisted session and lifecycle rules | create, pause, resume, and close are represented independently of business state |
| Paused write rejection | lifecycle rules | paused sessions allow reads but reject business advancement with `session_paused` |
| Closed write rejection | lifecycle rules | closed sessions reject every write with `session_closed` |
| Optimistic lock | RuntimeAdapter write input and persisted session | stale `expectedVersion` produces `version_conflict` |
| Write idempotency | RuntimeAdapter write input | the same `idempotencyKey` cannot write twice |
| Atomic write | Transition Engine contract | Event insertion and session update are in one transaction |
| Runtime operation exclusivity | `RuntimeRequest` | feedback-only and memoryDecision-only requests are valid; any request containing both fields fails, including null combinations |
| Lifecycle Event shape | `RuntimeEventEnvelope` | lifecycle Events carry actor, trace, reason, and lifecycle status fields without a fake business transition |
| Recovery snapshot | `RuntimeRecoveryPoint` | snapshot keeps stable Runtime fields and excludes full UI / raw LLM / large execution data |
| Rollback append-only | recovery and persistence policies | rollback creates a new version and Event without overwriting history |
| Target capability status | `targetCapabilities.status` | `supported` means contract frozen; `degraded` means contract frozen with limits; `unsupported` means out-of-scope decision frozen |
| Effective capability truth | `effectiveCapabilities.availability` | Product-grade Runtime P0 exposes available persisted sessions, state machine, Event stream, persistence, Recovery Point, RuntimeAdapter, capability query, and contract tests; rollback remains degraded and task replay / external compensation remain unavailable |
| Capability consumer rule | Runtime capability contract | clients enable features only from `effectiveCapabilities`; `targetCapabilities` is planning and acceptance metadata |
| Persistence tables | persistence policy | P0 adds independent Runtime session, Event, Recovery Point, and Runtime migration tables to the existing SQLite file and does not migrate thin temporary sessions |
| Dual-entry architecture | compatibility policy | legacy and new APIs delegate to one Runtime Core; CompatibilityAdapter contains no business rules |
| Legacy golden protection | compatibility policy | legacy `POST /api/runtime` request/response fixtures must pass before rollout |
| No dual write | compatibility policy | P0 has one authoritative write path and forbids old/new dual writes |
| Execution ownership | execution boundary | V4 P0 stores only Execution references and summary Events; task/step lifecycle is an independent P1 domain |
| Replay boundary | state-machine source | P0 supports Event query and latest recovery restore, not business replay |

## Execution P1

| Case | Contract source | Expected result |
| --- | --- | --- |
| Independent Execution domain | `execution/` and API routes | Execution owns create/query/advance/cancel and does not mutate Runtime business state |
| Step lifecycle ownership | Execution repositories | Step state, attempt count, retry, blocking, cancellation, and completion are persisted under Execution tables |
| Runtime summary integration | Runtime Event stream | Execution writes only summary Events and `activeExecutionId` into Runtime |
| Terminal protection | Execution state machine | completed, failed, and cancelled executions reject future advance/cancel writes |
| Blocked protection | Execution state machine | blocked executions reject further advance until an explicit future flow exists |
| Version gate | Execution write input | stale execution version produces `execution_version_conflict` |
| Plan-version gate | Execution write input | stale plan version produces `execution_plan_version_conflict` |
| Summary payload boundary | Runtime payload allowlist | Runtime summary Events reject UI fields and oversized payloads without partial writes |
| Legacy protection | legacy golden fixtures | feature flag off keeps legacy `POST /api/runtime` golden behavior stable |
| Durable outbox | Execution repositories | `execution_outbox` persists pending mock step work independently of Runtime tables |
| Manual worker drain | ExecutionWorker | worker drain claims pending outbox items and advances only the matching current active step |
| Stale outbox protection | ExecutionWorker | outbox items for a step that is no longer current are skipped, not replayed against another step |
| No external execution | Execution boundary | outbox worker keeps mock-only semantics and does not call booking, payment, messaging, or scheduler services |

## V5 Runtime Projection

| Case | Contract source | Expected result |
| --- | --- | --- |
| Runtime authority | `RuntimeSummary.runtimeState` | value references `runtime.schema.json#/$defs/RuntimeState` |
| Display-only phase | `RuntimeSummary.displayPhase` | phase is derived from `x-runtimeStateDisplayMapping` and cannot drive Runtime transitions |
| Mapping completeness | Runtime and UI schemas | every Runtime state has exactly one display phase mapping |
| Removed duplicate state | `RuntimeSummary` | `currentState` and UI-owned Runtime state enum are absent |
| Execution implementation flag | `FeatureFlags` | `executionImplementationRequired` exists and defaults to `false` |
| Removed old flag | `FeatureFlags` | `executionContractOnly` is absent |

## POST /api/runtime Responses

| Case | Contract source | Expected result |
| --- | --- | --- |
| Planning success | `runtime.schema.json` | response status includes `planning_ready` |
| Clarification | `runtime.schema.json` | response status includes `clarification_required`; state is `clarifying` |
| Recoverable failure | `runtime.schema.json` | response status includes `recoverable_failure`; state is `failed_recoverable` |
| Feedback captured | `runtime.schema.json` | response status includes `feedback_captured`; state is `feedback_capture` |
| Memory committed | `runtime.schema.json` | response status includes `memory_committed`; state is `memory_committed` |

## Non-Goals

- Do not migrate existing frontend planning flow in this phase.
- Do not return full candidate plan results from Runtime.
- Do not make Runtime depend on current `app.js` component state.
- Do not convert mock execution actions into real platform actions.
