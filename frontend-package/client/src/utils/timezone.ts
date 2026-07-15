/** Business timezone — DB stores UTC; UI uses Asia/Riyadh (UTC+3). */
export const BUSINESS_TZ = 'Asia/Riyadh';

export interface SaudiDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function getSaudiPartsForInstant(instant: Date): SaudiDateParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function toDatetimeLocal(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

export function saudiLocalToUtcDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+03:00`);
}

export function saudiDatetimeLocalToUtcIso(datetimeLocal: string): string {
  if (!datetimeLocal) return '';
  const normalized = datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
  return new Date(`${normalized}+03:00`).toISOString();
}

/**
 * UTC midnight–end calendar-day bounds (legacy).
 * Prefer Saudi 07:00→07:00 production days for Batch Calendar / reports.
 */
export function utcCalendarDayRange(dateOrDatetimeLocal: string): {
  startIso: string;
  endIso: string;
  dateKey: string;
} {
  const dateKey = (dateOrDatetimeLocal || '').slice(0, 10);
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) {
    return { startIso: '', endIso: '', dateKey };
  }
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  // Inclusive end of UTC day so `<= end` matches CAST AS DATE (excludes next midnight).
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateKey,
  };
}

/** Label for a UTC calendar day (e.g. "Sun, Jul 12, 2026"). */
export function formatUtcCalendarDayLabel(dateOrDatetimeLocal: string): string {
  const dateKey = (dateOrDatetimeLocal || '').slice(0, 10);
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey || 'N/A';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function saudiDatetimeLocalToUtcDate(datetimeLocal: string): Date {
  return new Date(saudiDatetimeLocalToUtcIso(datetimeLocal));
}

/** Parse API / DB value as UTC (naive strings from SQL Server are UTC). */
export function parseUtcDate(dateString: string | null | undefined): Date | null {
  if (!dateString || dateString === 'N/A') return null;
  const s = dateString.trim();
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSaudiTime(dateString: string | null | undefined, includeSeconds = false): string {
  if (!dateString || dateString === 'N/A') return 'N/A';
  const date = parseUtcDate(dateString);
  if (!date) return 'Invalid Date';
  const options: Intl.DateTimeFormatOptions = {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (includeSeconds) options.second = '2-digit';
  return date.toLocaleString('en-US', options);
}

export function formatSaudiFromUtcDate(date: Date, includeSeconds = false): string {
  return formatSaudiTime(date.toISOString(), includeSeconds);
}

/** Format a datetime-local value (Saudi) for period labels in reports. */
export function formatSaudiDatetimeLocalLabel(datetimeLocal: string): string {
  const utc = saudiDatetimeLocalToUtcDate(datetimeLocal);
  return formatSaudiFromUtcDate(utc);
}

export function formatSaudiDateLabel(datetimeLocal: string, options: Intl.DateTimeFormatOptions): string {
  const utc = saudiDatetimeLocalToUtcDate(datetimeLocal);
  return utc.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, ...options });
}

export function formatSaudiTimeLabel(datetimeLocal: string, options: Intl.DateTimeFormatOptions): string {
  const utc = saudiDatetimeLocalToUtcDate(datetimeLocal);
  return utc.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, ...options });
}

/** Production day default: yesterday 07:00 → today 07:00 (Saudi). */
export function getDefaultProductionDayRange(): { startDate: string; endDate: string } {
  const nowParts = getSaudiPartsForInstant(new Date());
  const endDate = toDatetimeLocal(nowParts.year, nowParts.month, nowParts.day, 7, 0);
  const endUtc = saudiLocalToUtcDate(nowParts.year, nowParts.month, nowParts.day, 7, 0);
  const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);
  const startParts = getSaudiPartsForInstant(startUtc);
  const startDate = toDatetimeLocal(startParts.year, startParts.month, startParts.day, 7, 0);
  return { startDate, endDate };
}

/** Batch calendar default: 1st of current Saudi month 07:00 → 1st of next month 07:00. */
export function getDefaultCalendarMonthRange(): { startDate: string; endDate: string } {
  const nowParts = getSaudiPartsForInstant(new Date());
  const startDate = toDatetimeLocal(nowParts.year, nowParts.month, 1, 7, 0);
  let y = nowParts.year;
  let m = nowParts.month + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const endDate = toDatetimeLocal(y, m, 1, 7, 0);
  return { startDate, endDate };
}

/** Weekly / daily / monthly tab defaults (7 AM Saudi). */
export function getSpecificDateDefaults(): {
  weeklyStart: string;
  dailyStart: string;
  monthlyStart: string;
} {
  const nowParts = getSaudiPartsForInstant(new Date());
  const dailyStart = (() => {
    const endUtc = saudiLocalToUtcDate(nowParts.year, nowParts.month, nowParts.day, 7, 0);
    const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);
    const p = getSaudiPartsForInstant(startUtc);
    return toDatetimeLocal(p.year, p.month, p.day, 7, 0);
  })();

  const weeklyStart = (() => {
    const todayUtc = saudiLocalToUtcDate(nowParts.year, nowParts.month, nowParts.day, 7, 0);
    const dayOfWeek = new Date(todayUtc).toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, weekday: 'short' });
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = dowMap[dayOfWeek.slice(0, 3)] ?? 0;
    const daysToThisMonday = dow === 0 ? 6 : dow - 1;
    const thisMondayUtc = new Date(todayUtc.getTime() - daysToThisMonday * 24 * 60 * 60 * 1000);
    const lastMondayUtc = new Date(thisMondayUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
    const p = getSaudiPartsForInstant(lastMondayUtc);
    return toDatetimeLocal(p.year, p.month, p.day, 7, 0);
  })();

  const monthlyStart = (() => {
    let y = nowParts.year;
    let m = nowParts.month - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    return toDatetimeLocal(y, m, 1, 7, 0);
  })();

  return { weeklyStart, dailyStart, monthlyStart };
}

/** Dashboard default: previous calendar week Mon 07:00 → this Mon 07:00 (Saudi). */
export function getDefaultDashboardWeekRange(): { startDate: Date; endDate: Date } {
  const nowParts = getSaudiPartsForInstant(new Date());
  const endDate = saudiLocalToUtcDate(nowParts.year, nowParts.month, nowParts.day, 7, 0);
  const dayOfWeek = new Date(endDate).toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, weekday: 'short' });
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[dayOfWeek.slice(0, 3)] ?? 0;
  const daysToThisMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(endDate.getTime() - daysToThisMonday * 24 * 60 * 60 * 1000);
  const startDate = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

/** Add calendar days to a Saudi datetime-local value (preserves clock time). */
export function addSaudiDays(datetimeLocal: string, days: number): string {
  const utc = saudiDatetimeLocalToUtcDate(datetimeLocal);
  const parts = getSaudiPartsForInstant(utc);
  const nextUtc = new Date(utc.getTime() + days * 24 * 60 * 60 * 1000);
  const nextParts = getSaudiPartsForInstant(nextUtc);
  return toDatetimeLocal(nextParts.year, nextParts.month, nextParts.day, parts.hour, parts.minute);
}

/** Add months to a Saudi datetime-local value (preserves day-of-month and clock time). */
export function addSaudiMonths(datetimeLocal: string, months: number): string {
  const utc = saudiDatetimeLocalToUtcDate(datetimeLocal);
  const p = getSaudiPartsForInstant(utc);
  let m = p.month + months;
  let y = p.year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return toDatetimeLocal(y, m, p.day, p.hour, p.minute);
}

/** Previous calendar month, 07:00 Saudi (for raw data default range). */
export function getDefaultPreviousMonthRange(): { startDate: string; endDate: string } {
  const p = getSaudiPartsForInstant(new Date());
  let y = p.year;
  let m = p.month - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const nextMonth = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  const monthEndUtc = saudiLocalToUtcDate(nextMonth.year, nextMonth.month, 1, 7, 0);
  const lastDayUtc = new Date(monthEndUtc.getTime() - 24 * 60 * 60 * 1000);
  const lastDay = getSaudiPartsForInstant(lastDayUtc).day;
  return {
    startDate: toDatetimeLocal(y, m, 1, 7, 0),
    endDate: toDatetimeLocal(y, m, lastDay, 7, 0),
  };
}

export function calendarDayWithSaudiTime(
  calendarDate: Date,
  hour: number,
  minute: number,
): Date {
  return saudiLocalToUtcDate(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + 1,
    calendarDate.getDate(),
    hour,
    minute,
  );
}
