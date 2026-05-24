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
| Thin Runtime status | `runtime.schema.json` | `x-apiStatus` is `thin_runtime_implemented` |
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
| Every state is declared | `runtime.schema.json` | all `x-runtimeTransitions` keys are in `RuntimeState.enum` |
| Every next state is declared | `runtime.schema.json` | all transition targets are in `RuntimeState.enum` |
| Required transition table | `runtime.schema.json` | transition table equals the fixed V4 plan |
| Terminal state | `runtime.schema.json` | `done` has no allowed next states |
| Recoverable failure | `runtime.schema.json` | `failed_recoverable` can only transition to `planning_local` |

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
