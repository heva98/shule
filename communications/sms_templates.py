"""
SMS template rendering + the seeded defaults for the three use cases.

Rendering is deliberately strict: any placeholder that is missing from the
context, or whose value is None / empty, raises `MissingPlaceholder`. The
caller catches that and marks the recipient SKIPPED with a reason - a literal
"{placeholder}" or "None" is never delivered.
"""

import string

from .models import SmsLanguage, SmsTemplate, SmsTemplateKey

_formatter = string.Formatter()


class MissingPlaceholder(Exception):
    def __init__(self, name: str):
        self.name = name
        super().__init__(f"missing value for {{{name}}}")


class TemplateSyntaxError(Exception):
    pass


def placeholders(body: str) -> list[str]:
    try:
        return [name for _, name, _, _ in _formatter.parse(body) if name]
    except ValueError as exc:  # unbalanced braces, etc.
        raise TemplateSyntaxError(str(exc)) from exc


def render(body: str, context: dict) -> str:
    try:
        parts = list(_formatter.parse(body))
    except ValueError as exc:
        raise TemplateSyntaxError(str(exc)) from exc

    out: list[str] = []
    for literal, field_name, format_spec, _conversion in parts:
        out.append(literal)
        if field_name is None:
            continue
        if field_name not in context:
            raise MissingPlaceholder(field_name)
        value = context[field_name]
        if value is None or (isinstance(value, str) and not value.strip()):
            raise MissingPlaceholder(field_name)
        try:
            out.append(format(value, format_spec or ""))
        except (ValueError, TypeError):
            out.append(str(value))
    return "".join(out)


def get_active_template(key: str, language: str) -> SmsTemplate | None:
    return SmsTemplate.objects.filter(key=key, language=language, is_active=True).first()


# ── Seeded defaults ─────────────────────────────────────────────────────────
# Keyed by (template key, language). `seed_sms_templates` upserts these; staff
# edit the rows afterwards. Keep every {placeholder} here in sync with the
# context each resolver builds in sms_service.py.

DEFAULT_TEMPLATES: dict[tuple[str, str], str] = {
    (SmsTemplateKey.EXAM_RESULTS, SmsLanguage.EN): (
        "{school_name}: Parent/Guardian of {pupil_name} ({class}) - {exam_name}: "
        "{total}/{out_of}, avg {average}%, grade {grade}, position {position}/{class_size}. "
        "Please come to the school to collect the full report card."
    ),
    (SmsTemplateKey.EXAM_RESULTS, SmsLanguage.SW): (
        "{school_name}: Mzazi/Mlezi wa {pupil_name} ({class}) - {exam_name}: "
        "{total}/{out_of}, wastani {average}%, daraja {grade}, nafasi {position}/{class_size}. "
        "Tafadhali fika shuleni kuchukua taarifa kamili ya matokeo."
    ),

    (SmsTemplateKey.FEE_REMINDER_DUE, SmsLanguage.EN): (
        "{school_name}: Dear Parent/Guardian, {student_name} has a pending fee balance "
        "of TZS {balance} ({breakdown}). Kindly plan to clear it by {due_date}. "
        "For assistance, call {school_contact}."
    ),
    (SmsTemplateKey.FEE_REMINDER_DUE, SmsLanguage.SW): (
        "{school_name}: Mzazi/Mlezi, {student_name} ana salio la ada la TZS {balance} ({breakdown}). "
        "Tafadhali panga kulipa salio hilo ifikapo {due_date}. Kwa msaada, piga {school_contact}."
    ),

    (SmsTemplateKey.FEE_REMINDER_OVERDUE, SmsLanguage.EN): (
        "{school_name}: Dear Parent/Guardian, {student_name} has an outstanding fee balance "
        "of TZS {balance} ({breakdown}), which is past due. Kindly clear the balance as soon "
        "as possible. For assistance, call {school_contact}."
    ),
    (SmsTemplateKey.FEE_REMINDER_OVERDUE, SmsLanguage.SW): (
        "{school_name}: Mzazi/Mlezi, {student_name} ana salio la ada la TZS {balance} ({breakdown}) "
        "ambalo muda wake wa malipo umepita. Tafadhali lipia salio hilo haraka iwezekanavyo. "
        "Kwa msaada, piga {school_contact}."
    ),

    (SmsTemplateKey.PAYMENT_RECEIVED, SmsLanguage.EN): (
        "{school_name}: Payment of TZS {amount} received for {pupil_name} on {payment_date}. "
        "Receipt {receipt_number}. Paid: {breakdown}. Outstanding balance: TZS {outstanding_balance}. "
        "Thank you."
    ),
    (SmsTemplateKey.PAYMENT_RECEIVED, SmsLanguage.SW): (
        "{school_name}: Tumepokea malipo ya TZS {amount} kwa {pupil_name} tarehe {payment_date}. "
        "Risiti {receipt_number}. Malipo: {breakdown}. Salio lililobaki: TZS {outstanding_balance}. "
        "Asante."
    ),

    (SmsTemplateKey.ANNOUNCEMENT, SmsLanguage.EN): "{school_name}: {message}",
    (SmsTemplateKey.ANNOUNCEMENT, SmsLanguage.SW): "{school_name}: {message}",

    (SmsTemplateKey.TERM_CLOSING, SmsLanguage.EN): (
        "{school_name}: School closes for the {term} break on {closing_date} and reopens "
        "on {opening_date}. Safe holidays."
    ),
    (SmsTemplateKey.TERM_CLOSING, SmsLanguage.SW): (
        "{school_name}: Shule itafungwa kwa likizo ya {term} tarehe {closing_date} na "
        "kufunguliwa tena tarehe {opening_date}. Likizo njema."
    ),

    (SmsTemplateKey.TERM_OPENING, SmsLanguage.EN): (
        "{school_name}: Reminder - school reopens on {opening_date} for {term}. Please ensure "
        "{pupil_name} returns on time with all requirements."
    ),
    (SmsTemplateKey.TERM_OPENING, SmsLanguage.SW): (
        "{school_name}: Kumbukumbu - shule inafunguliwa tarehe {opening_date} kwa {term}. "
        "Tafadhali hakikisha {pupil_name} anarudi kwa wakati na mahitaji yote."
    ),
}
