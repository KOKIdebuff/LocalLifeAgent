# Feature Specification: V4 Runtime State Machine and Memory Loop

**Feature Branch**: `001-v4-runtime-state-machine-memory-loop`  
**Created**: 2026-05-24  
**Status**: Draft  
**Input**: User description: "Define the V4 runtime state machine for LocalLifeAgent and connect intent recognition, clarification, planning, verification, replanning, confirmation, feedback, memory candidates, and long-term memory references without changing current API behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Traceable Runtime State Contract (Priority: P1)

As the project maintainer, I want a single runtime state contract that maps the
current demo stages to V4 runtime states so future implementation does not invent
new behavior boundaries in code.

**Why this priority**: Runtime state is the backbone for productization. Without
it, memory and feedback can drift away from the current demo flow.

**Independent Test**: Review the state contract and confirm every current
`agentLoopTrace` stage has one mapped runtime state and one allowed next step.

**Acceptance Scenarios**:

1. **Given** the current `understand / planner / researchers / merger / verifier / revise / reflect` trace, **When** a maintainer reads the spec artifacts, **Then** each stage has a named V4 runtime state and transition rule.
2. **Given** missing group or time information, **When** the runtime reaches planning, **Then** the documented path stops at clarification instead of continuing with fabricated tool calls.

---

### User Story 2 - Consent-Based Memory Loop (Priority: P2)

As a user, I want feedback to become a proposed memory only after review, so the
agent can learn useful preferences without silently storing sensitive details.

**Why this priority**: Memory is a high-trust feature. It must be understandable,
auditable, and reversible before expanding capability.

**Independent Test**: Submit feedback, inspect the documented candidate decision
flow, and confirm long-term memory is only created after adopt or correct.

**Acceptance Scenarios**:

1. **Given** ordinary preference feedback, **When** the user adopts a candidate memory, **Then** the long-term memory flow records it as reusable planning context.
2. **Given** high-sensitive feedback, **When** the memory loop evaluates it, **Then** the documented behavior blocks long-term storage by default.
3. **Given** a later request conflicts with a stored memory, **When** planning begins, **Then** the current request takes priority.

---

### User Story 3 - Existing API Compatibility (Priority: P3)

As the implementer, I want the V4 contract to fit the existing backend endpoints
so the first implementation step can be incremental and reversible.

**Why this priority**: The current backend already has intent, feedback, and
candidate decision endpoints; the spec should clarify them before changing them.

**Independent Test**: Compare the contract artifacts with the current endpoints
and confirm no required request or response shape changes are introduced.

**Acceptance Scenarios**:

1. **Given** the existing `/api/intent` endpoint, **When** the runtime contract is applied, **Then** successful and fallback intent behavior remain compatible.
2. **Given** the existing `/api/feedback` endpoint, **When** feedback is submitted, **Then** the candidate-memory semantics are documented without requiring a new endpoint.
3. **Given** the existing `/api/memory-candidates/{candidate_id}/decision` endpoint, **When** adopt, ignore, or correct is selected, **Then** the documented memory state changes match current behavior.

### Edge Cases

- Backend, LLM, LangGraph, or SQLite is unavailable.
- LLM returns low confidence, invalid JSON, or missing required intent fields.
- User gives insufficient input and the system must ask instead of planning.
- User feedback contains L2/L3 sensitive data.
- Memory retrieval finds relevant lessons that conflict with the current request.
- The user ignores or corrects a pending memory candidate.
- Existing static demo is opened without the backend.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The runtime contract MUST define states for intent loading, clarification, local planning, tool research, plan merge, verification, replanning, confirmation, execution simulation, feedback capture, memory candidate review, long-term memory write, and memory reference.
- **FR-002**: The contract MUST map every current `agentLoopTrace` stage to one or more V4 runtime states.
- **FR-003**: The contract MUST preserve current `/api/intent`, `/api/feedback`, and `/api/memory-candidates/{candidate_id}/decision` request and response behavior for this first productization step.
- **FR-004**: The contract MUST state that current user input overrides retrieved memory when the two conflict.
- **FR-005**: The memory loop MUST require explicit adopt or correct before creating long-term memory.
- **FR-006**: The memory loop MUST block L2/L3 sensitive information from long-term memory by default.
- **FR-007**: The runtime MUST keep backend/LLM/LangGraph failure as a recoverable path that falls back to local rules or static demo behavior.
- **FR-008**: The contract MUST distinguish Mock execution actions from real external platform actions.
- **FR-009**: The runtime plan MUST identify the minimum tests needed before any future implementation changes are made.
- **FR-010**: This feature MUST NOT implement runtime behavior changes; it creates the specification, plan, contracts, and task list for a later implementation.

### Key Entities *(include if feature involves data)*

- **Runtime Session**: A single user request lifecycle from input through planning, confirmation, feedback, and reflection.
- **Runtime State**: A named step in the lifecycle with allowed transitions, input expectations, and failure behavior.
- **Intent Result**: The structured understanding of user input, including confidence and missing fields.
- **Feedback Event**: A user correction or satisfaction signal tied to the current session.
- **Memory Candidate**: A proposed reusable lesson awaiting user adopt, ignore, or correct.
- **Long-Term Memory**: An adopted reusable lesson that may be referenced in later planning.
- **Memory Usage Event**: A record that a memory influenced or was considered for a request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of current trace stages are mapped to documented runtime states.
- **SC-002**: 100% of existing V4 alpha endpoints are covered by compatibility notes.
- **SC-003**: A reviewer can identify the allowed next state for every documented state without reading implementation code.
- **SC-004**: The memory loop documents blocking behavior for all L2/L3 sensitive feedback examples in the current project rules.
- **SC-005**: The generated task list separates documentation/contract work from future implementation tasks so implementation can be deferred safely.

## Assumptions

- V4 productization starts with Runtime state and memory loop governance, not POI or Mock API productization.
- Only high-risk V4 features require Spec Kit artifacts.
- Existing API behavior remains compatible during this first governance step.
- Existing uncommitted business-code changes are preserved and not reverted.
- Tests in this phase verify initialization and current behavior; they do not validate unimplemented runtime behavior.
