"""Uniform walk-in sales (requirement 4 / decision J-3, J-9).

A sale is its own ``Invoice(kind=SALE)`` with a single UNIFORM line carrying
itemised ``UniformSaleItem`` detail. It is deliberately *not* part of the
student's billed fees (excluded from the fee balance / reminders) but is real
revenue and reuses the normal payment / allocation / receipt machinery.
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    AcademicYear,
    FeeCategory,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    UniformSaleItem,
)


@transaction.atomic
def create_uniform_sale(student, items, *, academic_year=None, created_by=None,
                        notes='', sale_date=None) -> InvoiceLine:
    """``items``: iterable of ``{name, qty, unit_price}``. Returns the created
    UNIFORM :class:`InvoiceLine` (``line.amount`` == Σ qty × unit_price)."""
    academic_year = academic_year or AcademicYear.objects.filter(is_current=True).first()
    if academic_year is None:
        raise ValidationError('No current academic year is set.')
    sale_date = sale_date or timezone.localdate()

    total = Decimal('0')
    cleaned: list[tuple[str, int, Decimal]] = []
    for it in items:
        name = (it.get('name') or '').strip()
        qty = int(it.get('qty') or 0)
        unit_price = Decimal(str(it.get('unit_price') or 0))
        if not name:
            raise ValidationError('Every sale item needs a name.')
        if qty <= 0:
            raise ValidationError(f'{name}: quantity must be at least 1.')
        if unit_price < 0:
            raise ValidationError(f'{name}: price cannot be negative.')
        total += qty * unit_price
        cleaned.append((name, qty, unit_price))

    if not cleaned:
        raise ValidationError('A sale needs at least one item.')
    if total <= 0:
        raise ValidationError('The sale total must be greater than zero.')

    invoice = Invoice.objects.create(
        student=student, academic_year=academic_year, kind=InvoiceKind.SALE,
        due_date=sale_date, notes=notes,
    )
    line = InvoiceLine.objects.create(
        invoice=invoice, category=FeeCategory.UNIFORM, amount=total,
        description='Uniform sale', level_snapshot=student.level,
        source_kind='uniform_sale', is_sale=True, created_by=created_by,
    )
    UniformSaleItem.objects.bulk_create([
        UniformSaleItem(invoice_line=line, name=n, qty=q, unit_price=p)
        for (n, q, p) in cleaned
    ])
    return line
