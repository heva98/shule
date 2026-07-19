bind = "127.0.0.1:8001"
workers = 3
worker_class = "sync"
timeout = 60
accesslog = "/home/deployuser/shule/logs/gunicorn-access.log"
errorlog = "/home/deployuser/shule/logs/gunicorn-error.log"
loglevel = "info"
