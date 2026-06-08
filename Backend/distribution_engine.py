"""
Distribution engine
====================
Executes a distribution rule: pull rows from the selected report tables for
the schedule's time window, render each into the chosen format(s)
(PDF / XLSX / CSV), and deliver via email and/or disk.

Data sources:
  * PostgreSQL (SQLAlchemy) — daily/weekly/monthly/detailed/material reports.
  * SQL Server (read-only)  — batch materials.
All rule/state writes go to PostgreSQL only.
"""

import io
import csv
import os
import logging
from datetime import datetime, timedelta
from html import escape

from models import db
from models.distribution import DistributionRule
from models.reports import (
    DailyReport, WeeklyReport, MonthlyReport,
    DetailedReport, MaterialConsumptionReport,
)
import smtp_config

logger = logging.getLogger(__name__)

DEFAULT_SAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'distribution_output')


# ── Report catalog ────────────────────────────────────────────────────────────
# key -> metadata. ``source`` is informational for the UI.
REPORT_CATALOG = [
    {'key': 'daily', 'label': 'Daily Reports', 'description': 'Per-day production summary', 'source': 'postgres'},
    {'key': 'weekly', 'label': 'Weekly Reports', 'description': 'Weekly production summary', 'source': 'postgres'},
    {'key': 'monthly', 'label': 'Monthly Reports', 'description': 'Monthly production summary', 'source': 'postgres'},
    {'key': 'detailed', 'label': 'Detailed Reports', 'description': 'Per-batch material detail', 'source': 'postgres'},
    {'key': 'material', 'label': 'Material Consumption', 'description': 'Planned vs actual material usage', 'source': 'postgres'},
    {'key': 'batch_historical', 'label': 'Batch Historical Reports', 'description': 'Batch materials (SQL Server, read-only)', 'source': 'sqlserver'},
    {'key': 'batch_raw', 'label': 'Batch Raw Data', 'description': 'Raw batch material rows (SQL Server, read-only)', 'source': 'sqlserver'},
]

VALID_SOURCE_KEYS = {c['key'] for c in REPORT_CATALOG}


def get_report_catalog():
    return REPORT_CATALOG


def _time_range_for_schedule(schedule_type):
    """Rolling window: daily=1d, weekly=7d, monthly=31d."""
    now = datetime.now()
    days = {'daily': 1, 'weekly': 7, 'monthly': 31}.get(schedule_type, 1)
    return now - timedelta(days=days), now


# ── Data fetchers — return (columns, rows) where rows is list[dict] ────────────

def _fetch_postgres(model, date_attr, columns, from_dt, to_dt, default_order):
    query = model.query
    if date_attr is not None:
        query = query.filter(getattr(model, date_attr) >= from_dt.date())
    if isinstance(default_order, tuple):
        query = query.order_by(*default_order)
    else:
        query = query.order_by(default_order)
    rows = query.limit(5000).all()
    return columns, [r.to_dict() for r in rows]


def _fetch_batch_materials(from_dt, to_dt, limit=2000):
    """Read-only query against SQL Server batch materials."""
    from sqlalchemy import text
    sql = text(
        """
        SELECT
            [Source Server], [OrderID], [Batch Name], [Product Name],
            [Batch Act Start], [Batch Act End], [Quantity],
            [Material Name], [Material Code], [SetPoint Float], [Actual Value Float]
        FROM [ASMBatchReports].[dbo].[BatchMaterials]
        WHERE [Batch Act Start] >= :from_dt
        ORDER BY [Batch Act Start] DESC
        OFFSET 0 ROWS FETCH NEXT :lim ROWS ONLY
        """
    )
    engine = db.get_engine(bind='sqlserver')
    with engine.connect() as conn:
        result = conn.execute(sql, {'from_dt': from_dt, 'lim': limit})
        columns = list(result.keys())
        raw = result.fetchall()
    rows = []
    for r in raw:
        d = {}
        for i, col in enumerate(columns):
            val = r[i]
            d[col] = val.isoformat() if hasattr(val, 'isoformat') else val
        rows.append(d)
    return columns, rows


def _fetch_source(source_key, from_dt, to_dt):
    """Dispatch a catalog key to its data fetcher. Returns (columns, rows)."""
    if source_key == 'daily':
        return _fetch_postgres(
            DailyReport, 'report_date',
            ['reportDate', 'productName', 'noOfBatches', 'sumSP', 'sumAct', 'errKg', 'errPercent', 'shift', 'facilityId'],
            from_dt, to_dt, DailyReport.report_date.desc())
    if source_key == 'weekly':
        return _fetch_postgres(
            WeeklyReport, 'week_start_date',
            ['weekStartDate', 'weekEndDate', 'productName', 'noOfBatches', 'sumSP', 'sumAct', 'errKg', 'errPercent', 'facilityId'],
            from_dt, to_dt, WeeklyReport.week_start_date.desc())
    if source_key == 'monthly':
        return _fetch_postgres(
            MonthlyReport, None,
            ['year', 'month', 'productName', 'noOfBatches', 'sumSP', 'sumAct', 'errKg', 'errPercent', 'facilityId'],
            from_dt, to_dt, (MonthlyReport.year.desc(), MonthlyReport.month.desc()))
    if source_key == 'detailed':
        return _fetch_postgres(
            DetailedReport, 'report_date',
            ['reportDate', 'batch', 'materialName', 'code', 'setPoint', 'actual', 'errKg', 'errPercent', 'operator', 'supplier'],
            from_dt, to_dt, DetailedReport.report_date.desc())
    if source_key == 'material':
        return _fetch_postgres(
            MaterialConsumptionReport, 'report_date',
            ['reportDate', 'materialName', 'code', 'plannedKg', 'actualKg', 'differencePercent', 'supplier', 'batchId'],
            from_dt, to_dt, MaterialConsumptionReport.report_date.desc())
    if source_key in ('batch_historical', 'batch_raw'):
        return _fetch_batch_materials(from_dt, to_dt)
    raise ValueError(f'Unknown report source: {source_key}')


def _label_for(source_key):
    for c in REPORT_CATALOG:
        if c['key'] == source_key:
            return c['label']
    return source_key


# ── Renderers — each returns bytes ─────────────────────────────────────────────

def _render_csv(columns, rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow({c: row.get(c, '') for c in columns})
    return buf.getvalue().encode('utf-8-sig')


def _render_xlsx(title, columns, rows):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = (title or 'Report')[:31]

    header_fill = PatternFill(start_color='0F766E', end_color='0F766E', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')
    for col_idx, col in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col)
        cell.fill = header_fill
        cell.font = header_font
    for row_idx, row in enumerate(rows, start=2):
        for col_idx, col in enumerate(columns, start=1):
            ws.cell(row=row_idx, column=col_idx, value=row.get(col, ''))
    for col_idx, col in enumerate(columns, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(12, min(40, len(str(col)) + 4))

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _render_pdf(title, columns, rows):
    from xhtml2pdf import pisa

    head = ''.join(f'<th>{escape(str(c))}</th>' for c in columns)
    body_rows = []
    for row in rows:
        cells = ''.join(f'<td>{escape(str(row.get(c, "")))}</td>' for c in columns)
        body_rows.append(f'<tr>{cells}</tr>')
    html = f"""
    <html><head><style>
      body {{ font-family: Helvetica, Arial, sans-serif; font-size: 8px; color: #111; }}
      h2 {{ color: #0f766e; font-size: 14px; }}
      table {{ width: 100%; border-collapse: collapse; }}
      th {{ background: #0f766e; color: #fff; padding: 4px; text-align: left; }}
      td {{ border-bottom: 1px solid #ddd; padding: 3px 4px; }}
    </style></head><body>
      <h2>{escape(str(title))}</h2>
      <p>Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} — {len(rows)} rows</p>
      <table><thead><tr>{head}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>
    </body></html>
    """
    out = io.BytesIO()
    result = pisa.CreatePDF(io.StringIO(html), dest=out)
    if result.err:
        raise RuntimeError('PDF generation failed')
    return out.getvalue()


def _render(fmt, title, columns, rows):
    if fmt == 'csv':
        return _render_csv(columns, rows)
    if fmt == 'xlsx':
        return _render_xlsx(title, columns, rows)
    if fmt == 'pdf':
        return _render_pdf(title, columns, rows)
    raise ValueError(f'Unknown format: {fmt}')


def _build_email_html(rule_name, sources, from_dt, to_dt, file_names):
    items = ''.join(f'<li>{escape(fn)}</li>' for fn in file_names)
    src_labels = ', '.join(_label_for(s) for s in sources)
    return f"""
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      <h2 style="color:#0f766e">{escape(rule_name or 'Scheduled Report')}</h2>
      <p>Attached are your scheduled reports.</p>
      <p><b>Reports:</b> {escape(src_labels)}<br>
         <b>Period:</b> {from_dt.strftime('%Y-%m-%d %H:%M')} → {to_dt.strftime('%Y-%m-%d %H:%M')}</p>
      <p><b>Files:</b></p>
      <ul>{items}</ul>
      <hr><p style="color:#888;font-size:12px">Fakieh Reporting — automated distribution.</p>
    </div>
    """


def _save_to_disk(save_path, filename, content_bytes):
    target_dir = save_path.strip() if save_path and save_path.strip() else DEFAULT_SAVE_DIR
    os.makedirs(target_dir, exist_ok=True)
    resolved = os.path.realpath(os.path.join(target_dir, filename))
    with open(resolved, 'wb') as f:
        f.write(content_bytes)
    return resolved


# ── Main entry point ────────────────────────────────────────────────────────

def execute_distribution_rule(rule_id):
    """Execute one rule. Returns {'success': bool, 'message'|'error': str}."""
    rule = DistributionRule.query.get(rule_id)
    if not rule:
        return {'success': False, 'error': f'Rule {rule_id} not found'}

    sources = [s for s in (rule.report_sources or []) if s in VALID_SOURCE_KEYS]
    formats = [f for f in (rule.formats or []) if f in ('pdf', 'xlsx', 'csv')]
    if not sources:
        return {'success': False, 'error': 'No valid report sources configured'}
    if not formats:
        return {'success': False, 'error': 'No output formats selected'}

    try:
        from_dt, to_dt = _time_range_for_schedule(rule.schedule_type)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M')
        attachments = []  # (filename, bytes)

        for source_key in sources:
            columns, rows = _fetch_source(source_key, from_dt, to_dt)
            title = _label_for(source_key)
            for fmt in formats:
                content = _render(fmt, title, columns, rows)
                filename = f'{source_key}_{timestamp}.{fmt}'
                attachments.append((filename, content))

        file_names = [fn for fn, _ in attachments]
        delivery = rule.delivery_method or 'email'
        messages = []

        if delivery in ('email', 'both'):
            recipients = rule.recipients or []
            if not recipients:
                raise ValueError('Email delivery selected but no recipients configured')
            subject = f"{rule.name or 'Scheduled Report'} — {datetime.now().strftime('%Y-%m-%d')}"
            body = _build_email_html(rule.name, sources, from_dt, to_dt, file_names)
            res = smtp_config.send_email(recipients, subject, body, attachments=attachments)
            if not res.get('success'):
                raise RuntimeError(res.get('error', 'Email send failed'))
            messages.append(f'emailed {len(recipients)} recipient(s)')

        if delivery in ('disk', 'both'):
            saved = [_save_to_disk(rule.save_path, fn, content) for fn, content in attachments]
            messages.append(f'saved {len(saved)} file(s) to disk')

        rule.last_run_at = datetime.utcnow()
        rule.last_run_status = 'success'
        rule.last_run_error = None
        db.session.commit()
        return {'success': True, 'message': 'Report delivered: ' + ', '.join(messages)}

    except Exception as e:
        logger.error('Error executing distribution rule %s: %s', rule_id, e, exc_info=True)
        try:
            rule.last_run_at = datetime.utcnow()
            rule.last_run_status = 'error'
            rule.last_run_error = str(e)
            db.session.commit()
        except Exception:
            db.session.rollback()
        return {'success': False, 'error': str(e)}
