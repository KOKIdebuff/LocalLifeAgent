# Implementation Plan: V4 Runtime State Machine and Memory Loop

**Branch**: `001-v4-runtime-state-machine-memory-loop` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-v4-runtime-state-machine-memory-loop/spec.md`

## Summary

Create a Spec Kit-governed productization slice for the V4 runtime state machine
and consent-based memory loop. The delivered alpha slice includes contracts, data
model, validation, and a compatible optional `POST /api/runtime` backend endpoint
that aggregates Runtime state and backend enhancement results. Frontend planning
and Mock execution behavior remain unchanged. The next V4 Runtime P0 contract
uses `runtime-state-machine.json` as the single state-machine source and freezes
persisted sessions, Command/Event separation, optimistic locking, atomic writes,
Recovery Points, and V5 read-only Runtime projection. The product-grade Runtime
P0 implementation now includes the server-side Transition Engine and persisted
Runtime repositories.

The approved implementation architecture is dual-entry with one state
authority: the existing `POST /api/runtime` is preserved behind a
`CompatibilityAdapter`, while new `/api/runtime/sessions/*` operations use the
product-grade `RuntimeAdapter`; both must delegate to the same Runtime Core when
the new core is enabled. V4 P0 adds independent Runtime tables to the existing
SQLite file. Task/step lifecycle remains an independent Execution domain and is
not implemented by V4 Runtime P0.

## Technical Context

**Language/Version**: JavaScript for the current static demo, Python 3.12 for the optional backend  
**Primary Dependencies**: Existing FastAPI, Pydantic, httpx, pytest, optional LangGraph, local browser JavaScript  
**Storage**: Existing local SQLite file plus audit JSONL; additive independent Runtime session / Event / Recovery Point / Runtime migration tables are implemented for Runtime P0
**Testing**: `npm.cmd test`, `.venv` Python compile checks, contract unittest, and `.venv` pytest baseline
**Target Platform**: Local Windows development and browser demo  
**Project Type**: Static Web Demo with optional local API backend  
**Performance Goals**: Preserve current local demo responsiveness; keep the optional thin Runtime endpoint lightweight
**Constraints**: Preserve existing endpoint semantics and frontend planning ownership; no real platform execution
**Scale/Scope**: One maintainer, high-risk V4 governance, compatible thin Runtime backend slice, and product-grade Runtime P0 contract freeze

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Stable Demo Path: PASS. The optional endpoint does not alter static demo behavior or make the backend required.
- Spec Gate for V4 Risk: PASS. Runtime and memory work now has spec, plan, contracts, and tasks.
- Mock Boundary Honesty: PASS. Contracts explicitly keep execution actions Mock.
- Memory Privacy and Consent: PASS. Candidate review and L2/L3 blocking are required.
- Verified, Reversible Changes: PASS. The thin backend addition is covered by schema and API tests and leaves frontend planning intact.

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
test_contract_schemas.py # current contract and transition-table tests
test_runtime_api.py    # current thin Runtime endpoint tests
runtime-state-machine.json # V4 Runtime P0 state-machine single source of truth
```

**Structure Decision**: Keep the existing single-repository layout. This feature
adds Spec Kit artifacts plus an optional thin backend Runtime endpoint in
`server.py`. Any future migration of frontend planning, replanning, or Mock
execution requires a separate scoped implementation phase.

## Complexity Tracking

No constitution violations.
