import { API_BASE_URL } from "../config/api";

export type TruckWeighStatus = "awaiting_first" | "awaiting_second" | "completed" | "cancelled";

export interface TruckWeighOrder {
  id: number;
  ticket: string;
  truck_id: number;
  truck_plate?: string | null;
  truck_driver?: string | null;
  material_code: string;
  material_name?: string | null;
  first_weight_kg?: number | null;
  first_ts?: string | null;
  second_weight_kg?: number | null;
  second_ts?: string | null;
  net_kg?: number | null;
  status: TruckWeighStatus;
  site_status?: string;
  created_at?: string | null;
}

export interface ScaleLiveReading {
  ok: boolean;
  scale: number;
  name?: string;
  role?: "entry" | "exit" | string;
  ip?: string;
  mac?: string;
  weight_kg: number | null;
  stable: boolean;
  unit?: string;
  mode?: string;
  error?: string | null;
}

const BASE = `${API_BASE_URL}/truck-entry`;

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || res.statusText);
  }
  if (!res.ok) {
    const err = data as { error?: string };
    throw new Error(err?.error || text || res.statusText);
  }
  return data as T;
}

export async function createTruckWeighOrder(
  truckId: number,
  materialCode: string
): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ truck_id: truckId, material_code: materialCode }),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || res.statusText);
  }
  if (res.status === 409) {
    const err = data as { error?: string; order_id?: number; ticket?: string; status?: string };
    const conflict = new Error(err?.error || "Truck already has an open weigh order") as Error & {
      orderId?: number;
      ticket?: string;
      status?: string;
      code?: "OPEN_ORDER";
    };
    conflict.code = "OPEN_ORDER";
    conflict.orderId = err?.order_id;
    conflict.ticket = err?.ticket;
    conflict.status = err?.status;
    throw conflict;
  }
  if (!res.ok) {
    const err = data as { error?: string };
    throw new Error(err?.error || text || res.statusText);
  }
  return data as TruckWeighOrder;
}

export async function saveFirstWeight(orderId: number, weight: number): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders/${orderId}/first`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight }),
  });
  return parseJson(res);
}

export async function saveSecondWeight(orderId: number, weight: number): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders/${orderId}/second`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight }),
  });
  return parseJson(res);
}

export async function fetchOpenOrders(signal?: AbortSignal): Promise<TruckWeighOrder[]> {
  const res = await fetch(`${BASE}/orders/open`, { signal });
  const data = await parseJson<{ orders: TruckWeighOrder[] }>(res);
  return data.orders ?? [];
}

export interface CompletedTodayResult {
  date: string | null;
  rows: TruckWeighOrder[];
}

export async function fetchCompletedToday(
  date?: string,
  signal?: AbortSignal
): Promise<CompletedTodayResult> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetch(`${BASE}/orders/today${qs}`, { signal });
  const data = await parseJson<{ date?: string; rows: TruckWeighOrder[] }>(res);
  return { date: data.date ?? null, rows: data.rows ?? [] };
}

export async function fetchTruckWeighOrder(orderId: number): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders/${orderId}`);
  return parseJson(res);
}

/** Cancel an open trip (awaiting entry or exit) so the truck can be reused. */
export async function deleteTruckWeighOrder(orderId: number): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders/${orderId}`, { method: "DELETE" });
  return parseJson(res);
}

/** Scale 1 = entry, Scale 2 = exit */
export async function fetchScaleLive(scaleId: 1 | 2): Promise<ScaleLiveReading> {
  const res = await fetch(`${BASE}/scales/${scaleId}/live`);
  const text = await res.text();
  let data: ScaleLiveReading;
  try {
    data = text
      ? (JSON.parse(text) as ScaleLiveReading)
      : ({ ok: false, scale: scaleId, weight_kg: null, stable: false } as ScaleLiveReading);
  } catch {
    throw new Error(text || res.statusText);
  }
  if (!res.ok && !data?.error && data?.weight_kg == null) {
    throw new Error(text || res.statusText);
  }
  return data;
}
