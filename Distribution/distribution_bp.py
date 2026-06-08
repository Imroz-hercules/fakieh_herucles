"""
Distribution Rules Blueprint
=============================
CRUD API for report distribution rules — schedule any report
for automatic email delivery or disk save.
"""

import os
import logging
import json
import re
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import login_required
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

distribution_bp = Blueprint('distribution_bp', __name__)

_table_ensured = False


def _get_db_connection():
    """Helper function to get database connection, avoiding circular imports."""
    import sys
    if 'app' in sys.modules:
        app_module = sys.modules['app']
        get_db_connection = getattr(app_module, 'get_db_connection', None)
        if get_db_connection:
            return get_db_connection
    raise RuntimeError("Could not get database connection function")


def _ensure_table():
    """Create distribution_rules table if it doesn't exist (once per process)."""
    global _table_ensured
    if _table_ensured:
        return
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS distribution_rules (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL DEFAULT '',
                    report_id INTEGER DEFAULT 0,
                    report_ids JSONB DEFAULT '[]'::jsonb,
                    delivery_method VARCHAR(20) NOT NULL DEFAULT 'email',
                    recipients JSONB DEFAULT '[]'::jsonb,
                    save_path TEXT DEFAULT '',
                    format VARCHAR(10) DEFAULT 'pdf',
                    schedule_type VARCHAR(10) NOT NULL DEFAULT 'daily',
                    schedule_time TIME NOT NULL DEFAULT '08:00',
                    schedule_day_of_week INTEGER DEFAULT NULL,
                    schedule_day_of_month INTEGER DEFAULT NULL,
                    enabled BOOLEAN DEFAULT true,
                    last_run_at TIMESTAMP DEFAULT NULL,
                    last_run_status VARCHAR(20) DEFAULT NULL,
                    last_run_error TEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)
            # Migration: add report_ids column if missing (existing installs)
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'distribution_rules' AND column_name = 'report_ids'
            """)
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE distribution_rules ADD COLUMN report_ids JSONB DEFAULT '[]'::jsonb")
                cursor.execute("""
                    UPDATE distribution_rules
                    SET report_ids = jsonb_build_array(report_id)
                    WHERE (report_ids = '[]'::jsonb OR report_ids IS NULL) AND report_id IS NOT NULL AND report_id > 0
                """)
            # Migration: relax report_id NOT NULL constraint for existing installs
            cursor.execute("""
                ALTER TABLE distribution_rules ALTER COLUMN report_id SET DEFAULT 0;
                ALTER TABLE distribution_rules ALTER COLUMN report_id DROP NOT NULL;
            """)
            actual_conn.commit()
            _table_ensured = True
    except Exception as e:
        logger.error(f"Error ensuring distribution_rules table: {e}")


def _validate_rule(data):
    """Validate distribution rule fields. Returns (cleaned_data, error_msg)."""
    errors = []

    # Accept report_ids (array) or report_id (single, wrapped to array)
    report_ids = data.get('report_ids')
    if report_ids and isinstance(report_ids, list):
        try:
            report_ids = [int(rid) for rid in report_ids if rid not in (None, '')]
        except (TypeError, ValueError):
            errors.append('report_ids must be an array of integers')
            report_ids = []
        if not report_ids:
            errors.append('At least one report must be selected')
    else:
        report_id = data.get('report_id')
        if report_id is None or report_id == '':
            errors.append('At least one report must be selected')
            report_ids = []
        else:
            try:
                report_ids = [int(report_id)]
            except (TypeError, ValueError):
                errors.append('report_id must be an integer')
                report_ids = []

    delivery_method = data.get('delivery_method', 'email')
    if delivery_method not in ('email', 'disk', 'both'):
        errors.append('delivery_method must be email, disk, or both')

    recipients = data.get('recipients', [])
    if delivery_method in ('email', 'both'):
        if not recipients or not isinstance(recipients, list):
            errors.append('At least one recipient email is required for email delivery')
        else:
            email_re = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
            for addr in recipients:
                if not email_re.match(str(addr)):
                    errors.append(f'Invalid email address: {addr}')

    save_path = data.get('save_path', '')
    if delivery_method in ('disk', 'both') and not save_path:
        errors.append('save_path is required for disk delivery')

    schedule_type = data.get('schedule_type', 'daily')
    if schedule_type not in ('daily', 'weekly', 'monthly'):
        errors.append('schedule_type must be daily, weekly, or monthly')

    schedule_day_of_week = data.get('schedule_day_of_week')
    if schedule_type == 'weekly':
        try:
            dow = int(schedule_day_of_week) if schedule_day_of_week is not None else None
            if dow is None or not (0 <= dow <= 6):
                errors.append('schedule_day_of_week (0=Mon..6=Sun) required for weekly')
        except (TypeError, ValueError):
            errors.append('schedule_day_of_week must be an integer 0-6')
            dow = None
    else:
        dow = int(schedule_day_of_week) if schedule_day_of_week is not None else None

    schedule_day_of_month = data.get('schedule_day_of_month')
    if schedule_type == 'monthly':
        try:
            dom = int(schedule_day_of_month) if schedule_day_of_month is not None else None
            if dom is None or not (1 <= dom <= 28):
                errors.append('schedule_day_of_month (1-28) required for monthly')
        except (TypeError, ValueError):
            errors.append('schedule_day_of_month must be an integer 1-28')
            dom = None
    else:
        dom = int(schedule_day_of_month) if schedule_day_of_month is not None else None

    schedule_time = data.get('schedule_time', '08:00')
    if not re.match(r'^\d{2}:\d{2}$', str(schedule_time)):
        errors.append('schedule_time must be in HH:MM format')

    fmt = data.get('format', 'pdf')
    if fmt not in ('pdf', 'html', 'xlsx'):
        errors.append('format must be pdf, html, or xlsx')

    if errors:
        return None, '; '.join(errors)

    cleaned = {
        'name': data.get('name', ''),
        'report_ids': report_ids,
        'report_id': report_ids[0] if report_ids else 0,  # backward compat
        'delivery_method': delivery_method,
        'recipients': recipients,
        'save_path': save_path,
        'format': fmt,
        'schedule_type': schedule_type,
        'schedule_time': schedule_time,
        'schedule_day_of_week': dow,
        'schedule_day_of_month': dom,
        'enabled': bool(data.get('enabled', True)),
        'include_ai_summary': bool(data.get('include_ai_summary', False)),
        'content_mode': data.get('content_mode', 'report_only'),
    }

    # Validate content_mode (Plan 6 §11 adds 'cfo_briefing')
    valid_modes = ('report_only', 'report_with_ai', 'ai_only', 'cfo_briefing')
    if cleaned['content_mode'] not in valid_modes:
        return None, f"content_mode must be one of: {', '.join(valid_modes)}"

    # Derive include_ai_summary from content_mode for backward compatibility
    cleaned['include_ai_summary'] = cleaned['content_mode'] in ('report_with_ai', 'ai_only', 'cfo_briefing')

    # ai_only / cfo_briefing modes are email-only — disk doesn't make sense
    if cleaned['content_mode'] in ('ai_only', 'cfo_briefing') and cleaned['delivery_method'] == 'disk':
        return None, "AI-only and CFO briefing modes require email delivery"

    return cleaned, None


def _rebuild_scheduler():
    """Trigger scheduler rebuild after rule changes."""
    try:
        import sys
        if 'scheduler' in sys.modules:
            scheduler_mod = sys.modules['scheduler']
            rebuild = getattr(scheduler_mod, 'rebuild_scheduler_jobs', None)
            if rebuild:
                rebuild()
    except Exception as e:
        logger.warning(f"Could not rebuild scheduler: {e}")


def _serialize_row(row):
    """Serialize a DB row dict for JSON response."""
    row = dict(row)
    for key in ('created_at', 'updated_at', 'last_run_at'):
        if row.get(key) and hasattr(row[key], 'isoformat'):
            row[key] = row[key].isoformat()
    if row.get('schedule_time') and hasattr(row['schedule_time'], 'isoformat'):
        row['schedule_time'] = row['schedule_time'].strftime('%H:%M')
    if isinstance(row.get('recipients'), str):
        row['recipients'] = json.loads(row['recipients'])
    if isinstance(row.get('report_ids'), str):
        row['report_ids'] = json.loads(row['report_ids'])
    if isinstance(row.get('report_details'), str):
        row['report_details'] = json.loads(row['report_details'])
    # Ensure report_ids is always an array
    if not row.get('report_ids') or row['report_ids'] == []:
        rid = row.get('report_id')
        if rid and rid > 0:
            row['report_ids'] = [rid]
    return row


# ---------------------------------------------------------------------------
# GET /api/distribution/rules — List all rules (with report name)
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules', methods=['GET'])
@login_required
def list_rules():
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT r.*,
                       COALESCE(
                         (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name))
                          FROM report_builder_templates t
                          WHERE t.id IN (SELECT (jsonb_array_elements_text(
                            CASE WHEN r.report_ids IS NOT NULL AND r.report_ids != '[]'::jsonb
                                 THEN r.report_ids
                                 ELSE jsonb_build_array(r.report_id)
                            END
                          ))::int)),
                         '[]'::jsonb
                       ) AS report_details
                FROM distribution_rules r
                ORDER BY r.created_at DESC
            """)
            rows = cursor.fetchall()

        return jsonify({'status': 'success', 'data': [_serialize_row(r) for r in rows]})
    except Exception as e:
        logger.error(f"Error listing distribution rules: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


# ---------------------------------------------------------------------------
# POST /api/distribution/rules — Create a rule
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules', methods=['POST'])
@login_required
def create_rule():
    try:
        _ensure_table()
        data = request.get_json(silent=True) or {}
        cleaned, error = _validate_rule(data)
        if error:
            return jsonify({'status': 'error', 'message': error}), 400

        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO distribution_rules
                    (name, report_id, report_ids, delivery_method, recipients, save_path,
                     format, schedule_type, schedule_time, schedule_day_of_week,
                     schedule_day_of_month, enabled, include_ai_summary, content_mode)
                VALUES (%s, %s, %s::jsonb, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                cleaned['name'], cleaned['report_id'],
                json.dumps(cleaned['report_ids']),
                cleaned['delivery_method'],
                json.dumps(cleaned['recipients']), cleaned['save_path'],
                cleaned['format'], cleaned['schedule_type'], cleaned['schedule_time'],
                cleaned['schedule_day_of_week'], cleaned['schedule_day_of_month'],
                cleaned['enabled'], cleaned['include_ai_summary'],
                cleaned['content_mode'],
            ))
            row = cursor.fetchone()
            actual_conn.commit()

        _rebuild_scheduler()
        return jsonify({'status': 'success', 'data': _serialize_row(row)}), 201
    except Exception as e:
        logger.error(f"Error creating distribution rule: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


# ---------------------------------------------------------------------------
# PUT /api/distribution/rules/<id> — Update a rule
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules/<int:rule_id>', methods=['PUT'])
@login_required
def update_rule(rule_id):
    try:
        _ensure_table()
        data = request.get_json(silent=True) or {}
        cleaned, error = _validate_rule(data)
        if error:
            return jsonify({'status': 'error', 'message': error}), 400

        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                UPDATE distribution_rules SET
                    name = %s, report_id = %s, report_ids = %s::jsonb,
                    delivery_method = %s,
                    recipients = %s::jsonb, save_path = %s, format = %s,
                    schedule_type = %s, schedule_time = %s,
                    schedule_day_of_week = %s, schedule_day_of_month = %s,
                    enabled = %s, include_ai_summary = %s, content_mode = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *
            """, (
                cleaned['name'], cleaned['report_id'],
                json.dumps(cleaned['report_ids']),
                cleaned['delivery_method'],
                json.dumps(cleaned['recipients']), cleaned['save_path'],
                cleaned['format'], cleaned['schedule_type'], cleaned['schedule_time'],
                cleaned['schedule_day_of_week'], cleaned['schedule_day_of_month'],
                cleaned['enabled'], cleaned['include_ai_summary'],
                cleaned['content_mode'], rule_id,
            ))
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': 'Rule not found'}), 404
            actual_conn.commit()

        _rebuild_scheduler()
        return jsonify({'status': 'success', 'data': _serialize_row(row)})
    except Exception as e:
        logger.error(f"Error updating distribution rule: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


# ---------------------------------------------------------------------------
# DELETE /api/distribution/rules/<id> — Delete a rule
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules/<int:rule_id>', methods=['DELETE'])
@login_required
def delete_rule(rule_id):
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute(
                "DELETE FROM distribution_rules WHERE id = %s RETURNING id",
                (rule_id,)
            )
            deleted = cursor.fetchone()
            actual_conn.commit()

        if not deleted:
            return jsonify({'status': 'error', 'message': 'Rule not found'}), 404

        _rebuild_scheduler()
        return jsonify({'status': 'success', 'message': 'Rule deleted'})
    except Exception as e:
        logger.error(f"Error deleting distribution rule: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


# ---------------------------------------------------------------------------
# POST /api/distribution/rules/<id>/run — Manual trigger
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules/<int:rule_id>/run', methods=['POST'])
@login_required
def run_rule(rule_id):
    try:
        from distribution_engine import execute_distribution_rule
        result = execute_distribution_rule(rule_id)
        if result.get('success'):
            return jsonify({'status': 'success', 'message': result.get('message', 'Report delivered')})
        else:
            return jsonify({'status': 'error', 'message': result.get('error', 'Execution failed')}), 500
    except Exception as e:
        logger.error(f"Error running distribution rule {rule_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Execution failed'}), 500


# ---------------------------------------------------------------------------
# GET /api/distribution/browse-folders — Browse server directories
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/browse-folders', methods=['GET'])
@login_required
def browse_folders():
    """List folders on the server for the disk-save path picker."""
    requested = request.args.get('path', '')

    # Default: show drive roots on Windows, / on Linux
    if not requested:
        if os.name == 'nt':
            import string
            drives = []
            for letter in string.ascii_uppercase:
                drive = f'{letter}:\\'
                if os.path.isdir(drive):
                    drives.append({'name': f'{letter}:', 'path': drive})
            return jsonify({'status': 'success', 'current': '', 'parent': '', 'folders': drives})
        else:
            requested = '/'

    requested = os.path.realpath(requested)
    if not os.path.isdir(requested):
        return jsonify({'status': 'error', 'message': f'Directory not found: {requested}'}), 400

    # Block access to sensitive system directories
    if os.name == 'nt':
        _blocked = [
            os.environ.get('SYSTEMROOT', r'C:\Windows').lower(),
            os.environ.get('PROGRAMFILES', r'C:\Program Files').lower(),
            os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)').lower(),
        ]
        req_lower = requested.lower()
        for blocked in _blocked:
            if req_lower.startswith(blocked):
                return jsonify({'status': 'error', 'message': 'Access to this directory is restricted'}), 403
        # Block AppData directories
        if '\\appdata\\' in req_lower:
            return jsonify({'status': 'error', 'message': 'Access to this directory is restricted'}), 403

    parent = os.path.dirname(requested)
    if parent == requested:
        parent = ''  # at root

    try:
        entries = []
        for entry in sorted(os.scandir(requested), key=lambda e: e.name.lower()):
            if entry.is_dir():
                try:
                    # Skip dirs we can't read
                    os.listdir(entry.path)
                    entries.append({'name': entry.name, 'path': entry.path})
                except PermissionError:
                    pass
        return jsonify({
            'status': 'success',
            'current': requested,
            'parent': parent,
            'folders': entries,
        })
    except PermissionError:
        return jsonify({'status': 'error', 'message': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# GET /api/distribution/rules/<id>/log — Execution history for a rule
# ---------------------------------------------------------------------------
@distribution_bp.route('/distribution/rules/<int:rule_id>/log', methods=['GET'])
@login_required
def get_rule_execution_log(rule_id):
    """Return execution history for a distribution rule."""
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, rule_id, report_ids, executed_at, time_range_from, time_range_to,
                       format, delivery_method, recipients, status, error_message, file_names
                FROM report_execution_log
                WHERE rule_id = %s
                ORDER BY executed_at DESC
                LIMIT 50
            """, (rule_id,))
            rows = cursor.fetchall()
            for row in rows:
                if isinstance(row.get('report_ids'), str):
                    row['report_ids'] = json.loads(row['report_ids'])
                if isinstance(row.get('recipients'), str):
                    row['recipients'] = json.loads(row['recipients'])
                if isinstance(row.get('file_names'), str):
                    row['file_names'] = json.loads(row['file_names'])
                if row.get('executed_at'):
                    row['executed_at'] = row['executed_at'].isoformat()
                if row.get('time_range_from'):
                    row['time_range_from'] = row['time_range_from'].isoformat()
                if row.get('time_range_to'):
                    row['time_range_to'] = row['time_range_to'].isoformat()
            return jsonify({'status': 'success', 'data': rows})
    except Exception as e:
        logger.error(f"Error fetching execution log: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to fetch execution log'}), 500
