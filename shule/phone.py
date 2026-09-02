"""
Tanzanian phone-number normalisation to E.164 (+255XXXXXXXXX).

Kept in the project package (not an app) so any app — students, communications,
accounts — can import it without creating an app-to-app dependency.

`normalize_tz_phone` is deliberately forgiving about input punctuation and the
common local ways of writing a number, but strict about the result: it only
returns a value that matches a real Tanzanian MSISDN, otherwise it returns
None so the caller can decide what to do (skip the recipient, report the row,
leave the raw value untouched) rather than sending to a bad number.
"""

import re

# Tanzania: country code 255, then a 9-digit national number whose first digit
# for mobile is 6 or 7 (e.g. 0713..., 0655...). Landlines start 2X — we accept
# any 9-digit national number here and let mobile-only checks live at call sites
# that actually need them (SMS sending uses is_mobile()).
_E164_RE = re.compile(r"^\+255\d{9}$")
_MOBILE_RE = re.compile(r"^\+255[67]\d{8}$")


def normalize_tz_phone(raw: str | None) -> str | None:
    """
    Return the number in +255XXXXXXXXX form, or None if it cannot be parsed
    into a plausible Tanzanian number.

    Accepts, ignoring spaces / dashes / dots / parentheses / a leading 'tel:':
      0713123123        -> +255713123123
      255713123123      -> +255713123123
      +255 713 123 123  -> +255713123123
      713123123         -> +255713123123   (bare 9-digit national number)
      00255713123123    -> +255713123123   (international 00 prefix)
    """
    if not raw:
        return None

    v = str(raw).strip().lower()
    if v.startswith("tel:"):
        v = v[4:]
    v = re.sub(r"[\s().\-]", "", v)

    if v.startswith("00"):
        v = "+" + v[2:]

    if v.startswith("+"):
        digits = v[1:]
    elif v.startswith("255"):
        digits = v
    elif v.startswith("0") and len(v) == 10:
        digits = "255" + v[1:]
    elif len(v) == 9:
        digits = "255" + v
    else:
        digits = v

    if not digits.isdigit():
        return None

    candidate = "+" + digits
    if _E164_RE.match(candidate):
        return candidate
    return None


def is_valid_tz_phone(value: str | None) -> bool:
    return bool(value) and bool(_E164_RE.match(value))


def is_tz_mobile(value: str | None) -> bool:
    """True only for a normalised +255 mobile number (SMS-deliverable)."""
    return bool(value) and bool(_MOBILE_RE.match(value))
