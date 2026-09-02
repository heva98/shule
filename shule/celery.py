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

    # Hourly — flip UNPAID/PARTIAL invoices past due_date to OVERDUE. Must
    # run before weekly-fee-reminders picks up newly-overdue invoices.
    'flip-overdue-invoices': {
        'task': 'fees.tasks.flip_overdue_invoices',
        'schedule': crontab(minute=0),

    # 07:00 daily — term closing/opening SMS reminders (5 days + 1 day before
    # each quarter boundary). No-op unless the school enables auto_term_dates.
    'daily-sms-term-dates': {
        'task': 'communications.tasks.sms_term_date_run',
        'schedule': crontab(hour=7, minute=0),
    },
}
app.conf.timezone = 'Africa/Dar_es_Salaam'
