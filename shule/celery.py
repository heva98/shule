import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'shule.settings')

app = Celery('shule')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# ── Periodic tasks ────────────────────────────────────────────────────────────
app.conf.beat_schedule = {
    # 09:00 Africa/Dar_es_Salaam daily
    'daily-absence-alerts': {
        'task': 'communications.tasks.send_daily_absence_alerts',
        'schedule': crontab(hour=9, minute=0),
    },
    # Every Monday 08:00 — fee reminders for overdue invoices
    'weekly-fee-reminders': {
        'task': 'communications.tasks.send_fee_reminders_for_overdue',
        'schedule': crontab(hour=8, minute=0, day_of_week=1),
    },
}
app.conf.timezone = 'Africa/Dar_es_Salaam'
