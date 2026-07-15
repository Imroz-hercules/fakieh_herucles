"""Business timezone helpers — DB stores UTC; UI uses Asia/Riyadh (UTC+3)."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Asia/Riyadh")
UTC = timezone.utc

# AST = UTC+3; production day starts 07:00 AST = 04:00 UTC.
# CAST(DATEADD(hour, -4, utc_col) AS DATE) yields the Saudi production-day label.
PRODUCTION_DAY_UTC_OFFSET_HOURS = -4


def parse_request_datetime(value: str) -> datetime:
    """Parse client ISO datetime to naive UTC for DB columns stored as UTC."""
    if not value:
        raise ValueError("empty datetime")
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(value.strip(), fmt)
                break
            except ValueError:
                continue
        else:
            raise
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def saudi_local_to_utc_naive(year: int, month: int, day: int, hour: int = 7, minute: int = 0) -> datetime:
    """Convert a Saudi local wall time to naive UTC (for SQL Server UTC columns)."""
    local = datetime(year, month, day, hour, minute, tzinfo=BUSINESS_TZ)
    return local.astimezone(UTC).replace(tzinfo=None)


def production_day_bounds_utc(date_str: str) -> tuple[datetime, datetime]:
    """Half-open UTC window for production day D: D 07:00 AST → D+1 07:00 AST."""
    d = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    start = saudi_local_to_utc_naive(d.year, d.month, d.day, 7, 0)
    end = start + timedelta(days=1)
    return start, end


def parse_calendar_range(start_str: str, end_str: str) -> tuple[datetime, datetime]:
    """Parse calendar filter to UTC half-open [start, end).

    - Date-only YYYY-MM-DD: start = that day 07:00 AST; end = (day+1) 07:00 AST
      so a selected end date includes that full production day.
    - datetime-local (no TZ): treated as Saudi wall time.
    - ISO with Z / offset: converted to UTC.
    """
    def _parse_bound(value: str, *, is_end: bool) -> datetime:
        s = value.strip()
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            d = datetime.strptime(s, "%Y-%m-%d").date()
            start = saudi_local_to_utc_naive(d.year, d.month, d.day, 7, 0)
            return start + timedelta(days=1) if is_end else start
        # datetime-local without TZ: treat as Saudi wall time
        if "T" in s and not (s.endswith("Z") or "+" in s[10:] or s.count("-") > 2):
            naive = datetime.fromisoformat(s)
            local = naive.replace(tzinfo=BUSINESS_TZ)
            return local.astimezone(UTC).replace(tzinfo=None)
        return parse_request_datetime(s)

    return _parse_bound(start_str, is_end=False), _parse_bound(end_str, is_end=True)


def parse_request_datetime_optional(start_str: str | None, end_str: str | None) -> tuple[datetime | None, datetime | None]:
    start = parse_request_datetime(start_str) if start_str else None
    end = parse_request_datetime(end_str) if end_str else None
    return start, end


def format_db_datetime_utc_iso(dt: datetime | None) -> str | None:
    """Serialize naive UTC DB datetime as ISO-8601 with Z suffix."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def format_saudi_display(dt: datetime | None, include_seconds: bool = True) -> str:
    """Format naive UTC DB datetime for Saudi display."""
    if dt is None:
        return "N/A"
    aware = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    local = aware.astimezone(BUSINESS_TZ)
    if include_seconds:
        return local.strftime("%m/%d/%Y, %I:%M:%S %p")
    return local.strftime("%m/%d/%Y, %I:%M %p")
