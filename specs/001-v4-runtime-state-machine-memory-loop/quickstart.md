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

## Expected Result

- Spec Kit reports version `0.8.7`.
- `.specify/`, `.agents/skills/`, and this feature directory exist.
- Business-code files are not changed by this documentation phase except for the
  spec-kit `AGENTS.md` context pointer.
- Existing tests pass.
