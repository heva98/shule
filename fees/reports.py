"""Fee reporting queries (requirement 20). Category is preserved on every
charge and allocation, so all of these are straight aggregates.

Conventions:
  * ``academic_year`` is an AcademicYear pk.
  * ``term`` narrows to that term's QUARTERLY charges — annual tuition is
    excluded when a term is given (it does not belong to a term), which is how
    "money for term X" avoids mixing periods.
  * ``level`` matches ``InvoiceLine.level_snapshot`` so class figures stay
    correct after a student transfers.
  * "collected" counts ACTIVE payment allocations and excludes CARRIED_CREDIT
    (that cash was counted when first received); credit applied is reported
    separately. Uniform SALE revenue IS included.
"""

from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce, Greatest, TruncMonth

from students.models import Level

from .models import (
    FeeAdjustment,
    FeeCategory,
    InvoiceKind,
    InvoiceLine,
    LineStatus,
    PaymentAllocation,
    PaymentMethod,
    PaymentStatus,
)

_DEC = DecimalField(max_digits=14, decimal_places=2)
_ZERO = Value(Decimal('0'), output_field=_DEC)

_LEVEL_LABEL = dict(Level.choices)
_CATEGORY_LABEL = dict(FeeCategory.choices)
_METHOD_LABEL = dict(PaymentMethod.choices)

FEE_KINDS = [InvoiceKind.ANNUAL, InvoiceKind.QUARTERLY]

_COLLECT_GROUP = {
    'category': 'invoice_line__category',
    'class': 'invoice_line__level_snapshot',
    'level': 'invoice_line__level_snapshot',
    'method': 'payment__payment_method',
}
_LINE_GROUP = {
    'category': 'category',
    'class': 'level_snapshot',
    'level': 'level_snapshot',
}


def _label_for(group_by: str, key):
    if group_by == 'category':
        return _CATEGORY_LABEL.get(key, key)
    if group_by == 'method':
        return _METHOD_LABEL.get(key, key)
    if group_by in ('class', 'level'):
        return _LEVEL_LABEL.get(key, key or '—')
    return str(key)


# ── collections ────────────────────────────────────────────────────────────

def collections(*, academic_year=None, term=None, quarter=None, level=None,
                group_by='category') -> dict:
    qs = PaymentAllocation.objects.filter(payment__status=PaymentStatus.ACTIVE)
    if academic_year:
        qs = qs.filter(invoice_line__invoice__academic_year_id=academic_year)
    if term:
        qs = qs.filter(invoice_line__invoice__term=term)
    if quarter:
        qs = qs.filter(invoice_line__invoice__quarter=quarter)
    if level:
        qs = qs.filter(invoice_line__level_snapshot=level)

    cash = qs.exclude(payment__payment_method=PaymentMethod.CARRIED_CREDIT)
    credit_applied = (
        qs.filter(payment__payment_method=PaymentMethod.CARRIED_CREDIT)
        .aggregate(t=Sum('amount'))['t'] or Decimal('0')
    )

    if group_by == 'month':
        rows_qs = (
            cash.annotate(m=TruncMonth('payment__paid_at'))
            .values('m').annotate(collected=Sum('amount')).order_by('m')
        )
        rows = [
            {'key': r['m'].date().isoformat() if r['m'] else None,
             'label': r['m'].strftime('%b %Y') if r['m'] else '—',
             'collected': str(r['collected'] or 0)}
            for r in rows_qs
        ]
    else:
        field = _COLLECT_GROUP.get(group_by, 'invoice_line__category')
        rows_qs = cash.values(field).annotate(collected=Sum('amount')).order_by(field)
        rows = [
            {'key': r[field], 'label': _label_for(group_by, r[field]),
             'collected': str(r['collected'] or 0)}
            for r in rows_qs
        ]

    total = cash.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    return {
        'group_by': group_by,
        'rows': rows,
        'total_collected': str(total),
        'credit_applied': str(credit_applied),
    }


# ── outstanding ────────────────────────────────────────────────────────────

def _outstanding_lines(*, academic_year=None, term=None, level=None):
    adj = (
        FeeAdjustment.objects
        .filter(invoice_line=OuterRef('pk'))
        .values('invoice_line')
        .annotate(s=Sum('amount'))
        .values('s')
    )
    qs = (
        InvoiceLine.objects
        .filter(invoice__kind__in=FEE_KINDS)
        .exclude(status=LineStatus.VOID)
        .annotate(adj=Coalesce(Subquery(adj, output_field=_DEC), _ZERO))
        .annotate(
            required=Greatest(F('amount') - F('adj'), _ZERO, output_field=_DEC),
        )
        .annotate(
            unpaid=Greatest(F('required') - F('amount_allocated'), _ZERO, output_field=_DEC),
        )
    )
    if academic_year:
        qs = qs.filter(invoice__academic_year_id=academic_year)
    if term:
        qs = qs.filter(invoice__term=term)
    if level:
        qs = qs.filter(level_snapshot=level)
    return qs


def outstanding(*, academic_year=None, term=None, level=None, group_by='category') -> dict:
    lines = _outstanding_lines(academic_year=academic_year, term=term, level=level)
    field = _LINE_GROUP.get(group_by, 'category')
    rows_qs = (
        lines.values(field)
        .annotate(required=Sum('required'), paid=Sum('amount_allocated'),
                  outstanding=Sum('unpaid'))
        .order_by(field)
    )
    rows = [
        {'key': r[field], 'label': _label_for(group_by, r[field]),
         'required': str(r['required'] or 0), 'paid': str(r['paid'] or 0),
         'outstanding': str(r['outstanding'] or 0)}
        for r in rows_qs
    ]
    agg = lines.aggregate(
        required=Sum('required'), paid=Sum('amount_allocated'), outstanding=Sum('unpaid')
    )
    return {
        'group_by': group_by,
        'rows': rows,
        'totals': {
            'required': str(agg['required'] or 0),
            'paid': str(agg['paid'] or 0),
            'outstanding': str(agg['outstanding'] or 0),
        },
    }


def unpaid_students(*, category, academic_year=None, term=None, level=None):
    lines = (
        _outstanding_lines(academic_year=academic_year, term=term, level=level)
        .filter(category=category, unpaid__gt=0)
        .select_related('invoice__student')
    )
    per_student: dict[int, dict] = {}
    for ln in lines:
        s = ln.invoice.student
        row = per_student.setdefault(s.pk, {
            'student': s.pk, 'student_id': s.student_id, 'student_name': s.full_name,
            'level': s.level, 'level_label': _LEVEL_LABEL.get(s.level, s.level),
            'required': Decimal('0'), 'paid': Decimal('0'), 'outstanding': Decimal('0'),
        })
        row['required'] += ln.required
        row['paid'] += ln.amount_allocated
        row['outstanding'] += ln.unpaid

    out = sorted(per_student.values(), key=lambda r: -r['outstanding'])
    for r in out:
        r['required'] = str(r['required'])
        r['paid'] = str(r['paid'])
        r['outstanding'] = str(r['outstanding'])
    return out


# ── overview (per-category required / collected / outstanding) ──────────────

def overview(*, academic_year=None, term=None, level=None) -> dict:
    coll = collections(academic_year=academic_year, term=term, level=level,
                       group_by='category')
    outs = outstanding(academic_year=academic_year, term=term, level=level,
                       group_by='category')

    collected_by_cat = {r['key']: Decimal(r['collected']) for r in coll['rows']}
    out_by_cat = {r['key']: r for r in outs['rows']}

    cats = []
    seen = set()
    order = [FeeCategory.TUITION, FeeCategory.TRANSPORT, FeeCategory.LUNCH,
             FeeCategory.UNIFORM, FeeCategory.ACTIVITY, FeeCategory.OTHER]
    for cat in order:
        if cat not in collected_by_cat and cat not in out_by_cat:
            continue
        seen.add(cat)
        o = out_by_cat.get(cat, {})
        cats.append({
            'category': cat,
            'category_display': _CATEGORY_LABEL[cat],
            'required': o.get('required', '0'),
            'collected': str(collected_by_cat.get(cat, Decimal('0'))),
            'outstanding': o.get('outstanding', '0'),
        })

    required = Decimal(outs['totals']['required'])
    collected = Decimal(coll['total_collected'])
    rate = (collected / required * 100) if required > 0 else Decimal('0')
    return {
        'by_category': cats,
        'totals': {
            'required': outs['totals']['required'],
            'collected': coll['total_collected'],
            'outstanding': outs['totals']['outstanding'],
            'credit_applied': coll['credit_applied'],
            'collection_rate_percent': str(round(rate, 1)),
        },
    }
