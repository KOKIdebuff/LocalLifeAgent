# Quickstart: V4 Runtime State Machine and Memory Loop

## Goal

Validate that Spec Kit governance is in place and current runtime behavior remains
unchanged after adding the V4 state/memory artifacts.

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

4. Run current regression checks:

   ```powershell
   npm test
   # If PowerShell blocks npm.ps1, use:
   npm.cmd test
   .\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\graph_runtime.py .\test_backend_core.py .\test_graph_runtime.py
   .\.venv\Scripts\pytest.exe .\test_backend_core.py .\test_graph_runtime.py
   ```

5. Validate the V4 contract schemas and fixed runtime transition table:

   ```powershell
   .\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py
   ```

6. Validate thin Runtime backend behavior:

   ```powershell
   .\.venv\Scripts\pytest.exe .\test_runtime_api.py
   ```

## Expected Result

- Spec Kit reports version `0.8.7`.
- `.specify/`, `.agents/skills/`, and this feature directory exist.
- `intent.schema.json`, `feedback-memory.schema.json`, and
  `runtime.schema.json` parse as valid JSON.
- `runtime.schema.json` exposes the fixed V4 transition table through
  `x-runtimeTransitions`.
- `POST /api/runtime` is available as a thin Runtime endpoint for state and
  backend enhancement results.
- Business-code changes are limited to the thin Runtime endpoint and shared
  intent helper in `server.py`; frontend planning code remains unchanged.
- Existing tests pass.
