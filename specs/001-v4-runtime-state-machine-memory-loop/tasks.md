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

## Dependencies & Execution Order

- Phase 1 must finish before all other phases.
- Phase 2 must finish before story validation.
- US1 should be reviewed before future runtime implementation.
- US2 can be reviewed after US1 because it depends on state naming.
- US3 can be reviewed after US1 and US2 because it maps endpoint behavior to states.

## Implementation Strategy

This task list records the completed contract work and compatible thin backend
Runtime slice. Future work must create a new implementation task set before
migrating frontend planning, candidate generation, replanning, or Mock execution
from `agent-core.js` / `app.js` into a fuller Runtime state machine.
