# Gunicorn configuration file for Stream-Control
# Usage: gunicorn -c gunicorn.conf.py app:app

import multiprocessing
import os
from logging.handlers import RotatingFileHandler
import logging

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = 2
worker_class = "sync" 
threads = 100
max_requests = 0
max_requests_jitter = 0
timeout = 120
graceful_timeout = 30
keepalive = 5

# Logging (configurable via .env)
errorlog = "-"   # Log to stderr
loglevel = os.getenv("LOGLEVEL", "warning")  # info, warning, error, critical
access_log_format = '%(h)s %(l)s %(u)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Access log with rotation (if enabled)
_accesslog_path = os.getenv("GUNICORN_ACCESSLOG", "-")
if _accesslog_path and _accesslog_path != "-":
    accesslog = _accesslog_path
else:
    accesslog = _accesslog_path  # "-" or None

def on_starting(server):
    """Setup rotating file handler for access log"""
    if _accesslog_path and _accesslog_path not in ("-", "None", ""):
        # Create directory if needed
        log_dir = os.path.dirname(_accesslog_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)

        # Setup rotating handler (10MB max, 5 backups)
        handler = RotatingFileHandler(
            _accesslog_path,
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5
        )
        handler.setFormatter(logging.Formatter(
            '%(message)s'
        ))

        # Get gunicorn access logger
        access_logger = logging.getLogger('gunicorn.access')
        access_logger.addHandler(handler)

# Process naming
proc_name = "stream-control"

# Server mechanics
daemon = False  # systemd handles daemonization
pidfile = None
user = None     # Run as current user (systemd sets User=root)
group = None
umask = 0
tmp_upload_dir = None

# SSL (not needed when using Cloudflare Tunnel)
keyfile = None
certfile = None

# Debugging (disable in production)
reload = False
reload_engine = "auto"
spew = False
check_config = False
print_config = False
