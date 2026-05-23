from decimal import Decimal


def get_grade(score):
    """Tanzania standard grading scale."""
    score = Decimal(str(score))
    if score >= 75:
        return 'A'
    if score >= 60:
        return 'B'
    if score >= 45:
        return 'C'
    if score >= 30:
        return 'D'
    return 'F'


# Points used for Form 4 / O-Level division calculation
_GRADE_POINTS = {'A': 1, 'B': 2, 'C': 3, 'D': 4, 'F': 5}


def get_form4_division(mark_entries):
    """
    Tanzania O-Level division based on best 7 subjects.
    Division I: 7-14, II: 15-21, III: 22-25, IV: 26-33, 0: 34+
    Returns (division_label, total_points, sorted_entries_used).
    """
    sorted_entries = sorted(
        mark_entries,
        key=lambda e: _GRADE_POINTS.get(e.grade, 5),
    )
    best_seven = sorted_entries[:7]
    total = sum(_GRADE_POINTS.get(e.grade, 5) for e in best_seven)

    if total <= 14:
        division = 'I'
    elif total <= 21:
        division = 'II'
    elif total <= 25:
        division = 'III'
    elif total <= 33:
        division = 'IV'
    else:
        division = '0'

    return division, total, best_seven


def _score_to_psle_points(score):
    """
    Convert a raw score (0-100) to PSLE points (0-10 scale).
    Scale: each 10-point band = 1 point, 90-100 → 10.
    """
    score = Decimal(str(score))
    if score >= 90:
        return 10
    if score >= 80:
        return 9
    if score >= 70:
        return 8
    if score >= 60:
        return 7
    if score >= 50:
        return 6
    if score >= 40:
        return 5
    if score >= 30:
        return 4
    if score >= 20:
        return 3
    if score >= 10:
        return 2
    return 1


def get_psle_aggregate(mark_entries):
    """
    Tanzania PSLE aggregate: sum of best 5 subjects on the 1-10 scale.
    Lower is better (same convention as O-Level).
    Returns (aggregate, sorted_entries_used).
    """
    scored = sorted(
        mark_entries,
        key=lambda e: _score_to_psle_points(e.score),
    )
    best_five = scored[:5]
    aggregate = sum(_score_to_psle_points(e.score) for e in best_five)
    return aggregate, best_five
