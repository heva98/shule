"""
Period ids and the relative-period resolver (ANALYTICS_PLAN.md §3).

Concrete period ids, DHIS2 style:

    YEAR     2026        academic year (Jan–Dec here)
    TERM     2026T1      TERM1 / TERM2
    QUARTER  2026Q3      Q1–Q4 (Q1,Q2 → T1; Q3,Q4 → T2)
    MONTH    202609      calendar month; date-grained facts only

Relative periods resolve to a list of those ids against "today" in the
school's timezone and the current `AcademicYear`. As in DHIS2, `LAST_N_*`
means the N whole periods *before* the current one; the current one is
`THIS_*`. Ids are returned oldest first.

Resolving never raises for missing configuration: when there is no current
year or its quarter dates are incomplete, it falls back to the calendar and
says so in `warnings` (§P2), so the UI can show why.
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field

from django.utils import timezone

from fees.models import AcademicYear
from shule.utils import TERM_QUARTER_MAP


class PeriodType:
    YEAR = 'YEAR'
    TERM = 'TERM'
    QUARTER = 'QUARTER'
    MONTH = 'MONTH'


PERIOD_TYPES = [
    (PeriodType.YEAR, 'Academic year'),
    (PeriodType.TERM, 'Term'),
    (PeriodType.QUARTER, 'Quarter'),
    (PeriodType.MONTH, 'Month'),
]

RELATIVE_PERIODS = [
    # (code, label, period type of the ids it resolves to)
    ('THIS_TERM', 'This term', PeriodType.TERM),
    ('LAST_TERM', 'Last term', PeriodType.TERM),
    ('LAST_3_TERMS', 'Last 3 terms', PeriodType.TERM),
    ('THIS_ACADEMIC_YEAR', 'This academic year', PeriodType.YEAR),
    ('LAST_ACADEMIC_YEAR', 'Last academic year', PeriodType.YEAR),
    ('THIS_MONTH', 'This month', PeriodType.MONTH),
    ('LAST_12_MONTHS', 'Last 12 months', PeriodType.MONTH),
]
RELATIVE_PERIOD_CODES = frozenset(code for code, _, _ in RELATIVE_PERIODS)

_PERIOD_RE = re.compile(
    r'^(?:(?P<year>\d{4})'
    r'|(?P<t_year>\d{4})T(?P<term>[12])'
    r'|(?P<q_year>\d{4})Q(?P<quarter>[1-4])'
    r'|(?P<m_year>\d{4})(?P<month>0[1-9]|1[0-2]))$'
)


@dataclass(frozen=True)
class Period:
    id: str
    type: str
    year: int
    term: str | None = None      # 'TERM1' / 'TERM2'
    quarter: str | None = None   # 'Q1'..'Q4'
    month: int | None = None


def parse_period(period_id: str) -> Period:
    """Parse a concrete period id. Raises ValueError if it isn't one."""
    m = _PERIOD_RE.match(period_id or '')
    if not m:
        raise ValueError(f'Unknown period id: {period_id!r}')
    if m['year']:
        return Period(period_id, PeriodType.YEAR, int(m['year']))
    if m['t_year']:
        return Period(period_id, PeriodType.TERM, int(m['t_year']), term=f'TERM{m["term"]}')
    if m['q_year']:
        quarter = f'Q{m["quarter"]}'
        return Period(
            period_id, PeriodType.QUARTER, int(m['q_year']),
            term=TERM_QUARTER_MAP[quarter], quarter=quarter,
        )
    return Period(period_id, PeriodType.MONTH, int(m['m_year']), month=int(m['month']))


def year_id(year: int) -> str:
    return str(year)


def term_id(year: int, term_no: int) -> str:
    return f'{year}T{term_no}'


def month_id(year: int, month: int) -> str:
    return f'{year}{month:02d}'


@dataclass
class Resolution:
    ids: list[str]
    warnings: list[str] = field(default_factory=list)


# ── "now" in academic terms ────────────────────────────────────────────────

def _quarter_dates(ay: AcademicYear, n: int):
    return getattr(ay, f'q{n}_start'), getattr(ay, f'q{n}_end')


def current_quarter(ay: AcademicYear, today: datetime.date) -> tuple[int, str | None]:
    """The quarter number (1–4) of `ay` that `today` belongs to, plus a
    warning when it had to be guessed from the calendar.

    With all four quarters dated, a date inside a quarter gives that quarter;
    a date in a holiday gap gives the last quarter that has started (Q1 before
    the year begins). Without complete dates, the calendar quarter is used,
    clamped to Q1/Q4 when today lies outside the academic year.
    """
    dates = [_quarter_dates(ay, n) for n in range(1, 5)]
    if all(start and end for start, end in dates):
        started = [n for n, (start, _) in enumerate(dates, 1) if start <= today]
        return (started[-1] if started else 1), None

    if today.year < ay.year:
        n = 1
    elif today.year > ay.year:
        n = 4
    else:
        n = (today.month - 1) // 3 + 1
    return n, (
        f'Academic year {ay.year} has incomplete quarter dates; '
        f'the current term was taken from the calendar.'
    )


def _current_year(today: datetime.date, warnings: list[str]) -> AcademicYear | None:
    ay = AcademicYear.objects.filter(is_current=True).first()
    if ay is None:
        warnings.append(
            f'No academic year is marked current; using calendar year {today.year}.'
        )
    return ay


def _current_term_ordinal(today: datetime.date, warnings: list[str]) -> int:
    """year * 2 + (term − 1), so terms can be stepped back across years."""
    ay = _current_year(today, warnings)
    if ay is None:
        year, quarter_no = today.year, (today.month - 1) // 3 + 1
    else:
        year = ay.year
        quarter_no, warning = current_quarter(ay, today)
        if warning:
            warnings.append(warning)
    term_no = 1 if quarter_no <= 2 else 2
    return year * 2 + (term_no - 1)


def _term_ids(last_ordinal: int, count: int) -> list[str]:
    return [
        term_id(o // 2, o % 2 + 1)
        for o in range(last_ordinal - count + 1, last_ordinal + 1)
    ]


def _month_ids(last_ordinal: int, count: int) -> list[str]:
    return [
        month_id(o // 12, o % 12 + 1)
        for o in range(last_ordinal - count + 1, last_ordinal + 1)
    ]


# ── public API ─────────────────────────────────────────────────────────────

def resolve_relative_period(code: str, today: datetime.date | None = None) -> Resolution:
    """Resolve one relative period code to concrete period ids."""
    if code not in RELATIVE_PERIOD_CODES:
        raise ValueError(f'Unknown relative period: {code!r}')
    today = today or timezone.localdate()
    warnings: list[str] = []

    if code in ('THIS_MONTH', 'LAST_12_MONTHS'):
        this_month = today.year * 12 + (today.month - 1)
        if code == 'THIS_MONTH':
            return Resolution(_month_ids(this_month, 1))
        return Resolution(_month_ids(this_month - 1, 12))

    if code in ('THIS_ACADEMIC_YEAR', 'LAST_ACADEMIC_YEAR'):
        ay = _current_year(today, warnings)
        year = ay.year if ay else today.year
        if code == 'LAST_ACADEMIC_YEAR':
            year -= 1
        return Resolution([year_id(year)], warnings)

    this_term = _current_term_ordinal(today, warnings)
    if code == 'THIS_TERM':
        ids = _term_ids(this_term, 1)
    elif code == 'LAST_TERM':
        ids = _term_ids(this_term - 1, 1)
    else:  # LAST_3_TERMS
        ids = _term_ids(this_term - 1, 3)
    return Resolution(ids, warnings)


def resolve_periods(items, today: datetime.date | None = None) -> Resolution:
    """Expand a mix of relative codes and concrete ids into concrete ids,
    de-duplicated in first-seen order. Raises ValueError on an unknown item."""
    ids: list[str] = []
    warnings: list[str] = []
    for item in items:
        if item in RELATIVE_PERIOD_CODES:
            res = resolve_relative_period(item, today)
            new_ids, new_warnings = res.ids, res.warnings
        else:
            new_ids, new_warnings = [parse_period(item).id], []
        ids.extend(i for i in new_ids if i not in ids)
        warnings.extend(w for w in new_warnings if w not in warnings)
    return Resolution(ids, warnings)
