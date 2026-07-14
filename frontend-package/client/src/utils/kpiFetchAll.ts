import axios, { AxiosRequestConfig } from 'axios';

const PAGE_LIMIT = 10000;
const MAX_PAGES = 1000;

/**
 * Fetch all rows from a KPI list endpoint (/api/kpi, /api/kpi/csv-format-report, /api/reports)
 * using includeTotal=false and OFFSET page until has_more is false.
 *
 * Uses page/offset (not keyset cursor) so multi-page Monthly/Weekly totals stay complete
 * as long as the server ORDER BY is stable across pages.
 */
export async function fetchAllKpiPages(
  urlWithPath: string,
  baseParams: URLSearchParams,
  config?: AxiosRequestConfig
): Promise<unknown[]> {
  const all: unknown[] = [];
  let page = 1;

  for (let guard = 0; guard < MAX_PAGES; guard += 1) {
    const p = new URLSearchParams(baseParams.toString());
    p.set('limit', String(PAGE_LIMIT));
    p.set('includeTotal', 'false');
    p.set('page', String(page));
    p.delete('cursor');

    const r = await axios.get(`${urlWithPath}?${p.toString()}`, config);
    const body = r.data as {
      data?: unknown[];
      has_more?: boolean;
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
    page += 1;
  }

  return all;
}
