from django.core.exceptions import ValidationError

# Maps each quarter to its parent term
TERM_QUARTER_MAP = {
    'Q1': 'TERM1',
    'Q2': 'TERM1',
    'Q3': 'TERM2',
    'Q4': 'TERM2',
}


def get_quarter_choices_for_term(term):
    """Return the valid (value, label) quarter choices for a given term."""
    if term == 'TERM1':
        return [('Q1', 'Quarter 1'), ('Q2', 'Quarter 2')]
    if term == 'TERM2':
        return [('Q3', 'Quarter 3'), ('Q4', 'Quarter 4')]
    return []


def validate_term_quarter(term, quarter):
    """Raise ValidationError if quarter does not belong to term."""
    if TERM_QUARTER_MAP.get(quarter) != term:
        raise ValidationError(
            f"{quarter} does not belong to {term}. "
            f"Term 1 → Q1/Q2, Term 2 → Q3/Q4."
        )
