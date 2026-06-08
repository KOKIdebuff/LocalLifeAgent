from __future__ import annotations


class CollaborationError(Exception):
    code = "collaboration_error"
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


class ShareNotFound(CollaborationError):
    code = "share_not_found"
    http_status = 404


class ShareTokenInvalid(CollaborationError):
    code = "share_token_invalid"
    http_status = 403
    recoverable = False


class ShareReadOnly(CollaborationError):
    code = "share_readonly"
    http_status = 410


class ShareCreateConflict(CollaborationError):
    code = "share_create_conflict"
