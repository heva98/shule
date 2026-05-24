from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role
from students.models import Student

from .models import Exam, LevelGroup, MarkEntry, Subject
from .serializers import (
    BulkMarkSerializer,
    ExamSerializer,
    MarkEntrySerializer,
    SubjectSerializer,
)
from .utils import get_form4_division, get_psle_aggregate


class SubjectViewSet(ModelViewSet):
    serializer_class = SubjectSerializer
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


class ExamViewSet(ModelViewSet):
    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Exam.objects.select_related('academic_year', 'created_by')
        p = self.request.query_params
        if p.get('level'):
            qs = qs.filter(level=p['level'])
        if p.get('term'):
            qs = qs.filter(term=p['term'])
        if p.get('quarter'):
            qs = qs.filter(quarter=p['quarter'])
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    # POST /api/exams/{id}/marks/bulk/
    @action(detail=True, methods=['post'], url_path='marks/bulk')
    @transaction.atomic
    def bulk_marks(self, request, pk=None):
        exam = self.get_object()
        serializer = BulkMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        created_count = 0
        updated_count = 0

        for item in serializer.validated_data['records']:
            student = item['student_id']    # resolved to Student instance
            subject = item['subject_id']    # resolved to Subject instance
            score = item['score']
            remarks = item.get('remarks', '')

            _, created = MarkEntry.objects.update_or_create(
                exam=exam,
                student=student,
                subject=subject,
                defaults={
                    'score': score,
                    'remarks': remarks,
                    'entered_by': request.user,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response(
            {
                'detail': f'{created_count} created, {updated_count} updated.',
                'created': created_count,
                'updated': updated_count,
            },
            status=status.HTTP_201_CREATED,
        )

    # GET /api/exams/{id}/results/
    @action(detail=True, methods=['get'], url_path='results')
    def results(self, request, pk=None):
        exam = self.get_object()
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
        exam = self.get_object()
        entries = (
            MarkEntry.objects
            .filter(exam=exam)
            .select_related('student', 'subject')
        )

        # Group entries by student
        by_student: dict[int, list] = {}
        for entry in entries:
            by_student.setdefault(entry.student_id, []).append(entry)

        rows = []
        for student_id, marks in by_student.items():
            student = marks[0].student
            total = sum(m.score for m in marks)
            average = round(total / len(marks), 2) if marks else Decimal('0')
            rows.append(
                {
                    'student_pk': student.pk,
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'total_score': str(total),
                    'average_score': str(average),
                    'subjects_sat': len(marks),
                    '_sort_key': total,
                }
            )

        rows.sort(key=lambda r: r['_sort_key'], reverse=True)

        # Assign positions, handling ties
        position = 1
        for i, row in enumerate(rows):
            if i > 0 and row['_sort_key'] == rows[i - 1]['_sort_key']:
                row['position'] = rows[i - 1]['position']
            else:
                row['position'] = position
            position += 1
            del row['_sort_key']

        return Response(rows)


# GET /api/students/{student_id}/report-card/?exam={exam_id}
class ReportCardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        student = get_object_or_404(Student, pk=pk)
        exam_id = request.query_params.get('exam')
        if not exam_id:
            return Response(
                {'detail': 'exam query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam = get_object_or_404(Exam, pk=exam_id)
        entries = list(
            MarkEntry.objects
            .filter(exam=exam, student=student)
            .select_related('subject')
            .order_by('subject__name')
        )

        # ── Subjects table ────────────────────────────────────────────────
        subjects_data = [
            {
                'subject_code': e.subject.code,
                'subject_name': e.subject.name,
                'score': str(e.score),
                'grade': e.grade,
                'remarks': e.remarks,
            }
            for e in entries
        ]

        # ── Class position ────────────────────────────────────────────────
        all_entries = MarkEntry.objects.filter(exam=exam).select_related('student')
        by_student: dict[int, Decimal] = {}
        for e in all_entries:
            by_student[e.student_id] = by_student.get(e.student_id, Decimal('0')) + e.score

        ranked = sorted(by_student.items(), key=lambda x: x[1], reverse=True)
        student_total = by_student.get(student.pk, Decimal('0'))
        position = next(
            (i + 1 for i, (sid, _) in enumerate(ranked) if sid == student.pk), None
        )
        class_size = len(ranked)

        # ── Division / Aggregate ──────────────────────────────────────────
        level_group = None
        if entries:
            level_group = entries[0].subject.level_group

        division = aggregate = None
        if level_group == LevelGroup.OLEVEL and len(entries) >= 7:
            division, _, _ = get_form4_division(entries)
        elif level_group == LevelGroup.PRIMARY and len(entries) >= 5:
            aggregate, _ = get_psle_aggregate(entries)

        # ── School staff names ────────────────────────────────────────────
        from accounts.models import User
        headteacher = (
            User.objects.filter(role=Role.HEADTEACHER, is_active=True).first()
        )
        class_teacher = (
            User.objects.filter(role=Role.TEACHER, is_active=True).first()
        )

        return Response(
            {
                'student': {
                    'student_id': student.student_id,
                    'full_name': student.full_name,
                    'level': student.level,
                    'stream': student.stream,
                    'gender': student.gender,
                    'date_of_birth': str(student.date_of_birth),
                },
                'exam': {
                    'id': exam.pk,
                    'name': exam.name,
                    'term': exam.term,
                    'exam_type': exam.exam_type,
                    'academic_year': str(exam.academic_year),
                },
                'subjects': subjects_data,
                'summary': {
                    'total_score': str(student_total),
                    'average_score': str(
                        round(student_total / len(entries), 2) if entries else 0
                    ),
                    'subjects_sat': len(entries),
                    'position': position,
                    'class_size': class_size,
                    'division': division,
                    'aggregate': aggregate,
                },
                'class_teacher': class_teacher.full_name if class_teacher else '',
                'headteacher': headteacher.full_name if headteacher else '',
            }
        )
