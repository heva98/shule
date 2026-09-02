"""
SMS provider abstraction.

`get_sms_backend()` returns the backend named by settings.SMS_BACKEND:

    noop          — record everything, call no provider (default; used by tests)
    console       — noop + log each message
    notify_africa — real sends via api.notify.africa

Nothing above this layer knows which provider is in use or sees a credential.
Provider failures are returned as `SmsResult(ok=False, ...)`, never raised, so
the sender loop can record the row and move on.
"""

import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from django.conf import settings

logger = logging.getLogger(__name__)

_KNOWN_BACKENDS = ("noop", "console", "notify_africa")


@dataclass
class SmsResult:
    ok: bool
    provider_message_id: str = ""
    provider_status: str = ""
    error: str = ""
    raw: dict = field(default_factory=dict)


class SmsBackend(ABC):
    name = "base"

    @abstractmethod
    def send_one(self, *, to: str, body: str, sender_id: str) -> SmsResult:
        ...

    def config_errors(self) -> list[str]:
        """Human-readable reasons this backend can't send. Empty = good to go."""
        return []


class NoopSmsBackend(SmsBackend):
    name = "noop"

    def send_one(self, *, to: str, body: str, sender_id: str) -> SmsResult:
        return SmsResult(
            ok=True,
            provider_message_id=f"noop-{uuid.uuid4().hex}",
            provider_status="noop",
            raw={"backend": "noop"},
        )


class ConsoleSmsBackend(NoopSmsBackend):
    name = "console"

    def send_one(self, *, to: str, body: str, sender_id: str) -> SmsResult:
        logger.info("[SMS:console] to=%s sender=%s body=%r", to, sender_id, body)
        result = super().send_one(to=to, body=body, sender_id=sender_id)
        result.provider_status = "console"
        result.raw = {"backend": "console"}
        return result


def _text_signals_no_credit(payload) -> bool:
    text = str(payload).lower()
    return any(s in text for s in ("insufficient", "not enough", "low balance", "no credit", "out of credit"))


def _body_signals_failure(payload) -> bool:
    if not isinstance(payload, dict):
        return False
    status = str(payload.get("status") or (payload.get("data") or {}).get("status") or "").lower()
    if status in ("failed", "error", "rejected", "unsuccessful"):
        return True
    success = payload.get("success")
    return success is False


class NotifyAfricaBackend(SmsBackend):
    name = "notify_africa"

    # POST {base}/api/v1/api/messages/send  {phone_number, message, sender_id}
    # -> {status, message, data: {messageId, status}}
    SEND_PATH = "/api/v1/api/messages/send"

    def __init__(self):
        self.base_url = (settings.NOTIFY_AFRICA_BASE_URL or "").rstrip("/")
        self.token = settings.NOTIFY_AFRICA_API_TOKEN or ""
        self.sender_id = settings.NOTIFY_AFRICA_SENDER_ID or ""
        self.timeout = settings.NOTIFY_AFRICA_TIMEOUT

    def config_errors(self) -> list[str]:
        errs = []
        if not self.base_url:
            errs.append("NOTIFY_AFRICA_BASE_URL is not set")
        if not self.token:
            errs.append("NOTIFY_AFRICA_API_TOKEN is not set")
        if not self.sender_id:
            errs.append("NOTIFY_AFRICA_SENDER_ID is not set")
        return errs

    def send_one(self, *, to: str, body: str, sender_id: str) -> SmsResult:
        import requests

        url = f"{self.base_url}{self.SEND_PATH}"
        payload = {
            "phone_number": to.lstrip("+"),
            "message": body,
            "sender_id": sender_id or self.sender_id,
        }
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
        except requests.Timeout:
            return SmsResult(ok=False, provider_status="timeout",
                             error=f"Notify Africa did not respond within {self.timeout}s")
        except requests.RequestException as exc:
            return SmsResult(ok=False, provider_status="connection_error", error=str(exc)[:400])

        try:
            data = resp.json()
        except ValueError:
            data = {"raw_text": resp.text[:400]}
        raw = data if isinstance(data, dict) else {"response": data}

        if resp.status_code in (401, 403):
            return SmsResult(ok=False, provider_status="unauthorized",
                             error="Notify Africa rejected the API token", raw=raw)
        if resp.status_code == 402 or _text_signals_no_credit(data):
            return SmsResult(ok=False, provider_status="insufficient_credit",
                             error="Notify Africa reports insufficient SMS credit", raw=raw)
        if not resp.ok:
            return SmsResult(ok=False, provider_status=f"http_{resp.status_code}",
                             error=str(data)[:400], raw=raw)
        if _body_signals_failure(data):
            return SmsResult(ok=False, provider_status="rejected",
                             error=str(raw.get("message") or data)[:400], raw=raw)

        node = raw.get("data") if isinstance(raw.get("data"), dict) else {}
        message_id = str(node.get("messageId") or node.get("message_id")
                         or node.get("id") or raw.get("messageId") or "")
        provider_status = str(node.get("status") or raw.get("status") or "accepted")
        return SmsResult(ok=True, provider_message_id=message_id,
                         provider_status=provider_status, raw=raw)


_BACKENDS = {
    "noop": NoopSmsBackend,
    "console": ConsoleSmsBackend,
    "notify_africa": NotifyAfricaBackend,
}


def get_sms_backend() -> SmsBackend:
    name = (getattr(settings, "SMS_BACKEND", "noop") or "noop").strip().lower()
    backend_cls = _BACKENDS.get(name)
    if backend_cls is None:
        logger.error("Unknown SMS_BACKEND %r — falling back to noop", name)
        backend_cls = NoopSmsBackend
    return backend_cls()
