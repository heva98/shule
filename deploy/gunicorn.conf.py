# worker_class=sync with too few workers means the whole server can only
# handle `workers` concurrent requests at once, server-wide. A single
# dashboard load fires 7-8 parallel API calls, which alone exceeded the old
# 3-worker budget and queued behind itself. Requests here are DB/IO-bound
# (waiting on Postgres), not CPU-bound, so threads let one worker process
# hold several in-flight requests at once instead of adding more processes.
bind = "127.0.0.1:8001"
workers = 3
threads = 4
worker_class = "gthread"
timeout = 60
accesslog = "/home/deployuser/shule/logs/gunicorn-access.log"
errorlog = "/home/deployuser/shule/logs/gunicorn-error.log"
loglevel = "info"
