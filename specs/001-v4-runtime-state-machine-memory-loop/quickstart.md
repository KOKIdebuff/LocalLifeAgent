# Quickstart: V4 Runtime State Machine and Memory Loop

## Goal

Validate that Spec Kit governance, the V4 contract set, and the compatible thin
Runtime backend alpha slice remain reproducible from the project virtual
environment.

## Checks

1. Confirm spec-kit CLI is available from the project virtual environment:

   ```powershell
   .\.venv\Scripts\specify.exe version
   .\.venv\Scripts\specify.exe check
   ```

2. Confirm the feature artifacts exist:

   ```powershell
   Get-ChildItem -Force .specify
   Get-ChildItem -Force .agents
   Get-ChildItem -Force specs\001-v4-runtime-state-machine-memory-loop
   ```

3. Confirm no business-code behavior changed unexpectedly:

   ```powershell
   git diff --name-only
   ```

4. Run the current validation baseline. Use `npm.cmd` in PowerShell to avoid
   local `npm.ps1` execution-policy blocks; run Python checks through `.venv`:

   ```powershell
   npm.cmd test
   .\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\graph_runtime.py .\test_backend_core.py .\test_graph_runtime.py .\test_contract_schemas.py .\test_runtime_api.py
   .\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py
   .\.venv\Scripts\python.exe -m pytest .\test_backend_core.py .\test_graph_runtime.py .\test_runtime_api.py -q
   ```

## Expected Result

- Spec Kit reports version `0.8.7`.
- `.specify/`, `.agents/skills/`, and this feature directory exist.
- `intent.schema.json`, `feedback-memory.schema.json`, and
  `runtime.schema.json`, `ui-contract.schema.json`, and
  `runtime-state-machine.json` parse as valid JSON.
- `runtime-state-machine.json` is the V4 Runtime P0 state-machine fact source.
- `runtime.schema.json` exposes generated / verified Runtime state, Event, and
  legal transition constraints. `x-runtimeTransitions` is explanatory metadata
  only.
- Contract tests cover all declared transitions, every undeclared
  state/Event/target combination, terminal states, Command/Event separation,
  optimistic-lock fields, Recovery Point boundaries, and V5
  `runtimeState/displayPhase` mapping.
- `POST /api/runtime` is available as a thin Runtime endpoint for state and
  backend enhancement results.
- Business-code changes are limited to the thin Runtime endpoint and shared
  intent helper in `server.py`; frontend planning code remains unchanged.
- `npm.cmd test` passes; contract tests and pytest should be reported from the
  latest command output in `progress.md`. Do not rely on stale fixed test counts
  after tests are added or removed.
- A LangGraph dependency deprecation warning may be emitted during pytest; it is
  recorded as non-blocking for the current alpha baseline.
