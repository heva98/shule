"""Best-effort conversion of the retired FeeStructure templates into the
Phase-2 configuration models before FeeStructure is dropped (0009).

FeeStructure was per (year, level, term, quarter) with five flat amounts.
The new models have different granularity, so this is deliberately conservative
and lossy in two places, both noted below:

  * tuition / uniform -> summed across a level's quarters into one ANNUAL plan
  * lunch  -> one LunchFeeConfig per period; there was no day/boarding split,
              so day_amount == boarding_amount (adjust afterwards)
  * activity -> one ActivityFeePlan per (period, level)
  * transport -> CANNOT be mapped (no route concept); skipped. Reconfigure
              transport via routes + RouteFee.

Idempotent: skips a target that already has an active row. Reverse: no-op.
"""

from collections import defaultdict
from decimal import Decimal

from django.db import migrations


def forwards(apps, schema_editor):
    FeeStructure = apps.get_model('fees', 'FeeStructure')
    TuitionFeePlan = apps.get_model('fees', 'TuitionFeePlan')
    UniformFeePlan = apps.get_model('fees', 'UniformFeePlan')
    LunchFeeConfig = apps.get_model('fees', 'LunchFeeConfig')
    ActivityFeePlan = apps.get_model('fees', 'ActivityFeePlan')

    tuition = defaultdict(Decimal)   # (year_id, level) -> sum
    uniform = defaultdict(Decimal)   # (year_id, level) -> sum
    lunch = {}                       # (year_id, term, quarter) -> max
    activity = {}                    # (year_id, term, quarter, level) -> value

    for fs in FeeStructure.objects.all():
        y = fs.academic_year_id
        if fs.tuition_fee:
            tuition[(y, fs.level)] += fs.tuition_fee
        if fs.uniform_fee:
            uniform[(y, fs.level)] += fs.uniform_fee
        if fs.lunch_fee:
            k = (y, fs.term, fs.quarter)
            lunch[k] = max(lunch.get(k, Decimal('0')), fs.lunch_fee)
        if fs.activity_fee:
            activity[(y, fs.term, fs.quarter, fs.level)] = fs.activity_fee

    for (y, level), amount in tuition.items():
        if not TuitionFeePlan.objects.filter(
            academic_year_id=y, scope='LEVEL', level=level, is_active=True
        ).exists():
            TuitionFeePlan.objects.create(
                academic_year_id=y, scope='LEVEL', level=level,
                level_group='', amount=amount, is_active=True,
            )

    for (y, level), amount in uniform.items():
        if not UniformFeePlan.objects.filter(
            academic_year_id=y, level=level, is_active=True
        ).exists():
            UniformFeePlan.objects.create(
                academic_year_id=y, level=level, amount=amount, is_active=True,
            )

    for (y, term, quarter), amount in lunch.items():
        if not LunchFeeConfig.objects.filter(
            academic_year_id=y, term=term, quarter=quarter
        ).exists():
            LunchFeeConfig.objects.create(
                academic_year_id=y, term=term, quarter=quarter,
                day_amount=amount, boarding_amount=amount, is_active=True,
            )

    for (y, term, quarter, level), amount in activity.items():
        if not ActivityFeePlan.objects.filter(
            academic_year_id=y, term=term, quarter=quarter, level=level, is_active=True
        ).exists():
            ActivityFeePlan.objects.create(
                academic_year_id=y, term=term, quarter=quarter, level=level,
                amount=amount, is_active=True,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0007_fee_config_models'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
