# Runtime / Execution Delivery Audit

Date: 2026-06-07

## Scope

This audit records the current delivery grouping for the V4 Runtime and
Execution work. It is intentionally separate from UI delivery notes so Runtime
and Execution changes can be reviewed and rolled back independently.

## Runtime / Execution Delivery Group

Core backend implementation:

- `runtime/`
- `execution/`
- `server.py`
- `runtime-state-machine.json`
- `runtime.schema.json`
- `fixtures/runtime_legacy/`
- `test_runtime_api.py`
- `test_execution_api.py`

Runtime / Execution documentation:

- `runtime-implementation-design.md`
- `specs/001-v4-runtime-state-machine-memory-loop/tasks.md`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-contract-test-matrix.md`
- `specs/001-v4-runtime-state-machine-memory-loop/plan.md`

## Separate Dirty Worktree Groups

V5 / UI files currently changed in the same worktree but not owned by this
Runtime / Execution delivery group:

- `app.js`
- `index.html`
- `styles.css`
- `ui-shell-tests.js`

Saved-plan files currently changed in the same worktree but should be reviewed
as their own delivery group:

- `saved-plans.js`
- `saved-plans-tests.js`

## Consistency Findings

- `runtime-state-machine.json` includes Runtime P0 business events plus
  Execution summary Event types.
- `runtime.schema.json` marks Runtime P0 as implemented and keeps rollback as
  degraded.
- `runtime-implementation-design.md` records P1-A, P1-B, and P1-C as
  implemented.
- P1-D in-process Execution outbox and manual worker drain are implemented
  while keeping automatic background threads, distributed scheduling, external
  compensation, and full task replay out of scope.
- `tasks.md` marks T049-T076 complete.

## Safety Findings

- Runtime stores only Execution summary Events and `activeExecutionId`; it does
  not mutate Execution Step state.
- Execution owns Step state, attempts, retry, blocking, cancellation, and
  completion.
- Execution outbox stores pending mock step work and skips stale work instead
  of replaying it against a different current step.
- Runtime summary payloads are allowlisted and size-limited.
- Legacy `POST /api/runtime` remains protected by golden fixtures.

## Current Validation Gates

Run before treating this delivery group as releasable:

```powershell
.\.venv\Scripts\python.exe -m pytest test_backend_core.py test_graph_runtime.py test_runtime_api.py test_execution_api.py -q
.\.venv\Scripts\python.exe -m unittest test_contract_schemas.py -q
npm.cmd test
git diff --check
```

Known non-blocking warning:

- Pytest cache writes may warn under the current Windows sandbox.
- `git diff --check` may show LF/CRLF warnings without whitespace errors.
