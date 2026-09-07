"""
SMS API — composer preview/send, delivery log, config and templates.

All routes are mounted under /api/communications/sms/ and require the `sms`
module. Scope (a class teacher may only touch their own class, fee sending
needs the `fees` module, …) is enforced here server-side, not just in the UI.
"""

import logging

from django.conf import settings
from rest_framework import mixins, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet, ReadOnlyModelViewSet

from accounts.models import Role
from shule.modules import module_enabled

from .models import SmsBatch, SmsConfiguration, SmsTemplate, SmsTemplateKey
from .serializers import (
    SmsBatchDetailSerializer,
    SmsBatchListSerializer,
    SmsConfigurationSerializer,
    SmsTemplateSerializer,
)
from .sms_audiences import (
    announcement_recipients,
    exam_results_recipients,
    fee_reminder_recipients,
)
from .sms_permissions import (
    CanConfigureSms,
    CanSendExamResults,
    CanViewSmsLog,
    SmsModuleEnabled,
    SENIOR_STAFF,
)
from .sms_service import (
    SmsError,
    _school_contact,
    create_batch,
    dispatch_batch,
    preview_recipients,
    requeue_failed,
)

logger = logging.getLogger(__name__)

_KIND_TO_BATCH = {
    "EXAM_RESULTS": SmsBatch.Kind.EXAM_RESULTS,
    "FEE_REMINDER": SmsBatch.Kind.FEE_REMINDER,
    "ANNOUNCEMENT": SmsBatch.Kind.ANNOUNCEMENT,
}


# ── shared audience resolution + scope enforcement ─────────────────────────

def _class_teacher_assignment(user):
    try:
        return user.staff_profile.current_class_assignment
    except Exception:
        return None


def _resolve(kind: str, data: dict, user):
    """
    Return (batch_kind, template_key, recipients, base_context, audit_context).
    Raises DRF ValidationError / PermissionDenied / SmsError.
    """
    cfg = SmsConfiguration.load()

    if kind == "EXAM_RESULTS":
        if not cfg.allow_exam_results:
            raise PermissionDenied("Exam-result SMS is switched off for this school.")
        if user.role not in (SENIOR_STAFF | {Role.CLASS_TEACHER}):
            raise PermissionDenied("You cannot send exam-result SMS.")
        from exams.models import Exam
        exam_id = data.get("exam_id")
        if not exam_id:
            raise ValidationError({"exam_id": "This field is required."})
        try:
            exam = Exam.objects.select_related("academic_year").get(pk=exam_id)
        except Exam.DoesNotExist:
            raise ValidationError({"exam_id": "No such exam."})
        if not exam.stream:
            raise ValidationError(
                {"exam_id": "This is a whole-level exam; result SMS is sent per class (level + stream)."}
            )
        if user.role == Role.CLASS_TEACHER:
            assignment = _class_teacher_assignment(user)
            if not assignment:
                raise PermissionDenied("You have no active class assignment for the current year.")
            same = (assignment.level == exam.level
                    and assignment.stream.upper() == (exam.stream or "").upper())
            if not same:
                raise PermissionDenied("That exam is not for your class.")
        recipients = exam_results_recipients(exam)
        audit = {"exam_id": exam.pk, "exam_name": exam.name,
                 "level": exam.level, "stream": exam.stream}
        return _KIND_TO_BATCH[kind], SmsTemplateKey.EXAM_RESULTS, recipients, {}, audit

    if kind == "FEE_REMINDER":
        if not cfg.allow_fee_reminders:
            raise PermissionDenied("Fee-reminder SMS is switched off for this school.")
        if user.role not in {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}:
            raise PermissionDenied("You cannot send fee-reminder SMS.")
        if not module_enabled("fees"):
            raise PermissionDenied("The fees module is not enabled.")
        if not _school_contact():
            raise ValidationError({"detail": (
                "Add the school phone number in School Settings first — the fee-reminder "
                "message gives it to parents as the contact for assistance."
            )})
        scope = data.get("scope", "all")
        if scope not in ("all", "overdue"):
            raise ValidationError({"scope": 'Must be "all" or "overdue".'})
        level = (data.get("level") or "").strip()
        stream = (data.get("stream") or "").strip()
        recipients = fee_reminder_recipients(scope=scope, level=level, stream=stream)
        audit = {"scope": scope, "level": level, "stream": stream}
        return _KIND_TO_BATCH[kind], SmsTemplateKey.FEE_REMINDER_DUE, recipients, {}, audit

    if kind == "ANNOUNCEMENT":
        if not cfg.allow_announcements:
            raise PermissionDenied("Announcement SMS is switched off for this school.")
        if user.role not in {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}:
            raise PermissionDenied("You cannot send announcement SMS.")
        audience = data.get("audience")
        if audience not in ("SCHOOL", "LEVEL", "CLASS"):
            raise ValidationError({"audience": "Must be SCHOOL, LEVEL or CLASS."})
        message = (data.get("message") or "").strip()
        if not message:
            raise ValidationError({"message": "This field is required."})
        level = (data.get("level") or "").strip()
        stream = (data.get("stream") or "").strip()
        if audience in ("LEVEL", "CLASS") and not level:
            raise ValidationError({"level": "Required for a LEVEL or CLASS announcement."})
        if audience == "CLASS" and not stream:
            raise ValidationError({"stream": "Required for a CLASS announcement."})
        recipients = announcement_recipients(
            audience=audience, message=message, level=level, stream=stream)
        audit = {"audience": audience, "level": level, "stream": stream, "message": message}
        return _KIND_TO_BATCH[kind], SmsTemplateKey.ANNOUNCEMENT, recipients, {}, audit

    raise ValidationError({"kind": "Unknown kind."})


# ── endpoints ─────────────────────────────────────────────────────────────

class SmsConfigView(APIView):
    """GET returns config + guard rails for the composer; PATCH edits it."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled]

    def get(self, request):
        cfg = SmsConfiguration.load()
        data = SmsConfigurationSerializer(cfg).data
        data["fees_module_enabled"] = module_enabled("fees")
        data["price_per_segment"] = str(settings.SMS_PRICE_PER_SEGMENT)
        data["role"] = request.user.role
        data["can_configure"] = request.user.role in {Role.OWNER, Role.HEADTEACHER}
        return Response(data)

    def patch(self, request):
        gate = CanConfigureSms()
        if not gate.has_permission(request, self):
            raise PermissionDenied(gate.message)
        cfg = SmsConfiguration.load()
        serializer = SmsConfigurationSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SmsTemplateViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                         mixins.UpdateModelMixin, GenericViewSet):
    """GET list / retrieve; PATCH the body (senior staff only). No create/delete."""
    serializer_class = SmsTemplateSerializer
    permission_classes = [IsAuthenticated, SmsModuleEnabled]
    queryset = SmsTemplate.objects.all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        lang = self.request.query_params.get("language")
        if lang:
            qs = qs.filter(language=lang)
        return qs

    def perform_update(self, serializer):
        if self.request.user.role not in SENIOR_STAFF:
            raise PermissionDenied("Only senior staff can edit SMS templates.")
        serializer.save(updated_by=self.request.user)


class SmsPreviewView(APIView):
    """POST {kind, ...} → recipient count, sample bodies, segment + cost estimate."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled]

    def post(self, request):
        kind = request.data.get("kind")
        _batch_kind, template_key, recipients, base_ctx, audit = _resolve(kind, request.data, request.user)
        try:
            preview = preview_recipients(
                kind=kind, template_key=template_key, recipients=recipients,
                base_context=base_ctx, language=request.data.get("language", ""))
        except SmsError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({
            "kind": kind,
            "audience": audit,
            "language": preview.language,
            "would_send": preview.would_send,
            "skipped": preview.skipped,
            "skip_breakdown": preview.skip_breakdown,
            "total_segments": preview.total_segments,
            "price_per_segment": preview.price_per_segment,
            "estimated_cost": preview.estimated_cost,
            "sample": preview.sample,
        })


class SmsSendView(APIView):
    """POST {kind, ..., dry_run} → create the batch (and queue it unless dry_run)."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled]

    def post(self, request):
        kind = request.data.get("kind")
        batch_kind, template_key, recipients, base_ctx, audit = _resolve(kind, request.data, request.user)
        dry_run = bool(request.data.get("dry_run", False))
        try:
            batch = create_batch(
                kind=batch_kind, template_key=template_key, recipients=recipients,
                created_by=request.user, base_context=base_ctx, dry_run=dry_run,
                language=request.data.get("language", ""),
            )
        except SmsError as exc:
            raise ValidationError({"detail": str(exc)})
        if audit:
            batch.context = {**batch.context, **audit}
            batch.save(update_fields=["context"])
        dispatch_batch(batch)
        batch.refresh_from_db()
        return Response(
            SmsBatchDetailSerializer(batch).data,
            status=status.HTTP_201_CREATED,
        )


class SmsBatchViewSet(ReadOnlyModelViewSet):
    """GET /sms/batches/ and /sms/batches/{id}/ — the delivery log."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled, CanViewSmsLog]

    def get_serializer_class(self):
        return SmsBatchDetailSerializer if self.action == "retrieve" else SmsBatchListSerializer

    def get_queryset(self):
        qs = SmsBatch.objects.select_related("created_by").order_by("-created_at")
        user = self.request.user
        # A class teacher only sees the batches they themselves sent.
        if user.role == Role.CLASS_TEACHER:
            qs = qs.filter(created_by=user)
        p = self.request.query_params
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("date_from"):
            qs = qs.filter(created_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(created_at__date__lte=p["date_to"])
        if self.action == "retrieve":
            qs = qs.prefetch_related("messages__student")
        return qs


class SmsBatchResendFailedView(APIView):
    """POST /sms/batches/{pk}/resend-failed/ — requeue this batch's FAILED rows."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled, CanViewSmsLog]

    def post(self, request, pk):
        try:
            batch = SmsBatch.objects.get(pk=pk)
        except SmsBatch.DoesNotExist:
            raise ValidationError({"detail": "No such batch."})
        if request.user.role == Role.CLASS_TEACHER and batch.created_by_id != request.user.id:
            raise PermissionDenied("You can only resend your own batches.")
        if batch.dry_run:
            raise ValidationError({"detail": "This was a dry run — nothing to resend."})
        n = requeue_failed(batch)
        if n:
            from .tasks import run_sms_batch
            run_sms_batch.delay(batch.pk)
        return Response({"requeued": n, "batch": batch.pk})


class SmsSendableExamsView(APIView):
    """GET /sms/exams/ — exams the caller may send results for (composer helper)."""
    permission_classes = [IsAuthenticated, SmsModuleEnabled, CanSendExamResults]

    def get(self, request):
        from exams.models import Exam
        qs = Exam.objects.select_related("academic_year").exclude(stream="").order_by("-start_date")
        if request.user.role == Role.CLASS_TEACHER:
            assignment = _class_teacher_assignment(request.user)
            if not assignment:
                return Response([])
            qs = qs.filter(level=assignment.level, stream__iexact=assignment.stream)
        return Response([
            {
                "id": e.pk, "name": e.name, "level": e.level, "stream": e.stream,
                "term": e.term, "quarter": e.quarter, "exam_type": e.exam_type,
                "academic_year": str(e.academic_year),
                "start_date": e.start_date.isoformat(),
            }
            for e in qs[:200]
        ])
