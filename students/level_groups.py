"""Canonical mapping between individual class levels and the broad level
groups the school configures fees / subjects against.

Promoted here from ``exams.views`` so fees, students and exams share one
definition. ``exams.models.LevelGroup`` keeps its own identical TextChoices
for historical migration reasons; the values match on purpose.
"""

from django.db import models

from .models import Level


class LevelGroup(models.TextChoices):
    NURSERY = 'NURSERY', 'Nursery'
    PRIMARY = 'PRIMARY', 'Primary'
    OLEVEL = 'OLEVEL', 'O-Level'
    ALEVEL = 'ALEVEL', 'A-Level'


LEVELS_BY_GROUP: dict[str, tuple[str, ...]] = {
    LevelGroup.NURSERY: (Level.NURSERY_BABY, Level.NURSERY_MIDDLE, Level.NURSERY_SENIOR),
    LevelGroup.PRIMARY: (
        Level.STD1, Level.STD2, Level.STD3, Level.STD4,
        Level.STD5, Level.STD6, Level.STD7,
    ),
    LevelGroup.OLEVEL: (Level.FORM1, Level.FORM2, Level.FORM3, Level.FORM4),
    LevelGroup.ALEVEL: (Level.FORM5, Level.FORM6),
}

_GROUP_BY_LEVEL: dict[str, str] = {
    lvl: group for group, levels in LEVELS_BY_GROUP.items() for lvl in levels
}


def level_group(level: str) -> str | None:
    """The group a class level belongs to, or ``None`` if unknown."""
    return _GROUP_BY_LEVEL.get(level)


def levels_in_group(group: str) -> tuple[str, ...]:
    """Every class level in a group (empty tuple if the group is unknown)."""
    return LEVELS_BY_GROUP.get(group, ())
