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
  return parseJson(res);
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

export async function fetchOpenOrders(): Promise<TruckWeighOrder[]> {
  const res = await fetch(`${BASE}/orders/open`);
  const data = await parseJson<{ orders: TruckWeighOrder[] }>(res);
  return data.orders ?? [];
}

export async function fetchCompletedToday(date?: string): Promise<TruckWeighOrder[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetch(`${BASE}/orders/today${qs}`);
  const data = await parseJson<{ rows: TruckWeighOrder[] }>(res);
  return data.rows ?? [];
}

export async function fetchTruckWeighOrder(orderId: number): Promise<TruckWeighOrder> {
  const res = await fetch(`${BASE}/orders/${orderId}`);
  return parseJson(res);
}
