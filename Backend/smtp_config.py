"""
Email configuration + sending
==============================
Persists the email-delivery configuration in PostgreSQL (``system_settings``
key = ``smtp_config``) and sends mail via either a custom SMTP server or the
Resend cloud API. Used by the distribution engine and the settings routes.

SQL Server is never touched here — all CRUD is PostgreSQL via SQLAlchemy.
"""

import logging
import smtplib
import mimetypes
from email.message import EmailMessage

from models import db
from models.distribution import SystemSetting

logger = logging.getLogger(__name__)

SETTING_KEY = 'smtp_config'
MASKED_PASSWORD = '********'

# Fixed cloud (Resend) sender — matches the original Hercules Cloud Email.
# The cloud option always sends "from" this address; users only add recipients.
RESEND_FROM = 'Hercules Reports <reports@herculesv2.app>'

DEFAULT_CONFIG = {
    'send_method': 'smtp',      # 'smtp' | 'resend'
    'smtp_server': '',
    'smtp_port': 587,
    'username': '',
    'password': '',
    'from_address': '',
    'use_tls': True,
    'resend_api_key': '',
    'resend_from': RESEND_FROM,  # display-only; sending always uses RESEND_FROM
    'recipient': '',            # default / test recipient
}


def get_smtp_config(mask_secrets=False):
    """Return the saved email config merged over defaults.

    When ``mask_secrets`` is True, the password and Resend API key are
    replaced with a masked placeholder (for sending to the frontend).
    """
    cfg = dict(DEFAULT_CONFIG)
    try:
        row = SystemSetting.query.filter_by(key=SETTING_KEY).first()
        if row and isinstance(row.value, dict):
            cfg.update(row.value)
    except Exception as e:
        logger.warning("Could not load smtp_config from DB: %s", e)

    # The cloud sender is fixed and never user-editable.
    cfg['resend_from'] = RESEND_FROM

    if mask_secrets:
        if cfg.get('password'):
            cfg['password'] = MASKED_PASSWORD
        if cfg.get('resend_api_key'):
            cfg['resend_api_key'] = MASKED_PASSWORD
    return cfg


def set_smtp_config(data):
    """Persist the email config. Masked secrets are merged from the saved row
    so the frontend never has to round-trip the real secret values."""
    current = get_smtp_config(mask_secrets=False)
    merged = dict(current)

    for key in DEFAULT_CONFIG:
        if key in data:
            merged[key] = data[key]

    # Keep existing secrets if the client sent the masked placeholder.
    if data.get('password') in (None, '', MASKED_PASSWORD):
        merged['password'] = current.get('password', '')
    if data.get('resend_api_key') in (None, '', MASKED_PASSWORD):
        merged['resend_api_key'] = current.get('resend_api_key', '')

    try:
        merged['smtp_port'] = int(merged.get('smtp_port') or 587)
    except (TypeError, ValueError):
        merged['smtp_port'] = 587

    row = SystemSetting.query.filter_by(key=SETTING_KEY).first()
    if row:
        row.value = merged
    else:
        row = SystemSetting(key=SETTING_KEY, value=merged)
        db.session.add(row)
    db.session.commit()
    return merged


# ── Senders ──────────────────────────────────────────────────────────────────

def send_email_resend(recipients, subject, body_html, attachments=None, cfg=None):
    """Send via the Resend cloud API. ``attachments`` = list of (filename, bytes)."""
    cfg = cfg or get_smtp_config()
    api_key = cfg.get('resend_api_key')
    if not api_key:
        return {'success': False, 'error': 'No Resend API key configured'}

    # Cloud email always sends from the fixed Hercules sender address.
    sender = RESEND_FROM
    try:
        import resend
        import base64
    except ImportError:
        return {'success': False, 'error': "'resend' package not installed"}

    resend.api_key = api_key
    params = {
        'from': sender,
        'to': recipients,
        'subject': subject,
        'html': body_html,
    }
    if attachments:
        params['attachments'] = [
            {'filename': fn, 'content': base64.b64encode(content).decode('ascii')}
            for fn, content in attachments
        ]
    try:
        resend.Emails.send(params)
        return {'success': True}
    except Exception as e:
        logger.error("Resend send failed: %s", e)
        return {'success': False, 'error': str(e)}


def send_email_smtp(recipients, subject, body_html, attachments=None, cfg=None):
    """Send via a custom SMTP server. ``attachments`` = list of (filename, bytes)."""
    cfg = cfg or get_smtp_config()
    if not cfg.get('smtp_server'):
        return {'success': False, 'error': 'No SMTP server configured'}

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = cfg.get('from_address') or cfg.get('username', '')
    msg['To'] = ', '.join(recipients)
    msg.set_content('Please find the attached report(s).\n')
    msg.add_alternative(body_html, subtype='html')

    if attachments:
        for filename, content_bytes in attachments:
            mime_type, _ = mimetypes.guess_type(filename)
            maintype, subtype = (mime_type.split('/', 1) if mime_type else ('application', 'octet-stream'))
            msg.add_attachment(content_bytes, maintype=maintype, subtype=subtype, filename=filename)

    port = int(cfg.get('smtp_port') or 587)
    server = cfg['smtp_server']
    username = cfg.get('username') or ''
    password = cfg.get('password') or ''
    use_tls = bool(cfg.get('use_tls', True))

    try:
        if port == 465:
            with smtplib.SMTP_SSL(server, port, timeout=30) as srv:
                if username:
                    srv.login(username, password)
                srv.send_message(msg)
        else:
            with smtplib.SMTP(server, port, timeout=30) as srv:
                if use_tls:
                    srv.starttls()
                if username:
                    srv.login(username, password)
                srv.send_message(msg)
        return {'success': True}
    except Exception as e:
        logger.error("SMTP send failed: %s", e)
        return {'success': False, 'error': str(e)}


def send_email(recipients, subject, body_html, attachments=None):
    """Send mail using whichever method is configured."""
    cfg = get_smtp_config()
    if cfg.get('send_method') == 'resend':
        return send_email_resend(recipients, subject, body_html, attachments, cfg=cfg)
    return send_email_smtp(recipients, subject, body_html, attachments, cfg=cfg)


def test_email(to_email):
    """Send a small test message to confirm the configuration works."""
    if not to_email:
        return {'success': False, 'error': 'A test recipient is required'}
    body = (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">'
        '<h2>Fakieh Reports — test email</h2>'
        '<p>Your email configuration is working correctly.</p>'
        '</div>'
    )
    return send_email([to_email], 'Fakieh Reports — Test Email', body)
