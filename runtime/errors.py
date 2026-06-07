from __future__ import annotations


class RuntimeErrorBase(Exception):
    code = "runtime_error"
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


class SessionNotFound(RuntimeErrorBase):
    code = "session_not_found"
    http_status = 404


class SessionPaused(RuntimeErrorBase):
    code = "session_paused"


class SessionClosed(RuntimeErrorBase):
    code = "session_closed"


class InvalidTransition(RuntimeErrorBase):
    code = "invalid_transition"


class VersionConflict(RuntimeErrorBase):
    code = "version_conflict"


class RecoveryPointNotFound(RuntimeErrorBase):
    code = "recovery_point_not_found"
    http_status = 404


class RollbackNotSupported(RuntimeErrorBase):
    code = "rollback_not_supported"


class MutuallyExclusiveOperations(RuntimeErrorBase):
    code = "mutually_exclusive_operations"
