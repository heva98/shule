import datetime

from django.test import TestCase

from fees.models import AcademicYear

from .periods import (
    PeriodType, parse_period, resolve_periods, resolve_relative_period,
)

d = datetime.date


def _dated_year(year, is_current=True):
    """A year with all four quarters dated, holidays between them."""
    return AcademicYear.objects.create(
        year=year, is_current=is_current,
        q1_start=d(year, 1, 8), q1_end=d(year, 3, 27),
        q2_start=d(year, 4, 13), q2_end=d(year, 6, 5),
        q3_start=d(year, 7, 6), q3_end=d(year, 9, 25),
        q4_start=d(year, 10, 12), q4_end=d(year, 12, 4),
    )


class RelativePeriodTests(TestCase):
    def ids(self, code, today):
        return resolve_relative_period(code, today).ids

    def test_mid_year_in_term_two(self):
        _dated_year(2026)
        today = d(2026, 8, 10)  # inside Q3
        self.assertEqual(self.ids('THIS_TERM', today), ['2026T2'])
        self.assertEqual(self.ids('LAST_TERM', today), ['2026T1'])
        self.assertEqual(self.ids('LAST_3_TERMS', today), ['2025T1', '2025T2', '2026T1'])
        self.assertEqual(self.ids('THIS_ACADEMIC_YEAR', today), ['2026'])
        self.assertEqual(self.ids('LAST_ACADEMIC_YEAR', today), ['2025'])
        self.assertEqual(self.ids('THIS_MONTH', today), ['202608'])
        self.assertEqual(
            self.ids('LAST_12_MONTHS', today),
            ['202508', '202509', '202510', '202511', '202512', '202601',
             '202602', '202603', '202604', '202605', '202606', '202607'],
        )

    def test_term_one_steps_back_into_previous_year(self):
        _dated_year(2026)
        today = d(2026, 2, 2)
        self.assertEqual(self.ids('THIS_TERM', today), ['2026T1'])
        self.assertEqual(self.ids('LAST_TERM', today), ['2025T2'])
        self.assertEqual(self.ids('LAST_3_TERMS', today), ['2024T2', '2025T1', '2025T2'])

    def test_last_12_months_in_january(self):
        self.assertEqual(
            self.ids('LAST_12_MONTHS', d(2026, 1, 15)),
            [f'2025{m:02d}' for m in range(1, 13)],
        )

    def test_holiday_gap_belongs_to_the_term_just_finished(self):
        _dated_year(2026)
        # Between Q2 end (5 Jun) and Q3 start (6 Jul).
        res = resolve_relative_period('THIS_TERM', d(2026, 6, 20))
        self.assertEqual(res.ids, ['2026T1'])
        self.assertEqual(res.warnings, [])

    def test_before_the_year_starts_is_term_one(self):
        _dated_year(2026)
        self.assertEqual(self.ids('THIS_TERM', d(2026, 1, 3)), ['2026T1'])

    def test_current_year_comes_from_academic_year_not_calendar(self):
        # 2025 is still current in early January 2026, before the admin
        # switches years: "this year" is 2025 and "this term" is its last term.
        _dated_year(2025)
        today = d(2026, 1, 5)
        self.assertEqual(self.ids('THIS_ACADEMIC_YEAR', today), ['2025'])
        self.assertEqual(self.ids('THIS_TERM', today), ['2025T2'])
        self.assertEqual(self.ids('THIS_MONTH', today), ['202601'])

    def test_incomplete_quarter_dates_fall_back_to_calendar_with_warning(self):
        AcademicYear.objects.create(year=2026, is_current=True, q1_start=d(2026, 1, 8))
        res = resolve_relative_period('THIS_TERM', d(2026, 8, 10))
        self.assertEqual(res.ids, ['2026T2'])
        self.assertEqual(len(res.warnings), 1)
        self.assertIn('incomplete quarter dates', res.warnings[0])

    def test_no_current_year_falls_back_to_calendar_with_warning(self):
        _dated_year(2026, is_current=False)
        res = resolve_relative_period('THIS_ACADEMIC_YEAR', d(2027, 3, 1))
        self.assertEqual(res.ids, ['2027'])
        self.assertIn('No academic year is marked current', res.warnings[0])
        self.assertEqual(self.ids('LAST_TERM', d(2027, 3, 1)), ['2026T2'])

    def test_unknown_code_raises(self):
        with self.assertRaises(ValueError):
            resolve_relative_period('LAST_7_DAYS', d(2026, 1, 1))


class ResolvePeriodsTests(TestCase):
    def test_mixes_relative_and_fixed_ids_without_duplicates(self):
        _dated_year(2026)
        res = resolve_periods(['LAST_TERM', '2026T1', 'THIS_TERM', '2024'], d(2026, 8, 10))
        self.assertEqual(res.ids, ['2026T1', '2026T2', '2024'])

    def test_rejects_malformed_ids(self):
        for bad in ('2026T3', '2026Q5', '202613', '26', 'THIS_WEEK'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                resolve_periods([bad])


class ParsePeriodTests(TestCase):
    def test_parses_each_type(self):
        self.assertEqual(parse_period('2026').type, PeriodType.YEAR)
        term = parse_period('2026T2')
        self.assertEqual((term.type, term.year, term.term), (PeriodType.TERM, 2026, 'TERM2'))
        quarter = parse_period('2026Q2')
        self.assertEqual((quarter.term, quarter.quarter), ('TERM1', 'Q2'))
        month = parse_period('202609')
        self.assertEqual((month.type, month.year, month.month), (PeriodType.MONTH, 2026, 9))
