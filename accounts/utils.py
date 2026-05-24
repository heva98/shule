from typing import Optional

from .models import AuditLog


def log_action(
    user,
    action: str,
    description: str,
    target_model: str = '',
    target_id: str = '',
    request=None,
    extra_data: Optional[dict] = None,
) -> AuditLog:
    ip = None
    if request:
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = x_forwarded.split(',')[0].strip() if x_forwarded else request.META.get('REMOTE_ADDR')

    return AuditLog.objects.create(
        performed_by=user,
        action=action,
        target_model=target_model,
        target_id=str(target_id) if target_id else '',
        description=description,
        ip_address=ip,
        extra_data=extra_data or {},
    )
