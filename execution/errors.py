from __future__ import annotations


class ExecutionError(Exception):
    code = "execution_error"
    http_status = 409
    recoverable = True

    def __init__(self, message: str | None = None, **details):
        super().__init__(message or self.code)
        self.details = details

    def to_payload(self) -> dict:
        return {
            "ok": False,
            "error": self.code,
            "recoverable": self.recoverable,
            **self.details,
        }


class ExecutionNotFound(ExecutionError):
    code = "execution_not_found"
    http_status = 404


class ExecutionVersionConflict(ExecutionError):
    code = "execution_version_conflict"


class ExecutionPlanVersionConflict(ExecutionError):
    code = "execution_plan_version_conflict"


class ExecutionInvalidTransition(ExecutionError):
    code = "execution_invalid_transition"


class ExecutionAlreadyTerminal(ExecutionError):
    code = "execution_already_terminal"
