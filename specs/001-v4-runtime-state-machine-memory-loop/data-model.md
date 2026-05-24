# Data Model: V4 Runtime State Machine and Memory Loop

## RuntimeSession

- `inputText`: original user request.
- `overrides`: user or system-provided planning hints.
- `currentState`: one of the documented RuntimeState values.
- `selectedPlanId`: chosen plan when available.
- `executedActions`: simulated execution results after confirmation.
- Relationship: owns one IntentResult and may reference FeedbackEvent and MemoryUsageEvent records.

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
| `feedback_capture` | `/api/feedback`, `reflect` | Record user correction or satisfaction signal | `memory_candidate_review` |
| `memory_candidate_review` | candidate decision endpoint | User adopts, ignores, or corrects reusable lesson | `memory_committed`, `done` |
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
- Supports auditability and future debugging.
