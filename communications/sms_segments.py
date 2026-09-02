"""
GSM-03.38 segment counting and cost estimation.

Swahili and English school messages are plain Latin text, so they encode as
GSM-7 (160 chars / single, 153 / part). Anything outside the GSM-7 alphabet
forces the whole message to UCS-2 (70 / 67). Staff see the resulting segment
count — and, when SMS_PRICE_PER_SEGMENT is set, a shilling estimate — before
they confirm a send.
"""

import math
from decimal import Decimal, InvalidOperation

from django.conf import settings

_GSM7_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXTENSION = set("^{}\\[~]|€")

_SINGLE_GSM7, _MULTI_GSM7 = 160, 153
_SINGLE_UCS2, _MULTI_UCS2 = 70, 67


def is_gsm7(text: str) -> bool:
    return all(ch in _GSM7_BASIC or ch in _GSM7_EXTENSION for ch in text)


def encoded_length(text: str) -> int:
    """Length in GSM-7 septets if representable, else UCS-2 code units."""
    if is_gsm7(text):
        return sum(2 if ch in _GSM7_EXTENSION else 1 for ch in text)
    return len(text)


def count_segments(text: str) -> int:
    if text is None:
        return 0
    gsm7 = is_gsm7(text)
    length = encoded_length(text)
    single = _SINGLE_GSM7 if gsm7 else _SINGLE_UCS2
    multi = _MULTI_GSM7 if gsm7 else _MULTI_UCS2
    if length == 0:
        return 1
    if length <= single:
        return 1
    return math.ceil(length / multi)


def price_per_segment() -> Decimal:
    try:
        return Decimal(str(settings.SMS_PRICE_PER_SEGMENT or "0"))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def estimate_cost(text: str, recipients: int = 1) -> Decimal:
    return price_per_segment() * count_segments(text) * recipients


def segment_summary(text: str, recipients: int = 1) -> dict:
    segs = count_segments(text)
    unit = price_per_segment()
    return {
        "encoding": "GSM-7" if is_gsm7(text) else "UCS-2",
        "length": encoded_length(text),
        "segments": segs,
        "recipients": recipients,
        "total_segments": segs * recipients,
        "price_per_segment": str(unit),
        "estimated_cost": str(unit * segs * recipients),
        "has_cost_estimate": unit > 0,
    }
