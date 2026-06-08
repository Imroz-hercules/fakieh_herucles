"""
Settings blueprint
==================
Email-configuration endpoints (PostgreSQL-backed). Lets the UI choose between
a custom SMTP server and the Resend cloud API, and send a test message.
"""

import logging
from flask import Blueprint, jsonify, request

import smtp_config

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__, url_prefix='/api/settings')


@settings_bp.route('/smtp-config', methods=['GET'])
def get_smtp_config_route():
    try:
        cfg = smtp_config.get_smtp_config(mask_secrets=True)
        return jsonify({'status': 'success', 'data': cfg})
    except Exception as e:
        logger.error('Error reading smtp config: %s', e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to read email configuration'}), 500


@settings_bp.route('/smtp-config', methods=['POST'])
def set_smtp_config_route():
    try:
        data = request.get_json(silent=True) or {}
        if data.get('send_method') not in ('smtp', 'resend'):
            return jsonify({'status': 'error', 'message': 'send_method must be smtp or resend'}), 400
        saved = smtp_config.set_smtp_config(data)
        # Re-mask secrets before returning
        if saved.get('password'):
            saved['password'] = smtp_config.MASKED_PASSWORD
        if saved.get('resend_api_key'):
            saved['resend_api_key'] = smtp_config.MASKED_PASSWORD
        return jsonify({'status': 'success', 'data': saved})
    except Exception as e:
        logger.error('Error saving smtp config: %s', e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to save email configuration'}), 500


@settings_bp.route('/smtp-test', methods=['POST'])
def smtp_test_route():
    try:
        data = request.get_json(silent=True) or {}
        to_email = (data.get('to_email') or '').strip()
        if not to_email:
            cfg = smtp_config.get_smtp_config()
            to_email = (cfg.get('recipient') or '').strip()
        result = smtp_config.test_email(to_email)
        if result.get('success'):
            return jsonify({'status': 'success', 'message': f'Test email sent to {to_email}'})
        return jsonify({'status': 'error', 'message': result.get('error', 'Test failed')}), 500
    except Exception as e:
        logger.error('Error sending test email: %s', e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to send test email'}), 500
