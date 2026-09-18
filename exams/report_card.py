"""Pupil/student academic report card — context building and PDF rendering.

Grading here is a report-card-specific 5-band key (A-E), independent of
exams.utils.get_grade's Tanzania A/B/C/D/F scale used elsewhere (mark entry,
O-Level division, PSLE aggregate). The report card prints its own key.
"""
from collections import defaultdict
from decimal import Decimal
from io import BytesIO

from django.conf import settings
from django.template.loader import render_to_string
from xhtml2pdf import pisa

from .models import Exam, MarkEntry, ReportCardRemark, StudentSkillAssessment

MINISTRY_LINE = 'MINISTRY OF EDUCATION, SCIENCE AND TECHNOLOGY'

REPORT_GRADE_BANDS = [
    {'grade': 'A', 'low': 81, 'high': 100},
    {'grade': 'B', 'low': 61, 'high': 80},
    {'grade': 'C', 'low': 41, 'high': 60},
    {'grade': 'D', 'low': 21, 'high': 40},
    {'grade': 'E', 'low': 0, 'high': 20},
]

_COMPETENCE_REMARK = {
    'A': 'Above Competence',
    'B': 'Above Competence',
    'C': 'Competence',
    'D': 'Below Competence',
    'E': 'Below Competence',
}

_QUARTER_ORDINAL = {'Q1': 'FIRST', 'Q2': 'SECOND', 'Q3': 'THIRD', 'Q4': 'FOURTH'}

# Levels reported as "PUPIL" rather than "STUDENT" on the report header.
_PUPIL_LEVELS = {
    'N_BABY', 'N_MIDDLE', 'N_SENIOR',
    'STD1', 'STD2', 'STD3', 'STD4', 'STD5', 'STD6', 'STD7',
}


def report_grade(score) -> str:
    score = Decimal(str(score))
    for band in REPORT_GRADE_BANDS:
        if score >= band['low']:
            return band['grade']
    return REPORT_GRADE_BANDS[-1]['grade']


def _standard_competition_rank(ranked_pairs, key):
    """ranked_pairs: [(id, score), ...] sorted desc by score. Returns the
    1-based position of `key`, with ties sharing the same rank."""
    position = 0
    prev_score = None
    for i, (item_id, score) in enumerate(ranked_pairs):
        if score != prev_score:
            position = i + 1
            prev_score = score
        if item_id == key:
            return position
    return None


def _rank_by_subject(exam):
    by_subject = defaultdict(list)
    for row in MarkEntry.objects.filter(exam=exam).values('subject_id', 'student_id', 'score'):
        by_subject[row['subject_id']].append((row['student_id'], row['score']))
    for rows in by_subject.values():
        rows.sort(key=lambda pair: pair[1], reverse=True)
    return by_subject


def build_report_context(student, exam: Exam) -> dict:
    """Assembles the full context dict expected by
    templates/exams/report_card.html for one student's report on one exam."""
    from accounts.models import Role, SchoolSettings, User
    from staff.models import ClassTeacherAssignment

    entries = list(
        MarkEntry.objects
        .filter(exam=exam, student=student)
        .select_related('subject')
        .order_by('subject__name')
    )
    by_subject_rank = _rank_by_subject(exam)

    subjects = []
    total = Decimal('0')
    for e in entries:
        grade = report_grade(e.score)
        ranked = by_subject_rank.get(e.subject_id, [])
        subjects.append({
            'name': e.subject.name,
            'marks': e.score,
            'grade': grade,
            'position': _standard_competition_rank(ranked, student.pk),
            'class_size': len(ranked),
            'remark': e.remarks or _COMPETENCE_REMARK[grade],
        })
        total += e.score

    subjects_sat = len(entries)
    out_of = subjects_sat * 100
    average = round(total / subjects_sat, 2) if subjects_sat else Decimal('0')
    overall_grade = report_grade(average) if subjects_sat else ''

    all_totals = defaultdict(Decimal)
    for row in MarkEntry.objects.filter(exam=exam).values('student_id', 'score'):
        all_totals[row['student_id']] += row['score']
    ranked_totals = sorted(all_totals.items(), key=lambda pair: pair[1], reverse=True)

    skills = [
        {
            'name': s.get_skill_display(),
            'marks': s.marks,
            'grade': s.grade,
            'remark': s.remarks or _COMPETENCE_REMARK.get(s.grade, ''),
        }
        for s in StudentSkillAssessment.objects
        .filter(exam=exam, student=student)
        .order_by('skill')
    ]

    remark = ReportCardRemark.objects.filter(exam=exam, student=student).first()

    def _remark_block(text, name, date, signature):
        return {
            'text': text or '',
            'name': name or '',
            'date': date,
            'signature_url': signature.url if signature else '',
        }

    remarks = {
        'class_teacher': _remark_block(
            remark.class_teacher_text if remark else '',
            remark.class_teacher_name if remark else '',
            remark.class_teacher_date if remark else None,
            remark.class_teacher_signature if remark else None,
        ),
        'academic': _remark_block(
            remark.academic_text if remark else '',
            remark.academic_name if remark else '',
            remark.academic_date if remark else None,
            remark.academic_signature if remark else None,
        ),
        'head_teacher': _remark_block(
            remark.head_teacher_text if remark else '',
            '',
            remark.head_teacher_date if remark else None,
            remark.head_teacher_signature if remark else None,
        ),
    }

    settings_obj = SchoolSettings.get_settings()
    headteacher = User.objects.filter(role=Role.HEADTEACHER, is_active=True).first()
    academic_teacher = User.objects.filter(role=Role.ACADEMIC_TEACHER, is_active=True).first()

    assignment = (
        ClassTeacherAssignment.objects
        .filter(
            level=student.level,
            stream__iexact=student.stream,
            academic_year=exam.academic_year,
            is_active=True,
        )
        .select_related('teacher__user')
        .first()
    )

    period = exam.start_date.strftime('%B %Y').upper()
    quarter_word = _QUARTER_ORDINAL.get(exam.quarter, '')
    exam_name = ' '.join(filter(None, [
        quarter_word, exam.get_exam_type_display().upper(), 'EXAMINATION', period,
    ]))
    pupil_word = "PUPIL'S" if student.level in _PUPIL_LEVELS else "STUDENT'S"

    return {
        'school': {
            'ministry_line': MINISTRY_LINE,
            'name': settings_obj.school_name,
            'address': settings_obj.school_address,
            'phones': settings_obj.school_phone,
            'logo_url': settings_obj.school_logo.url if settings_obj.school_logo else '',
        },
        'report': {
            'title': f"{pupil_word} ACADEMIC REPORT",
            'period': period,
            'exam_name': exam_name,
        },
        'pupil': {
            'full_name': student.full_name,
            'class_name': student.get_level_display() + (f' {student.stream}' if student.stream else ''),
        },
        'subjects': subjects,
        'skills': skills,
        'bands': REPORT_GRADE_BANDS,
        'summary': {
            'total': total,
            'out_of': out_of,
            'average': average,
            'grade': overall_grade,
            'position': _standard_competition_rank(ranked_totals, student.pk),
            'class_size': len(ranked_totals),
        },
        'remarks': remarks,
        'footer': {
            'head_teacher_name': headteacher.full_name if headteacher else '',
            'head_teacher_phone': headteacher.phone if headteacher else '',
            'academic_teacher_name': academic_teacher.full_name if academic_teacher else '',
            'academic_teacher_phone': academic_teacher.phone if academic_teacher else '',
        },
    }


def render_report_card_html(student, exam: Exam) -> str:
    context = build_report_context(student, exam)
    return render_to_string('exams/report_card.html', context)


def _link_callback(uri, rel):
    """Resolves /media/ and /static/ URLs in the rendered HTML to filesystem
    paths — xhtml2pdf can't fetch them over HTTP like a browser would."""
    if uri.startswith(settings.MEDIA_URL):
        return str(settings.MEDIA_ROOT / uri[len(settings.MEDIA_URL):])
    if uri.startswith(settings.STATIC_URL):
        return str(settings.STATIC_ROOT / uri[len(settings.STATIC_URL):])
    return uri


def render_report_card_pdf(student, exam: Exam) -> bytes:
    html = render_report_card_html(student, exam)
    buffer = BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, link_callback=_link_callback)
    if result.err:
        raise ValueError('Failed to render report card PDF.')
    return buffer.getvalue()
