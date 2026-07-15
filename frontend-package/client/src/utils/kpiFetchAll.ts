import axios, { AxiosRequestConfig } from 'axios';

const PAGE_LIMIT = 10000;
const MAX_PAGES = 1000;

/**
 * Fetch all rows from a KPI list endpoint (/api/kpi, /api/kpi/csv-format-report, /api/reports).
 *
 * Prefers keyset `cursor` / `nextCursor` (stable, no OFFSET skip/dup risk).
 * Falls back to page/offset when the server does not return nextCursor.
 */
export async function fetchAllKpiPages(
  urlWithPath: string,
  baseParams: URLSearchParams,
  config?: AxiosRequestConfig
): Promise<unknown[]> {
  const all: unknown[] = [];
  let page = 1;
  let cursor: string | null = null;

  for (let guard = 0; guard < MAX_PAGES; guard += 1) {
    const p = new URLSearchParams(baseParams.toString());
    p.set('limit', String(PAGE_LIMIT));
    p.set('includeTotal', 'false');

    if (cursor) {
      p.set('cursor', cursor);
      p.delete('page');
    } else {
      p.set('page', String(page));
      p.delete('cursor');
    }

    const r = await axios.get(`${urlWithPath}?${p.toString()}`, config);
    const body = r.data as {
      data?: unknown[];
      has_more?: boolean;
      nextCursor?: string | null;
      error?: string;
    };
    if (body?.error) {
      throw new Error(body.error);
    }
    const rows = Array.isArray(body?.data) ? body.data : [];
    all.push(...rows);

    const hasMore = Boolean(body?.has_more);
    if (!hasMore || rows.length === 0) {
      break;
    }

    const next = body.nextCursor || null;
    if (next) {
      cursor = next;
    } else {
      // Offset fallback when server omits nextCursor
      cursor = null;
      page += 1;
    }
  }

  return all;
}
