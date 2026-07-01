"""Business timezone helpers — DB stores UTC; UI uses Asia/Riyadh (UTC+3)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Asia/Riyadh")
UTC = timezone.utc


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
