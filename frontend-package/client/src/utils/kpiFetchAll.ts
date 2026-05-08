import axios, { AxiosRequestConfig } from 'axios';

const PAGE_LIMIT = 10000;
const MAX_PAGES = 1000;

/**
 * Fetch all rows from a KPI list endpoint (/api/kpi, /api/kpi/csv-format-report, /api/reports)
 * using includeTotal=false and nextCursor / page until has_more is false.
 */
export async function fetchAllKpiPages(
  urlWithPath: string,
  baseParams: URLSearchParams,
  config?: AxiosRequestConfig
): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor: string | undefined;
  let page = 1;

  for (let guard = 0; guard < MAX_PAGES; guard += 1) {
    const p = new URLSearchParams(baseParams.toString());
    p.set('limit', String(PAGE_LIMIT));
    p.set('includeTotal', 'false');
    if (cursor) {
      p.set('cursor', cursor);
      p.delete('page');
    } else {
      p.set('page', String(page));
    }

    const r = await axios.get(`${urlWithPath}?${p.toString()}`, config);
    const body = r.data as {
      data?: unknown[];
      has_more?: boolean;
      nextCursor?: string | null;
    };
    const rows = Array.isArray(body?.data) ? body.data : [];
    all.push(...rows);

    const hasMore = Boolean(body?.has_more);
    const nextC = typeof body?.nextCursor === 'string' ? body.nextCursor : undefined;
    if (!hasMore || rows.length === 0) {
      break;
    }
    if (nextC) {
      cursor = nextC;
    } else {
      cursor = undefined;
      page += 1;
    }
  }

  return all;
}
