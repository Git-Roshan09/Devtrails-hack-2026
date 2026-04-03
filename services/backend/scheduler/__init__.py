"""
GigaChad Scheduler Package
──────────────────────────
Celery-based background tasks for automated operations.
"""

from scheduler.tasks import celery_app

__all__ = ["celery_app"]
