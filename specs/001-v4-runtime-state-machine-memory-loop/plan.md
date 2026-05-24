# Implementation Plan: V4 Runtime State Machine and Memory Loop

**Branch**: `001-v4-runtime-state-machine-memory-loop` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-v4-runtime-state-machine-memory-loop/spec.md`

## Summary

Create a Spec Kit-governed productization slice for the V4 runtime state machine
and consent-based memory loop. This phase produces contracts, data model, and
implementation tasks only; it does not change runtime behavior or API wire shapes.

## Technical Context

**Language/Version**: JavaScript for the current static demo, Python 3.12 for the optional backend  
**Primary Dependencies**: Existing FastAPI, Pydantic, httpx, pytest, optional LangGraph, local browser JavaScript  
**Storage**: Existing local SQLite memory store plus audit JSONL  
**Testing**: `npm test`, Python compile checks, pytest when available  
**Target Platform**: Local Windows development and browser demo  
**Project Type**: Static Web Demo with optional local API backend  
**Performance Goals**: Preserve current local demo responsiveness; no new runtime overhead in this documentation phase  
**Constraints**: No business-code behavior change; no endpoint shape change; no real platform execution  
**Scale/Scope**: One maintainer, high-risk V4 governance for runtime and memory loop only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Stable Demo Path: PASS. The phase does not alter static demo behavior or make the backend required.
- Spec Gate for V4 Risk: PASS. Runtime and memory work now has spec, plan, contracts, and tasks.
- Mock Boundary Honesty: PASS. Contracts explicitly keep execution actions Mock.
- Memory Privacy and Consent: PASS. Candidate review and L2/L3 blocking are required.
- Verified, Reversible Changes: PASS. This phase is documentation/configuration only and preserves business code.

## Project Structure

### Documentation (this feature)

```text
specs/001-v4-runtime-state-machine-memory-loop/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analysis.md
├── contracts/
│   └── runtime-memory-contract.md
├── checklists/
│   ├── requirements.md
│   └── runtime-readiness.md
└── tasks.md
```

### Source Code (repository root)

```text
agent-core.js          # current planner, trace, Mock tools, and execution simulation
app.js                 # current UI, intent fallback, feedback, and memory candidate actions
server.py              # current optional API routes
backend_core.py        # current intent validation and SQLite memory functions
graph_runtime.py       # current optional LangGraph intent wrapper
tests.js               # current front-end regression tests
test_backend_core.py   # current backend memory/intent tests
test_graph_runtime.py  # current optional graph runtime tests
```

**Structure Decision**: Keep the existing single-repository layout. This feature
adds Spec Kit artifacts only; future implementation tasks may edit the files above
but are not executed in this phase.

## Complexity Tracking

No constitution violations.
