from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role
from accounts.permissions import CONTENT_CREATOR_ROLES, SENIOR_STAFF_ROLES, IsAcademicStaff, IsSeniorStaff
from students.models import Student

from .models import Exam, LevelGroup, MarkEntry, Subject
from .serializers import (
    BulkMarkSerializer,
    ExamSerializer,
    MarkEntrySerializer,
    SubjectSerializer,
)
from .utils import get_grade, get_form4_division, get_psle_aggregate


# ── helpers ───────────────────────────────────────────────────────────────────

PRIMARY_LEVELS = {'STD1', 'STD2', 'STD3', 'STD4', 'STD5', 'STD6', 'STD7'}
OLEVEL_LEVELS  = {'FORM1', 'FORM2', 'FORM3', 'FORM4'}
ALEVEL_LEVELS  = {'FORM5', 'FORM6'}


def _level_group(level: str) -> str:
    if level in PRIMARY_LEVELS:
        return LevelGroup.PRIMARY
    if level in OLEVEL_LEVELS:
        return LevelGroup.OLEVEL
    return LevelGroup.ALEVEL


# ── Subjects ──────────────────────────────────────────────────────────────────

class SubjectViewSet(ModelViewSet):
    serializer_class   = SubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Subject.objects.all()
        lg = self.request.query_params.get('level_group')
        if lg:
            qs = qs.filter(level_group=lg)
        return qs

    def paginate_queryset(self, queryset):
        if self.request.query_params.get('all') == 'true':
            return None
        return super().paginate_queryset(queryset)


# ── Exams ─────────────────────────────────────────────────────────────────────

# Roles that may create exams
_EXAM_CREATE_ROLES = CONTENT_CREATOR_ROLES
# Roles that may delete exams (created by anyone)
_EXAM_DELETE_ROLES = SENIOR_STAFF_ROLES


class ExamViewSet(ModelViewSet):
    serializer_class   = ExamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Exam.objects.select_related('academic_year', 'created_by')
        p  = self.request.query_params
        if p.get('level'):
            qs = qs.filter(level=p['level'])
        if p.get('term'):
            qs = qs.filter(term=p['term'])
        if p.get('quarter'):
            qs = qs.filter(quarter=p['quarter'])
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        action = self.action
        role   = request.user.role

        if action == 'create' and role not in _EXAM_CREATE_ROLES:
            raise PermissionDenied('You do not have permission to create exams.')
        if action == 'destroy':
            if role not in _EXAM_DELETE_ROLES:
                raise PermissionDenied(
                    'Only Owner, Headteacher, or Academic Teacher can delete exams.'
                )

    def perform_create(self, serializer):
        exam = serializer.save(created_by=self.request.user)
        _notify_exam_scheduled(exam)

    # POST /api/exams/{id}/marks/bulk/
    @action(detail=True, methods=['post'], url_path='marks/bulk')
    @transaction.atomic
    def bulk_marks(self, request, pk=None):
        exam   = self.get_object()
        user   = request.user
        role   = user.role

        serializer = BulkMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Role-based restrictions
        allowed_subject_ids = None
        allowed_student_ids = None

        if role == Role.SUBJECT_TEACHER:
            try:
                allowed_subject_ids = set(
                    user.staff_profile.subjects.values_list('id', flat=True)
                )
            except Exception:
                raise PermissionDenied('No staff profile found for subject restriction.')

        elif role == Role.CLASS_TEACHER:
            try:
                assignment = user.staff_profile.current_class_assignment
            except Exception:
                raise PermissionDenied('No staff profile found.')
            if not assignment:
                raise PermissionDenied(
                    'You have no active class assignment for the current academic year.'
                )
            allowed_student_ids = set(
                Student.objects.filter(
                    level=assignment.level,
                    stream__iexact=assignment.stream,
                ).values_list('id', flat=True)
            )

        created_count = 0
        updated_count = 0

        for item in serializer.validated_data['records']:
            student = item['student_id']
            subject = item['subject_id']
            score   = item['score']
            remarks = item.get('remarks', '')

            # Enforce subject-teacher restriction
            if allowed_subject_ids is not None and subject.id not in allowed_subject_ids:
                raise PermissionDenied(
                    f'You are not authorised to enter marks for subject '
                    f'"{subject.name}" ({subject.code}).'
                )

            # Enforce class-teacher restriction
            if allowed_student_ids is not None and student.id not in allowed_student_ids:
                raise PermissionDenied(
                    f'Student {student.student_id} is not in your assigned class.'
                )

            _, created = MarkEntry.objects.update_or_create(
                exam=exam,
                student=student,
                subject=subject,
                defaults={
                    'score':      score,
                    'remarks':    remarks,
                    'entered_by': request.user,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response(
            {
                'detail':  f'{created_count} created, {updated_count} updated.',
                'created': created_count,
                'updated': updated_count,
            },
            status=status.HTTP_201_CREATED,
        )

    # GET /api/exams/{id}/results/
    @action(detail=True, methods=['get'], url_path='results')
    def results(self, request, pk=None):
        exam    = self.get_object()
        entries = (
            MarkEntry.objects
            .filter(exam=exam)
            .select_related('student', 'subject')
            .order_by('student__last_name', 'subject__name')
        )
        return Response(MarkEntrySerializer(entries, many=True).data)

    # GET /api/exams/{id}/ranking/
    @action(detail=True, methods=['get'], url_path='ranking')
    def ranking(self, request, pk=None):
        exam    = self.get_object()
        entries = (
            MarkEntry.objects
            .filter(exam=exam)
            .select_related('student', 'subject')
        )

        by_student: dict[int, list] = {}
        for entry in entries:
            by_student.setdefault(entry.student_id, []).append(entry)

        rows = []
        for student_id, marks in by_student.items():
            student = marks[0].student
            total   = sum(m.score for m in marks)
            average = round(total / len(marks), 2) if marks else Decimal('0')
            rows.append({
                'student_pk':    student.pk,
                'student_public_id': str(student.public_id),
                'student_id':    student.student_id,
                'student_name':  student.full_name,
                'total_score':   str(total),
                'average_score': str(average),
                'subjects_sat':  len(marks),
                '_sort_key':     total,
            })

        rows.sort(key=lambda r: r['_sort_key'], reverse=True)

        position = 1
        for i, row in enumerate(rows):
            if i > 0 and row['_sort_key'] == rows[i - 1]['_sort_key']:
                row['position'] = rows[i - 1]['position']
            else:
                row['position'] = position
            position += 1
            del row['_sort_key']

        return Response(rows)


# ── Report card ───────────────────────────────────────────────────────────────

class ReportCardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):
        student = get_object_or_404(Student, public_id=public_id)
        exam_id = request.query_params.get('exam')
        if not exam_id:
            return Response(
                {'detail': 'exam query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam    = get_object_or_404(Exam, pk=exam_id)
        entries = list(
            MarkEntry.objects
            .filter(exam=exam, student=student)
            .select_related('subject')
            .order_by('subject__name')
        )

        subjects_data = [
            {
                'subject_code': e.subject.code,
                'subject_name': e.subject.name,
                'score':        str(e.score),
                'grade':        e.grade,
                'remarks':      e.remarks,
            }
            for e in entries
        ]

        all_entries = MarkEntry.objects.filter(exam=exam).select_related('student')
        by_student: dict[int, Decimal] = {}
        for e in all_entries:
            by_student[e.student_id] = by_student.get(e.student_id, Decimal('0')) + e.score

        ranked       = sorted(by_student.items(), key=lambda x: x[1], reverse=True)
        student_total = by_student.get(student.pk, Decimal('0'))
        position     = next(
            (i + 1 for i, (sid, _) in enumerate(ranked) if sid == student.pk), None
        )
        class_size = len(ranked)

        level_group = entries[0].subject.level_group if entries else None
        division = aggregate = None
        if level_group == LevelGroup.OLEVEL and len(entries) >= 7:
            division, _, _ = get_form4_division(entries)
        elif level_group == LevelGroup.PRIMARY and len(entries) >= 5:
            aggregate, _ = get_psle_aggregate(entries)

        from accounts.models import User
        headteacher   = User.objects.filter(role=Role.HEADTEACHER, is_active=True).first()
        class_teacher = User.objects.filter(role=Role.CLASS_TEACHER, is_active=True).first()

        return Response({
            'student': {
                'student_id':    student.student_id,
                'full_name':     student.full_name,
                'level':         student.level,
                'stream':        student.stream,
                'gender':        student.gender,
                'date_of_birth': str(student.date_of_birth),
            },
            'exam': {
                'id':           exam.pk,
                'name':         exam.name,
                'term':         exam.term,
                'quarter':      exam.quarter,
                'exam_type':    exam.exam_type,
                'academic_year': str(exam.academic_year),
            },
            'subjects': subjects_data,
            'summary': {
                'total_score':   str(student_total),
                'average_score': str(
                    round(student_total / len(entries), 2) if entries else 0
                ),
                'subjects_sat':  len(entries),
                'position':      position,
                'class_size':    class_size,
                'division':      division,
                'aggregate':     aggregate,
            },
            'class_teacher': class_teacher.full_name if class_teacher else '',
            'headteacher':   headteacher.full_name if headteacher else '',
        })


# ── Class Performance ─────────────────────────────────────────────────────────

class ClassPerformanceView(APIView):
    """
    GET /api/exams/class-performance/?exam_id=&quarter=&term=
    For CLASS_TEACHER: auto-filters to their assigned class.
    For ACADEMIC_TEACHER / HEADTEACHER / OWNER: add ?level=&stream= query params.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = user.role

        allowed_roles = {
            Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER, Role.CLASS_TEACHER,
        }
        if role not in allowed_roles:
            raise PermissionDenied('You do not have permission to view class performance.')

        # Determine level + stream scope
        if role == Role.CLASS_TEACHER:
            try:
                assignment = user.staff_profile.current_class_assignment
            except Exception:
                return Response(
                    {'detail': 'No staff profile found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if not assignment:
                return Response(
                    {'detail': 'No active class assignment for the current academic year.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            level  = assignment.level
            stream = assignment.stream
        else:
            level  = request.query_params.get('level')
            stream = request.query_params.get('stream')
            if not level:
                return Response(
                    {'detail': 'level query param is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Exam filter
        exam_id = request.query_params.get('exam_id')
        if not exam_id:
            return Response(
                {'detail': 'exam_id query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        exam = get_object_or_404(Exam, pk=exam_id)

        # Students in class
        student_qs = Student.objects.filter(level=level)
        if stream:
            student_qs = student_qs.filter(stream__iexact=stream)

        # All mark entries for this exam + these students
        entries = (
            MarkEntry.objects
            .filter(exam=exam, student__in=student_qs)
            .select_related('student', 'subject')
        )

        # Group by student
        by_student: dict[int, dict] = {}
        for entry in entries:
            sid = entry.student_id
            if sid not in by_student:
                by_student[sid] = {
                    'student':  entry.student,
                    'subjects': [],
                    'total':    Decimal('0'),
                }
            by_student[sid]['subjects'].append(entry)
            by_student[sid]['total'] += entry.score

        # Attendance % for the quarter
        from attendance.models import AttendanceRecord, AttendanceStatus
        quarter = request.query_params.get('quarter')
        term    = request.query_params.get('term')

        def _att_pct(student):
            att_qs = AttendanceRecord.objects.filter(student=student)
            if quarter:
                att_qs = att_qs.filter(quarter=quarter)
            elif term:
                # Map term to quarters
                from shule.utils import TERM_QUARTER_MAP
                qs_for_term = [q for q, t in TERM_QUARTER_MAP.items() if t == term]
                att_qs = att_qs.filter(quarter__in=qs_for_term)
            total   = att_qs.count()
            present = att_qs.filter(
                status__in=[AttendanceStatus.PRESENT, AttendanceStatus.LATE]
            ).count()
            return round(present / total * 100, 1) if total else 0.0

        # Build rows and rank
        rows = []
        for sid, data in by_student.items():
            student  = data['student']
            subjects = data['subjects']
            total    = data['total']
            avg      = round(total / len(subjects), 2) if subjects else Decimal('0')
            rows.append({
                'student_id':   student.student_id,
                'full_name':    student.full_name,
                'photo':        request.build_absolute_uri(student.profile_photo.url)
                                if student.profile_photo else None,
                'subjects': [
                    {
                        'code':  e.subject.code,
                        'name':  e.subject.name,
                        'score': str(e.score),
                        'grade': e.grade,
                    }
                    for e in sorted(subjects, key=lambda e: e.subject.name)
                ],
                'total_marks':  str(total),
                'average':      str(avg),
                'attendance_pct': _att_pct(student),
                '_sort_total':  total,
            })

        # Sort by total descending, assign positions
        rows.sort(key=lambda r: r['_sort_total'], reverse=True)
        position = 1
        for i, row in enumerate(rows):
            if i > 0 and row['_sort_total'] == rows[i - 1]['_sort_total']:
                row['position'] = rows[i - 1]['position']
            else:
                row['position'] = position
            position += 1
            del row['_sort_total']

        return Response({
            'exam':     ExamSerializer(exam).data,
            'level':    level,
            'stream':   stream or '',
            'students': rows,
            'count':    len(rows),
        })


# ── Exam scheduling notification helper ───────────────────────────────────────

def _notify_exam_scheduled(exam: Exam):
    """Notify relevant subject teachers when an exam is created."""
    try:
        from communications.services import NotificationService
        from staff.models import StaffProfile

        # Find teachers whose subjects belong to the exam's level group
        level_group = _level_group(exam.level)
        teachers    = (
            StaffProfile.objects
            .filter(subjects__level_group=level_group)
            .distinct()
            .select_related('user')
        )

        message = (
            f'Dear {{name}}, an exam has been scheduled: '
            f'{exam.name} — {exam.level}'
            f'{" " + exam.stream if exam.stream else ""} | '
            f'Term: {exam.term}, Quarter: {exam.quarter} | '
            f'Dates: {exam.start_date} → {exam.end_date}. '
            f'Please log in to enter marks by {exam.end_date}.'
        )

        for teacher in teachers:
            personalised = message.replace('{name}', teacher.user.full_name)
            NotificationService.notify_staff(
                staff_profile=teacher,
                title=f'New Exam Scheduled: {exam.name}',
                message=personalised,
                category='EXAM',
            )
    except Exception:
        pass
