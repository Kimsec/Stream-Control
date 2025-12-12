"""
WSGI entrypoint for Gunicorn with threaded workers.

Usage:
    gunicorn -c gunicorn.conf.py wsgi:app
"""

# Import the app
from app import app

# Expose app for Gunicorn
__all__ = ['app']
