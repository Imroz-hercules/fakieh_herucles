"""
Distribution rules blueprint
============================
CRUD for report-distribution rules (PostgreSQL only) plus the report catalog,
manual "Run now", and a server folder browser for disk delivery.
"""

import os
import re
import logging
from datetime import datetime, time

from flask import Blueprint, jsonify, request

from models import db
from models.distribution import DistributionRule

logger = logging.getLogger(__name__)

distribution_bp = Blueprint('distribution', __name__, url_prefix='/api/distribution')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
VALID_FORMATS = ('pdf', 'xlsx', 'csv')


def _rebuild_scheduler():
    try:
        import sys
        if 'scheduler' in sys.modules:
            rebuild = getattr(sys.modules['scheduler'], 'rebuild_scheduler_jobs', None)
            if rebuild:
                rebuild()
    except Exception as e:
        logger.warning('Could not rebuild scheduler: %s', e)


def _validate(data):
    """Validate + clean rule payload. Returns (cleaned, error_msg)."""
    from distribution_engine import VALID_SOURCE_KEYS
    errors = []

    sources = data.get('report_sources') or []
    if not isinstance(sources, list) or not sources:
        errors.append('At least one report source is required')
        sources = []
    else:
        sources = [s for s in sources if s in VALID_SOURCE_KEYS]
        if not sources:
            errors.append('No valid report sources selected')

    formats = data.get('formats') or []
    if not isinstance(formats, list) or not formats:
        errors.append('At least one format is required')
        formats = []
    else:
        formats = [f for f in formats if f in VALID_FORMATS]
        if not formats:
            errors.append('No valid formats selected')

    delivery = data.get('delivery_method', 'email')
    if delivery not in ('email', 'disk', 'both'):
        errors.append('delivery_method must be email, disk, or both')

    recipients = data.get('recipients') or []
    if delivery in ('email', 'both'):
        if not isinstance(recipients, list) or not recipients:
            errors.append('At least one recipient is required for email delivery')
        else:
            for addr in recipients:
                if not EMAIL_RE.match(str(addr)):
                    errors.append(f'Invalid email address: {addr}')

    save_path = data.get('save_path', '') or ''
    if delivery in ('disk', 'both') and not save_path.strip():
        errors.append('save_path is required for disk delivery')

    schedule_type = data.get('schedule_type', 'daily')
    if schedule_type not in ('daily', 'weekly', 'monthly'):
        errors.append('schedule_type must be daily, weekly, or monthly')

    schedule_time = str(data.get('schedule_time', '08:00'))
    if not re.match(r'^\d{1,2}:\d{2}$', schedule_time):
        errors.append('schedule_time must be in HH:MM format')

    dow = data.get('schedule_day_of_week')
    if schedule_type == 'weekly':
        try:
            dow = int(dow)
            if not (0 <= dow <= 6):
                errors.append('schedule_day_of_week must be 0 (Mon) to 6 (Sun)')
        except (TypeError, ValueError):
            errors.append('schedule_day_of_week is required for weekly schedules')
    else:
        dow = int(dow) if dow not in (None, '') else None

    dom = data.get('schedule_day_of_month')
    if schedule_type == 'monthly':
        try:
            dom = int(dom)
            if not (1 <= dom <= 28):
                errors.append('schedule_day_of_month must be 1 to 28')
        except (TypeError, ValueError):
            errors.append('schedule_day_of_month is required for monthly schedules')
    else:
        dom = int(dom) if dom not in (None, '') else None

    # ── Data window (independent of the send trigger above) ──
    window_mode = data.get('window_mode', 'auto')
    if window_mode not in ('auto', 'custom'):
        errors.append('window_mode must be auto or custom')

    def _parse_time(value, default='07:00'):
        s = str(value or default)
        if not re.match(r'^\d{1,2}:\d{2}$', s):
            return None
        h, m = s.split(':')
        return time(int(h), int(m))

    window_start_time = _parse_time(data.get('window_start_time', '07:00'))
    window_end_time = _parse_time(data.get('window_end_time', '07:00'))
    if window_start_time is None or window_end_time is None:
        errors.append('window_start_time / window_end_time must be in HH:MM format')

    custom_start = custom_end = None
    if window_mode == 'custom':
        cs = data.get('custom_start')
        ce = data.get('custom_end')
        try:
            custom_start = datetime.fromisoformat(str(cs).replace('Z', '')) if cs else None
            custom_end = datetime.fromisoformat(str(ce).replace('Z', '')) if ce else None
        except (TypeError, ValueError):
            errors.append('custom_start / custom_end must be valid date-times')
        if not custom_start or not custom_end:
            errors.append('Custom window requires both a start and end date-time')
        elif custom_start >= custom_end:
            errors.append('Custom window start must be before end')

    if errors:
        return None, '; '.join(errors)

    hh, mm = schedule_time.split(':')
    cleaned = {
        'name': (data.get('name') or '').strip(),
        'report_sources': sources,
        'formats': formats,
        'delivery_method': delivery,
        'recipients': recipients,
        'save_path': save_path,
        'schedule_type': schedule_type,
        'schedule_time': time(int(hh), int(mm)),
        'schedule_day_of_week': dow,
        'schedule_day_of_month': dom,
        'window_mode': window_mode,
        'window_start_time': window_start_time,
        'window_end_time': window_end_time,
        'custom_start': custom_start,
        'custom_end': custom_end,
        'enabled': bool(data.get('enabled', True)),
    }
    return cleaned, None


@distribution_bp.route('/report-catalog', methods=['GET'])
def report_catalog():
    from distribution_engine import get_report_catalog
    return jsonify({'status': 'success', 'data': get_report_catalog()})


@distribution_bp.route('/rules', methods=['GET'])
def list_rules():
    try:
        rules = DistributionRule.query.order_by(DistributionRule.created_at.desc()).all()
        return jsonify({'status': 'success', 'data': [r.to_dict() for r in rules]})
    except Exception as e:
        logger.error('Error listing rules: %s', e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


@distribution_bp.route('/rules', methods=['POST'])
def create_rule():
    try:
        cleaned, error = _validate(request.get_json(silent=True) or {})
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        rule = DistributionRule(**cleaned)
        db.session.add(rule)
        db.session.commit()
        _rebuild_scheduler()
        return jsonify({'status': 'success', 'data': rule.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        logger.error('Error creating rule: %s', e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


@distribution_bp.route('/rules/<int:rule_id>', methods=['PUT'])
def update_rule(rule_id):
    try:
        rule = DistributionRule.query.get(rule_id)
        if not rule:
            return jsonify({'status': 'error', 'message': 'Rule not found'}), 404
        cleaned, error = _validate(request.get_json(silent=True) or {})
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        for key, value in cleaned.items():
            setattr(rule, key, value)
        db.session.commit()
        _rebuild_scheduler()
        return jsonify({'status': 'success', 'data': rule.to_dict()})
    except Exception as e:
        db.session.rollback()
        logger.error('Error updating rule %s: %s', rule_id, e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


@distribution_bp.route('/rules/<int:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    try:
        rule = DistributionRule.query.get(rule_id)
        if not rule:
            return jsonify({'status': 'error', 'message': 'Rule not found'}), 404
        db.session.delete(rule)
        db.session.commit()
        _rebuild_scheduler()
        return jsonify({'status': 'success', 'message': 'Rule deleted'})
    except Exception as e:
        db.session.rollback()
        logger.error('Error deleting rule %s: %s', rule_id, e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'A database error occurred'}), 500


@distribution_bp.route('/rules/<int:rule_id>/run', methods=['POST'])
def run_rule(rule_id):
    try:
        from distribution_engine import execute_distribution_rule
        result = execute_distribution_rule(rule_id)
        if result.get('success'):
            return jsonify({'status': 'success', 'message': result.get('message', 'Report delivered')})
        return jsonify({'status': 'error', 'message': result.get('error', 'Execution failed')}), 500
    except Exception as e:
        logger.error('Error running rule %s: %s', rule_id, e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'Execution failed'}), 500


@distribution_bp.route('/browse-folders', methods=['GET'])
def browse_folders():
    """List server folders for the disk-save path picker."""
    requested = request.args.get('path', '')

    if not requested:
        if os.name == 'nt':
            import string
            drives = [{'name': f'{d}:', 'path': f'{d}:\\'} for d in string.ascii_uppercase if os.path.isdir(f'{d}:\\')]
            return jsonify({'status': 'success', 'current': '', 'parent': '', 'folders': drives})
        requested = '/'

    requested = os.path.realpath(requested)
    if not os.path.isdir(requested):
        return jsonify({'status': 'error', 'message': f'Directory not found: {requested}'}), 400

    if os.name == 'nt':
        req_lower = requested.lower()
        blocked = [
            os.environ.get('SYSTEMROOT', r'C:\Windows').lower(),
            os.environ.get('PROGRAMFILES', r'C:\Program Files').lower(),
            os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)').lower(),
        ]
        if any(req_lower.startswith(b) for b in blocked) or '\\appdata\\' in req_lower:
            return jsonify({'status': 'error', 'message': 'Access to this directory is restricted'}), 403

    parent = os.path.dirname(requested)
    if parent == requested:
        parent = ''
    try:
        folders = []
        for entry in sorted(os.scandir(requested), key=lambda e: e.name.lower()):
            if entry.is_dir():
                try:
                    os.listdir(entry.path)
                    folders.append({'name': entry.name, 'path': entry.path})
                except PermissionError:
                    pass
        return jsonify({'status': 'success', 'current': requested, 'parent': parent, 'folders': folders})
    except PermissionError:
        return jsonify({'status': 'error', 'message': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
