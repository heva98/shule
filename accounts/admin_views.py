"""
Admin panel API views — accessible only to SYSTEM_ADMIN and OWNER roles.
All mutating operations are audit-logged via accounts.utils.log_action.
"""
import csv
import io
import shutil
import time

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import Subject, LevelGroup
from fees.models import AcademicYear

from .models import AuditLog, Role, SchoolSettings, User
from .permissions import IsSystemAdmin
from .serializers import (
    AdminPasswordResetSerializer,
    AdminRoleChangeSerializer,
    AdminUserCreateSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    AuditLogSerializer,
    SchoolSettingsSerializer,
)
from .utils import log_action


# ── Users ─────────────────────────────────────────────────────────────────────

class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        qs = User.objects.all()
        role = request.query_params.get('role')
        is_active = request.query_params.get('is_active')
        search = request.query_params.get('search', '').strip()

        if role:
            qs = qs.filter(role=role)
        if is_active is not None:
            qs = qs.filter(is_active=(is_active.lower() == 'true'))
        if search:
            qs = qs.filter(full_name__icontains=search) | qs.filter(email__icontains=search)

        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('page_size', 50)), 200)
        start = (page - 1) * page_size
        total = qs.count()
        users = qs[start:start + page_size]

        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': AdminUserSerializer(users, many=True).data,
        })

    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_action(
            user=request.user,
            action=AuditLog.Action.USER_CREATED,
            target_model='User',
            target_id=user.pk,
            description=f'Created user {user.email} with role {user.role}',
            request=request,
            extra_data={'role': user.role},
        )
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def _get_user(self, pk):
        try:
            return User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None

    def put(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminUserSerializer(user).data)


class AdminUserRoleView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def put(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminRoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_role = user.role
        new_role = serializer.validated_data['role']
        reason = serializer.validated_data.get('reason', '')

        user.role = new_role
        user.save(update_fields=['role'])

        log_action(
            user=request.user,
            action=AuditLog.Action.ROLE_CHANGED,
            target_model='User',
            target_id=user.pk,
            description=f'Changed role of {user.email} from {old_role} to {new_role}. {reason}'.strip(),
            request=request,
            extra_data={'old_role': old_role, 'new_role': new_role, 'reason': reason},
        )
        return Response({'detail': 'Role updated.', 'role': new_role})


class AdminUserPasswordResetView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def put(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data['new_password']

        try:
            validate_password(new_password, user)
        except DjangoValidationError as e:
            return Response({'detail': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        log_action(
            user=request.user,
            action=AuditLog.Action.PASSWORD_RESET,
            target_model='User',
            target_id=user.pk,
            description=f'Password reset for {user.email} by admin',
            request=request,
        )

        if serializer.validated_data.get('notify'):
            try:
                from django.core.mail import send_mail
                send_mail(
                    subject='Your password has been reset',
                    message=f'Hi {user.full_name},\n\nYour Shule SMS password was reset by an administrator.\nNew password: {new_password}\n\nPlease change it after logging in.',
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shule.ac.tz'),
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({'detail': 'Password reset successfully.'})


class AdminUserToggleActiveView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def put(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])

        action = AuditLog.Action.USER_ACTIVATED if user.is_active else AuditLog.Action.USER_DEACTIVATED
        log_action(
            user=request.user,
            action=action,
            target_model='User',
            target_id=user.pk,
            description=f'{"Activated" if user.is_active else "Deactivated"} user {user.email}',
            request=request,
        )
        return Response({'detail': f'User {"activated" if user.is_active else "deactivated"}.', 'is_active': user.is_active})


# ── Bulk import ───────────────────────────────────────────────────────────────

class AdminBulkImportView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded = csv_file.read().decode('utf-8')
        except UnicodeDecodeError:
            return Response({'detail': 'File must be UTF-8 encoded.'}, status=status.HTTP_400_BAD_REQUEST)

        reader = csv.DictReader(io.StringIO(decoded))
        required = {'full_name', 'email', 'role'}
        if not required.issubset(set(reader.fieldnames or [])):
            return Response(
                {'detail': f'CSV must have columns: {", ".join(required)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_roles = {r[0] for r in Role.choices}
        created, skipped, errors = [], [], []

        for i, row in enumerate(reader, start=2):
            email = (row.get('email') or '').strip().lower()
            full_name = (row.get('full_name') or '').strip()
            role = (row.get('role') or '').strip().upper()
            phone = (row.get('phone') or '').strip()

            if not email or not full_name:
                errors.append({'row': i, 'reason': 'Missing email or full_name'})
                continue
            if role not in valid_roles:
                errors.append({'row': i, 'email': email, 'reason': f'Invalid role: {role}'})
                continue
            if User.objects.filter(email=email).exists():
                skipped.append({'row': i, 'email': email, 'reason': 'Already exists'})
                continue

            password = User.objects.make_random_password(length=10)
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                phone=phone,
                role=role,
            )
            created.append({'email': email, 'temp_password': password})

        log_action(
            user=request.user,
            action=AuditLog.Action.BULK_IMPORT,
            target_model='User',
            description=f'Bulk imported {len(created)} users ({len(skipped)} skipped, {len(errors)} errors)',
            request=request,
            extra_data={'created': len(created), 'skipped': len(skipped), 'errors': len(errors)},
        )

        return Response({
            'created': len(created),
            'skipped': len(skipped),
            'errors': len(errors),
            'created_users': created,
            'error_details': errors,
        }, status=status.HTTP_201_CREATED)


# ── Audit logs ────────────────────────────────────────────────────────────────

class AdminAuditLogView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        qs = AuditLog.objects.select_related('performed_by').all()
        action = request.query_params.get('action')
        user_id = request.query_params.get('user')
        target_model = request.query_params.get('target_model')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if action:
            qs = qs.filter(action=action)
        if user_id:
            qs = qs.filter(performed_by_id=user_id)
        if target_model:
            qs = qs.filter(target_model=target_model)
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)

        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('page_size', 50)), 200)
        start = (page - 1) * page_size
        total = qs.count()

        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': AuditLogSerializer(qs[start:start + page_size], many=True).data,
        })


# ── School settings ───────────────────────────────────────────────────────────

class AdminSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]
    parser_classes = [MultiPartParser]

    def get(self, request):
        settings_obj = SchoolSettings.get_settings()
        return Response(SchoolSettingsSerializer(settings_obj, context={'request': request}).data)

    def put(self, request):
        settings_obj = SchoolSettings.get_settings()
        serializer = SchoolSettingsSerializer(
            settings_obj, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(
            user=request.user,
            action=AuditLog.Action.SETTINGS_UPDATED,
            target_model='SchoolSettings',
            target_id=1,
            description='School settings updated',
            request=request,
        )
        return Response(serializer.data)


# ── Subject management ────────────────────────────────────────────────────────

class AdminSubjectListView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        include_inactive = request.query_params.get('include_inactive') == 'true'
        qs = Subject.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return Response([
            {
                'id': s.id,
                'name': s.name,
                'code': s.code,
                'level_group': s.level_group,
                'is_compulsory': s.is_compulsory,
                'is_active': s.is_active,
            }
            for s in qs
        ])

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        code = (request.data.get('code') or '').strip().upper()
        level_group = (request.data.get('level_group') or '').strip()
        is_compulsory = bool(request.data.get('is_compulsory', False))

        if not name or not code or not level_group:
            return Response(
                {'detail': 'name, code, and level_group are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if level_group not in LevelGroup.values:
            return Response(
                {'detail': f'level_group must be one of: {", ".join(LevelGroup.values)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Subject.objects.filter(code=code).exists():
            return Response({'detail': 'A subject with this code already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        if Subject.objects.filter(name=name).exists():
            return Response({'detail': 'A subject with this name already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        subject = Subject.objects.create(
            name=name, code=code, level_group=level_group, is_compulsory=is_compulsory
        )
        log_action(
            user=request.user,
            action=AuditLog.Action.SUBJECT_ADDED,
            target_model='Subject',
            target_id=subject.pk,
            description=f'Added subject {code} — {name}',
            request=request,
        )
        return Response(
            {'id': subject.pk, 'name': subject.name, 'code': subject.code,
             'level_group': subject.level_group, 'is_compulsory': subject.is_compulsory, 'is_active': subject.is_active},
            status=status.HTTP_201_CREATED,
        )


class AdminSubjectDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def _get(self, pk):
        try:
            return Subject.objects.get(pk=pk)
        except Subject.DoesNotExist:
            return None

    def put(self, request, pk):
        subject = self._get(pk)
        if not subject:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('name', 'code', 'level_group', 'is_compulsory', 'is_active'):
            if field in request.data:
                setattr(subject, field, request.data[field])
        subject.save()
        log_action(
            user=request.user,
            action=AuditLog.Action.SUBJECT_UPDATED,
            target_model='Subject',
            target_id=subject.pk,
            description=f'Updated subject {subject.code} — {subject.name}',
            request=request,
        )
        return Response({'id': subject.pk, 'name': subject.name, 'code': subject.code,
                         'level_group': subject.level_group, 'is_compulsory': subject.is_compulsory,
                         'is_active': subject.is_active})

    def delete(self, request, pk):
        subject = self._get(pk)
        if not subject:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        subject.is_active = False
        subject.save(update_fields=['is_active'])
        log_action(
            user=request.user,
            action=AuditLog.Action.SUBJECT_DELETED,
            target_model='Subject',
            target_id=subject.pk,
            description=f'Deactivated subject {subject.code} — {subject.name}',
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Academic years ────────────────────────────────────────────────────────────

class AdminAcademicYearListView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        years = AcademicYear.objects.order_by('-year')
        return Response([
            {
                'id': y.pk,
                'year': y.year,
                'is_current': y.is_current,
                'q1_start': y.q1_start, 'q1_end': y.q1_end,
                'q2_start': y.q2_start, 'q2_end': y.q2_end,
                'q3_start': y.q3_start, 'q3_end': y.q3_end,
                'q4_start': y.q4_start, 'q4_end': y.q4_end,
            }
            for y in years
        ])

    def post(self, request):
        year = request.data.get('year')
        if not year:
            return Response({'detail': 'year is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if AcademicYear.objects.filter(year=year).exists():
            return Response({'detail': f'Academic year {year} already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        ay = AcademicYear.objects.create(
            year=year,
            q1_start=request.data.get('q1_start'),
            q1_end=request.data.get('q1_end'),
            q2_start=request.data.get('q2_start'),
            q2_end=request.data.get('q2_end'),
            q3_start=request.data.get('q3_start'),
            q3_end=request.data.get('q3_end'),
            q4_start=request.data.get('q4_start'),
            q4_end=request.data.get('q4_end'),
        )
        log_action(
            user=request.user,
            action=AuditLog.Action.YEAR_CREATED,
            target_model='AcademicYear',
            target_id=ay.pk,
            description=f'Created academic year {year}',
            request=request,
        )
        return Response({'id': ay.pk, 'year': ay.year, 'is_current': ay.is_current}, status=status.HTTP_201_CREATED)


class AdminAcademicYearDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def _get(self, pk):
        try:
            return AcademicYear.objects.get(pk=pk)
        except AcademicYear.DoesNotExist:
            return None

    def put(self, request, pk):
        ay = self._get(pk)
        if not ay:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('q1_start', 'q1_end', 'q2_start', 'q2_end', 'q3_start', 'q3_end', 'q4_start', 'q4_end'):
            if field in request.data:
                setattr(ay, field, request.data[field] or None)
        ay.save()
        log_action(
            user=request.user,
            action=AuditLog.Action.YEAR_UPDATED,
            target_model='AcademicYear',
            target_id=ay.pk,
            description=f'Updated academic year {ay.year}',
            request=request,
        )
        return Response({'id': ay.pk, 'year': ay.year, 'is_current': ay.is_current})


class AdminAcademicYearSetCurrentView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def put(self, request, pk):
        try:
            ay = AcademicYear.objects.get(pk=pk)
        except AcademicYear.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        AcademicYear.objects.filter(is_current=True).update(is_current=False)
        ay.is_current = True
        ay.save(update_fields=['is_current'])
        log_action(
            user=request.user,
            action=AuditLog.Action.YEAR_UPDATED,
            target_model='AcademicYear',
            target_id=ay.pk,
            description=f'Set {ay.year} as current academic year',
            request=request,
        )
        return Response({'detail': f'{ay.year} is now the current academic year.'})


# ── System health ─────────────────────────────────────────────────────────────

class AdminSystemHealthView(APIView):
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        # DB ping
        db_ok = False
        db_latency_ms = None
        try:
            t0 = time.monotonic()
            with connection.cursor() as cur:
                cur.execute('SELECT 1')
            db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
            db_ok = True
        except Exception:
            pass

        # Celery
        celery_ok = False
        try:
            from shule.celery import app as celery_app
            inspect = celery_app.control.inspect(timeout=2)
            workers = inspect.ping()
            celery_ok = bool(workers)
        except Exception:
            pass

        # Email
        email_configured = bool(getattr(settings, 'EMAIL_HOST', ''))

        # Storage
        media_root = getattr(settings, 'MEDIA_ROOT', '')
        storage_mb = None
        if media_root:
            try:
                total, used, free = shutil.disk_usage(media_root)
                storage_mb = round(used / (1024 * 1024), 1)
            except Exception:
                pass

        # Counts
        from students.models import Student
        user_count = User.objects.filter(is_active=True).count()
        student_count = Student.objects.count()

        return Response({
            'database': {'ok': db_ok, 'latency_ms': db_latency_ms},
            'celery': {'ok': celery_ok},
            'email_configured': email_configured,
            'sms_configured': False,
            'whatsapp_configured': True,
            'storage_mb': storage_mb,
            'active_users': user_count,
            'total_students': student_count,
        })
