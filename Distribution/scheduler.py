"""
Distribution Scheduler
=======================
Dynamic scheduler that loads distribution rules from DB and creates
CronTrigger jobs for each enabled rule. Rebuilt on every rule CRUD.
"""

import logging
from contextlib import closing
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

_scheduler = None


def _get_db_connection():
    """Get database connection function, avoiding circular imports."""
    import sys
    if 'app' in sys.modules:
        fn = getattr(sys.modules['app'], 'get_db_connection', None)
        if fn:
            return fn
    return None


def _run_rule(rule_id):
    """Wrapper to execute a distribution rule inside the scheduler context."""
    try:
        from distribution_engine import execute_distribution_rule
        result = execute_distribution_rule(rule_id)
        if result.get('success'):
            logger.info(f"Scheduled rule {rule_id} executed successfully")
        else:
            logger.warning(f"Scheduled rule {rule_id} failed: {result.get('error')}")
    except Exception as e:
        logger.error(f"Scheduler: error executing rule {rule_id}: {e}", exc_info=True)


def rebuild_scheduler_jobs():
    """Remove all distribution_* jobs and recreate from DB rules."""
    global _scheduler
    if _scheduler is None:
        return

    # Remove existing distribution jobs
    for job in _scheduler.get_jobs():
        if job.id.startswith('distribution_'):
            job.remove()

    get_conn = _get_db_connection()
    if not get_conn:
        logger.warning("Scheduler: cannot load rules — DB not available yet")
        return

    try:
        with closing(get_conn()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT id, schedule_type, schedule_time, schedule_day_of_week, schedule_day_of_month FROM distribution_rules WHERE enabled = true")
            rules = cur.fetchall()
    except Exception as e:
        logger.warning(f"Scheduler: could not load rules from DB: {e}")
        return

    for rule in rules:
        rule = dict(rule)
        rule_id = rule['id']
        schedule_type = rule['schedule_type']
        schedule_time = rule['schedule_time']

        hour = schedule_time.hour if hasattr(schedule_time, 'hour') else 8
        minute = schedule_time.minute if hasattr(schedule_time, 'minute') else 0

        try:
            if schedule_type == 'daily':
                trigger = CronTrigger(hour=hour, minute=minute)
            elif schedule_type == 'weekly':
                dow = rule.get('schedule_day_of_week', 0)
                trigger = CronTrigger(day_of_week=dow, hour=hour, minute=minute)
            elif schedule_type == 'monthly':
                dom = rule.get('schedule_day_of_month', 1)
                trigger = CronTrigger(day=dom, hour=hour, minute=minute)
            else:
                continue

            _scheduler.add_job(
                _run_rule,
                trigger=trigger,
                args=[rule_id],
                id=f'distribution_{rule_id}',
                replace_existing=True,
                misfire_grace_time=3600,
            )
            logger.info(f"Scheduler: registered job for rule {rule_id} ({schedule_type} at {hour:02d}:{minute:02d})")
        except Exception as e:
            logger.error(f"Scheduler: failed to register rule {rule_id}: {e}")


def start_scheduler():
    """Start the background scheduler and load initial jobs."""
    global _scheduler
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.start()
    logger.info("Distribution scheduler started")

    # Attempt initial job load (table may not exist yet on first boot)
    try:
        rebuild_scheduler_jobs()
    except Exception as e:
        logger.warning(f"Scheduler: initial job load deferred: {e}")
