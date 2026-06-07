# Tasks: V4 Runtime State Machine and Memory Loop

**Input**: Design documents from `specs/001-v4-runtime-state-machine-memory-loop/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Include validation tasks because this is a high-risk V4 governance feature.

**Organization**: Tasks are grouped by independently testable user story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure Spec Kit governance is available and discoverable.

- [x] T001 Install official GitHub spec-kit v0.8.7 in project virtual environment `.venv/`
- [x] T002 Initialize Spec Kit with Codex integration in `.specify/` and `.agents/skills/`
- [x] T003 Write LocalLifeAgent constitution in `.specify/memory/constitution.md`
- [x] T004 Update Spec Kit plan template constitution gates in `.specify/templates/plan-template.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the feature artifact set before any runtime implementation.

- [x] T005 Create feature pointer in `.specify/feature.json`
- [x] T006 Create feature specification in `specs/001-v4-runtime-state-machine-memory-loop/spec.md`
- [x] T007 Create requirements checklist in `specs/001-v4-runtime-state-machine-memory-loop/checklists/requirements.md`
- [x] T008 Create implementation plan in `specs/001-v4-runtime-state-machine-memory-loop/plan.md`
- [x] T009 Create research decisions in `specs/001-v4-runtime-state-machine-memory-loop/research.md`

**Checkpoint**: Foundation ready; user stories can be implemented later.

---

## Phase 3: User Story 1 - Traceable Runtime State Contract (Priority: P1) MVP

**Goal**: Document the runtime state vocabulary and trace mapping.

**Independent Test**: A reviewer can map every current trace stage to a runtime state and allowed next state.

### Tests for User Story 1

- [x] T010 [P] [US1] Validate trace-stage coverage in `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- [x] T011 [P] [US1] Validate runtime readiness checklist in `specs/001-v4-runtime-state-machine-memory-loop/checklists/runtime-readiness.md`

### Implementation for User Story 1

- [x] T012 [US1] Define RuntimeSession and RuntimeState in `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- [x] T013 [US1] Document allowed state transitions in `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`

**Checkpoint**: Runtime state contract is independently reviewable.

---

## Phase 4: User Story 2 - Consent-Based Memory Loop (Priority: P2)

**Goal**: Document feedback, candidate, memory, and memory usage behavior.

**Independent Test**: A reviewer can verify that long-term memory requires adopt or correct and blocks L2/L3 by default.

### Tests for User Story 2

- [x] T014 [P] [US2] Validate memory boundary checklist in `specs/001-v4-runtime-state-machine-memory-loop/checklists/runtime-readiness.md`

### Implementation for User Story 2

- [x] T015 [US2] Define FeedbackEvent, MemoryCandidate, LongTermMemory, and MemoryUsageEvent in `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- [x] T016 [US2] Document memory endpoint semantics in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`

**Checkpoint**: Memory loop is independently reviewable.

---

## Phase 5: User Story 3 - Existing API Compatibility (Priority: P3)

**Goal**: Preserve existing endpoint behavior while documenting V4 runtime mapping.

**Independent Test**: A reviewer can compare contracts with current endpoints and find no required wire-shape changes.

### Tests for User Story 3

- [x] T017 [P] [US3] Validate API compatibility checklist in `specs/001-v4-runtime-state-machine-memory-loop/checklists/runtime-readiness.md`

### Implementation for User Story 3

- [x] T018 [US3] Document `/api/intent` compatibility in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- [x] T019 [US3] Document `/api/feedback` compatibility in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- [x] T020 [US3] Document candidate decision compatibility in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- [x] T021 [US3] Add validation quickstart in `specs/001-v4-runtime-state-machine-memory-loop/quickstart.md`

**Checkpoint**: Existing API compatibility is documented.

---

## Phase 6: Analyze & Validate

**Purpose**: Confirm artifacts align and current behavior still passes checks.

- [x] T022 Create cross-artifact analysis in `specs/001-v4-runtime-state-machine-memory-loop/analysis.md`
- [x] T023 Run `.venv\Scripts\specify.exe check`
- [x] T024 Run `npm.cmd test` as the PowerShell-safe frontend baseline
- [x] T025 Run Python compile checks for backend and graph files
- [x] T026 Run `.\.venv\Scripts\python.exe -m pytest .\test_backend_core.py .\test_graph_runtime.py .\test_runtime_api.py -q`
- [x] T027 Review `git status --short` to confirm no unintended business-code edits

---

## Phase 7: Contract Schema Completion

**Purpose**: Make feedback, memory, and runtime contracts machine-checkable before
the thin Runtime backend slice and later full-runtime work.

- [x] T028 Add feedback and memory schema in `feedback-memory.schema.json`
- [x] T029 Add future runtime state machine schema in `runtime.schema.json`
- [x] T030 Expand runtime and memory contract documentation in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- [x] T031 Add contract test matrix in `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-contract-test-matrix.md`
- [x] T032 Add standard-library contract tests in `test_contract_schemas.py`
- [x] T033 Run `.\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py`

---

## Phase 8: Thin Runtime Implementation

**Purpose**: Implement frontend-agnostic Runtime state and backend enhancement
results while keeping planning in `agent-core.js`.

- [x] T034 Update Runtime docs and schemas for hybrid frontend dependency
- [x] T035 Implement `POST /api/runtime` in `server.py`
- [x] T036 Reuse the existing intent chain between `/api/intent` and `/api/runtime`
- [x] T037 Add Runtime API tests in `test_runtime_api.py`
- [x] T038 Validate Runtime API coverage within the `.venv` pytest baseline

---

## Phase 9: Current-State Documentation Synchronization

**Purpose**: Align public and Spec Kit status reporting with the completed alpha
slice without overstating full Runtime maturity.

- [x] T039 Update `README.md` and `progress.md` to record the thin Runtime endpoint, alpha schemas, and current validation evidence
- [x] T040 Update `spec.md`, `plan.md`, and `analysis.md` to remove governance-only statements superseded by Phase 8
- [x] T041 Confirm `tasks.md` distinguishes completed thin Runtime work from future frontend Runtime migration

---

## Phase 10: Product-Grade Headless Runtime P0 Contract Freeze

**Purpose**: Freeze the V4 Runtime P0 state-machine, session, concurrency,
Command/Event, recovery, and V5 projection boundaries without claiming the
Transition Engine implementation is complete.

- [x] T042 Add `runtime-state-machine.json` as the single state-machine fact source
- [x] T043 Add generated / verified Runtime state, Event, and legal transition constraints to `runtime.schema.json`
- [x] T044 Add persisted session, optimistic lock, idempotent Command, Event envelope, and atomic-write contracts
- [x] T045 Add Recovery Point and P0 replay-boundary contracts
- [x] T046 Replace V5 `RuntimeSummary.currentState` with authoritative `runtimeState` plus presentation-only `displayPhase`
- [x] T047 Rename `executionContractOnly` to `executionImplementationRequired` with default `false`
- [x] T048 Add drift, legal/illegal transition, terminal-state, concurrency, recovery, and V5 projection contract tests
- [x] T052 Split Runtime target capabilities from authoritative effective capabilities
- [x] T049 Implement SQLite Runtime session / Event / Recovery Point repositories
- [x] T050 Implement server-side Transition Engine and atomic Event + session writes
- [x] T051 Implement product-grade RuntimeAdapter `submit_event` intent input and persisted session state without breaking the current alpha `/api/runtime`

---

## Phase 11: Approved Product-Grade Runtime P0 Implementation

**Purpose**: Implement the approved dual-entry, single-Core architecture without
expanding V5 P0 or adding Execution task/step ownership.

- [x] T053 Upgrade the state-machine contract to `v4-p0-2` and correct confirmation, execution-completion, and recovery-resume Event semantics
- [x] T054 Freeze dual-entry architecture: legacy `POST /api/runtime` through `CompatibilityAdapter`, new `/api/runtime/sessions/*` through `RuntimeAdapter`, one Runtime Core
- [x] T055 Freeze existing-SQLite strategy with independent Runtime tables and `runtime_schema_migrations`
- [x] T056 Freeze Runtime/Execution ownership: V4 P0 stores only Execution references and summary Events; task/step lifecycle moves to Execution P1
- [x] T057 Freeze legacy `POST /api/runtime` golden request/response fixtures before Core integration
- [x] T058 Define versioned Session API DTOs and HTTP error mapping
- [x] T059 Implement Runtime repositories, migration runner, busy timeout, unique sequence/idempotency constraints, and payload allowlists
- [x] T060 Implement the `v4-p0-2` Transition Engine from `runtime-state-machine.json`
- [x] T061 Implement atomic Event + Session writes, optimistic locking, and rollback-on-failure tests
- [x] T062 Implement RuntimeAdapter and `/api/runtime/sessions/*` routes
- [x] T063 Implement conversion-only CompatibilityAdapter and legacy response projection
- [x] T064 Add product-grade Runtime feature flag, disabled by default, with immediate legacy fallback
- [x] T065 Add shadow comparison for old/new core results without dual writes
- [x] T066 Add capability query backed by effective implementation state
- [x] T067 Add restart recovery, duplicate request, concurrency conflict, event ordering, latest Recovery Point, and rollback integration tests
- [x] T068 Run legacy golden, V4 contract, backend, and V5 compatibility regression gates

---

## Phase 12: Independent Execution Domain P1

**Purpose**: Implement Execution after the V4 Runtime P0 boundary is stable.
Execution may start as a separate module in the same FastAPI application; P1
does not require a separate process or distributed transaction.

- [x] T069 [P1-A] Define independent Execution model, state machine, repositories, and create/query/advance/cancel API
- [x] T070 [P1-B] Add Step Attempt history, failure classification, bounded retry, timeout, idempotency, and plan-version gate
- [x] T071 [P1-C] Integrate Execution with Runtime through stable adapters and authoritative summary Events
- [x] T072 Add Execution transition, stale-plan rejection, duplicate-advance, retry-limit, cancellation, Mock-boundary, and Runtime-summary consistency tests

Deferred beyond P1: background workers, outbox, distributed scheduling,
multi-instance execution, and external action compensation.

---

## Phase 13: Execution Outbox and In-process Worker P1-D

**Purpose**: Add a durable local outbox and manual in-process worker drain for
Execution without introducing distributed scheduling or real external actions.

- [x] T073 [P1-D] Add `execution_outbox` persistence, idempotent current-step enqueue, and outbox status tracking
- [x] T074 [P1-D] Add manual `ExecutionWorker.drain_outbox()` that advances only the matching current active mock step
- [x] T075 [P1-D] Expose `/api/executions/outbox/drain` through ExecutionAdapter without binding Runtime to worker internals
- [x] T076 [P1-D] Add migration, route, worker-drain, stale-outbox, and mock-boundary tests

Deferred beyond P1-D: automatic background thread startup, distributed queue
claiming, multi-instance scheduling, real external action execution, and
external side-effect compensation.

---

## Dependencies & Execution Order

- Phase 1 must finish before all other phases.
- Phase 2 must finish before story validation.
- US1 should be reviewed before future runtime implementation.
- US2 can be reviewed after US1 because it depends on state naming.
- US3 can be reviewed after US1 and US2 because it maps endpoint behavior to states.

## Implementation Strategy

This task list records the completed contract work, compatible thin backend
Runtime slice, approved Runtime P0 implementation tasks, and the separate
Execution P1 track. V4 Runtime P0 does not migrate Execution task/step ownership
or bind the Runtime to V5 UI structure.
