"""
Refresh the fee-reminder SMS bodies (DUE + OVERDUE, both languages) to the
wording agreed with the school. Existing deployments seeded the old text via
0004, so update those rows in place. Reversible to the previous shipped text.
"""

from django.db import migrations

NEW = {
    ("FEE_REMINDER_DUE", "EN"): (
        "{school_name}: Dear Parent/Guardian, {student_name} has a pending fee balance "
        "of TZS {balance}. Kindly plan to clear it by {due_date}. For assistance, call {school_contact}."
    ),
    ("FEE_REMINDER_DUE", "SW"): (
        "{school_name}: Mzazi/Mlezi, {student_name} ana salio la ada la TZS {balance}. "
        "Tafadhali panga kulipa salio hilo ifikapo {due_date}. Kwa msaada, piga {school_contact}."
    ),
    ("FEE_REMINDER_OVERDUE", "EN"): (
        "{school_name}: Dear Parent/Guardian, {student_name} has an outstanding fee balance "
        "of TZS {balance}, which is past due. Kindly clear the balance as soon as possible. "
        "For assistance, call {school_contact}."
    ),
    ("FEE_REMINDER_OVERDUE", "SW"): (
        "{school_name}: Mzazi/Mlezi, {student_name} ana salio la ada la TZS {balance} ambalo "
        "muda wake wa malipo umepita. Tafadhali lipia salio hilo haraka iwezekanavyo. "
        "Kwa msaada, piga {school_contact}."
    ),
}

OLD = {
    ("FEE_REMINDER_DUE", "EN"): (
        "{school_name}: Parent/Guardian of {pupil_name} ({class}) - fees balance "
        "TZS {balance} for {term}, due {due_date}. Kindly clear to avoid inconvenience. Asante."
    ),
    ("FEE_REMINDER_DUE", "SW"): (
        "{school_name}: Mzazi/Mlezi wa {pupil_name} ({class}) - salio la ada "
        "TZS {balance} kwa {term}, linalotakiwa {due_date}. Tafadhali kamilisha malipo. Asante."
    ),
    ("FEE_REMINDER_OVERDUE", "EN"): (
        "{school_name}: Parent/Guardian of {pupil_name} ({class}) - fees TZS {balance} "
        "for {term} is OVERDUE (was due {due_date}). Please pay immediately. Asante."
    ),
    ("FEE_REMINDER_OVERDUE", "SW"): (
        "{school_name}: Mzazi/Mlezi wa {pupil_name} ({class}) - ada TZS {balance} "
        "kwa {term} IMEPITWA NA MUDA (ilitakiwa {due_date}). Tafadhali lipa mara moja. Asante."
    ),
}


def _apply(apps, bodies):
    SmsTemplate = apps.get_model("communications", "SmsTemplate")
    for (key, language), body in bodies.items():
        SmsTemplate.objects.update_or_create(
            key=key, language=language,
            defaults={"body": body, "is_active": True},
        )


def forwards(apps, schema_editor):
    _apply(apps, NEW)


def backwards(apps, schema_editor):
    _apply(apps, OLD)


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0005_alter_smsbatch_sender_id_alter_smsmessage_sender_id"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
