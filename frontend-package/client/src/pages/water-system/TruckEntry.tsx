import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import {
  ArrowUpFromLine,
  BarChart3,
  Crosshair,
  Hourglass,
  Package,
  RefreshCw,
  Scale,
  Trash2,
  Truck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_BASE_URL } from "../../config/api";
import { getSelectableMaterialCodes } from "../../constants/materialCodes";
import truck3 from "@/assets/truck3.png";
import {
  createTruckWeighOrder,
  deleteTruckWeighOrder,
  fetchCompletedToday,
  fetchOpenOrders,
  fetchScaleLive,
  fetchTruckWeighOrder,
  saveFirstWeight,
  saveSecondWeight,
  type ScaleLiveReading,
  type TruckWeighOrder,
} from "../../api/truckEntry";

interface TruckOption {
  id: number;
  license: string;
  model: string;
  capacity?: string;
}

function fmtTime(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function fmtWeight(kg: number | null | undefined) {
  if (kg == null || Number.isNaN(kg)) return "—";
  return kg.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function rowTimestamp(o: TruckWeighOrder) {
  return o.second_ts || o.first_ts || o.created_at || "";
}

export default function TruckEntry() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [truckData, setTruckData] = useState<TruckOption[]>([]);
  const [openOrders, setOpenOrders] = useState<TruckWeighOrder[]>([]);
  const [completedToday, setCompletedToday] = useState<TruckWeighOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<TruckWeighOrder | null>(null);

  const [newTruckId, setNewTruckId] = useState("");
  const [newMaterialCode, setNewMaterialCode] = useState("");
  const [newEntryFormKey, setNewEntryFormKey] = useState(0);

  const [liveReading, setLiveReading] = useState<ScaleLiveReading | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TruckWeighOrder | null>(null);

  const selectableMaterials = useMemo(() => getSelectableMaterialCodes(), []);

  const outPendingOrders = useMemo(
    () => openOrders.filter((o) => o.status === "awaiting_second"),
    [openOrders]
  );
  const awaitingFirstOrders = useMemo(
    () => openOrders.filter((o) => o.status === "awaiting_first"),
    [openOrders]
  );
  const awaitingFirstCount = awaitingFirstOrders.length;

  const busyTruckIds = useMemo(
    () => new Set(openOrders.map((o) => o.truck_id)),
    [openOrders]
  );

  /** Trucks already on site (open trip) stay hidden until exit completes */
  const availableTrucks = useMemo(
    () => truckData.filter((t) => !busyTruckIds.has(t.id)),
    [truckData, busyTruckIds]
  );

  const isEntryPhase = activeOrder?.status === "awaiting_first";
  const isExitPhase = activeOrder?.status === "awaiting_second";

  const selectedTruck = truckData.find((t) => String(t.id) === newTruckId);
  const selectedMaterial = selectableMaterials.find((m) => m.code === newMaterialCode);

  /** New entry ready: truck + material chosen — live Scale 1 before capture */
  const readyForNewEntry = Boolean(newTruckId && newMaterialCode) && !isExitPhase;

  const activeScaleId: 1 | 2 | null = useMemo(() => {
    if (isExitPhase) return 2;
    if (isEntryPhase) return 1;
    if (readyForNewEntry) return 1;
    return null;
  }, [isExitPhase, isEntryPhase, readyForNewEntry]);

  const previewTruck = useMemo(() => {
    if (activeOrder) {
      return (
        truckData.find((t) => t.id === activeOrder.truck_id) ?? {
          id: activeOrder.truck_id,
          license: activeOrder.truck_plate ?? `Truck ${activeOrder.truck_id}`,
          model: "",
        }
      );
    }
    return selectedTruck ?? null;
  }, [activeOrder, truckData, selectedTruck]);

  const previewMaterialName = activeOrder
    ? activeOrder.material_name || activeOrder.material_code
    : selectedMaterial?.name || selectedMaterial?.code || null;

  const previewPlate =
    activeOrder?.truck_plate ?? previewTruck?.license ?? null;

  const liveKg = liveReading?.ok ? liveReading.weight_kg : null;
  const grossKg = liveKg;
  const tareKg = isExitPhase ? activeOrder?.first_weight_kg ?? null : null;
  const netKg =
    grossKg != null && tareKg != null ? Math.round(grossKg - tareKg) : null;

  const scaleLive = Boolean(activeScaleId && liveReading?.ok);
  const motionDetected = scaleLive && liveReading && !liveReading.stable;
  const scaleStable = scaleLive && Boolean(liveReading?.stable);

  /** Open trips only — completed cycles appear on Weighbridge Log */
  const openTripRows = useMemo(() => {
    return [...openOrders].sort((a, b) => {
      const ta = new Date(rowTimestamp(a)).getTime() || 0;
      const tb = new Date(rowTimestamp(b)).getTime() || 0;
      return tb - ta;
    });
  }, [openOrders]);

  const refreshData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [open, today] = await Promise.all([
        fetchOpenOrders(signal),
        fetchCompletedToday(undefined, signal),
      ]);
      setOpenOrders(open);
      setCompletedToday(today.rows ?? []);
      setActiveOrder((prev) => {
        if (!prev) return null;
        return open.find((o) => o.id === prev.id) ?? null;
      });
    } catch (err: unknown) {
      // Navigating away aborts these fetches — that is not an error to show.
      if ((err as { name?: string })?.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const fetchTrucks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/trucks/`);
      const data = await res.json();
      setTruckData(Array.isArray(data) ? data : data?.items ?? []);
    } catch {
      setTruckData([]);
    }
  }, []);

  useEffect(() => {
    // Abort the initial /open + /today loads if the operator navigates away
    // before they resolve (these can take seconds on a loaded backend).
    const controller = new AbortController();
    fetchTrucks();
    void refreshData(controller.signal);
    return () => controller.abort();
  }, [fetchTrucks, refreshData]);

  // Drop selection if truck became busy (open trip)
  useEffect(() => {
    if (newTruckId && busyTruckIds.has(Number(newTruckId))) {
      setNewTruckId("");
      setNewEntryFormKey((k) => k + 1);
    }
  }, [busyTruckIds, newTruckId]);

  useEffect(() => {
    if (!activeScaleId) {
      setLiveReading(null);
      setLiveError(null);
      setLivePolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      setLivePolling(true);
      try {
        const reading = await fetchScaleLive(activeScaleId);
        if (cancelled) return;
        setLiveReading(reading);
        setLiveError(reading.ok ? null : reading.error || "Scale unreachable");
      } catch (err: unknown) {
        if (cancelled) return;
        setLiveReading(null);
        setLiveError(err instanceof Error ? err.message : "Scale read failed");
      } finally {
        if (!cancelled) {
          setLivePolling(false);
          timer = setTimeout(poll, 1000);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeScaleId]);

  /** Start exit weigh on Scale 2 for a truck that already has entry weight */
  function startTruckExit(order: TruckWeighOrder) {
    if (order.status !== "awaiting_second") return;
    setActiveOrder(order);
    setErrorMsg(null);
    setMessage(
      `Exit weigh for ${order.truck_plate ?? `Truck ${order.truck_id}`} — place on Scale 2, wait for STABLE, then Capture Exit.`
    );
  }

  /** Resume / start entry weigh on Scale 1 */
  function startTruckEntry(order: TruckWeighOrder) {
    if (order.status !== "awaiting_first") return;
    setActiveOrder(order);
    setErrorMsg(null);
    setMessage(
      `Entry weigh for ${order.truck_plate ?? `Truck ${order.truck_id}`} — place on Scale 1, wait for STABLE, then Capture Weight.`
    );
  }

  function clearActiveOrder() {
    setActiveOrder(null);
  }

  async function confirmDeleteOrder() {
    if (!deleteTarget) return;
    const order = deleteTarget;
    const plate = order.truck_plate ?? `Truck ${order.truck_id}`;

    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    setDeleteTarget(null);
    try {
      await deleteTruckWeighOrder(order.id);
      if (activeOrder?.id === order.id) clearActiveOrder();
      setMessage(`Trip ${order.ticket} deleted — ${plate} is free for a new entry.`);
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete trip");
    } finally {
      setLoading(false);
    }
  }

  function resetNewEntryForm() {
    setNewTruckId("");
    setNewMaterialCode("");
    setNewEntryFormKey((k) => k + 1);
  }

  /** Single action: create trip (if needed) + save entry weight, or save exit weight */
  async function handleCaptureAndSave() {
    const w = liveReading?.weight_kg;
    if (w == null || w <= 0) {
      setErrorMsg("Wait for a live scale reading before capturing.");
      return;
    }
    if (!liveReading?.stable) {
      setErrorMsg("Scale is unstable — wait until STABLE, then capture.");
      return;
    }
    const rounded = Math.round(w * 10) / 10;

    // ── EXIT ──
    if (isExitPhase && activeOrder) {
      setLoading(true);
      setErrorMsg(null);
      setMessage(null);
      try {
        const updated = await saveSecondWeight(activeOrder.id, rounded);
        setMessage(
          `Trip completed. NET = ${Math.round(updated.net_kg ?? 0)} kg — see Weighbridge Log.`
        );
        clearActiveOrder();
        await refreshData();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to save exit weight");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── ENTRY: one click create + capture (or capture if trip already open) ──
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      let order = activeOrder?.status === "awaiting_first" ? activeOrder : null;

      if (!order) {
        const truckId = Number(newTruckId);
        if (!truckId || !newMaterialCode) {
          setErrorMsg("Select a truck and material.");
          setLoading(false);
          return;
        }
        try {
          order = await createTruckWeighOrder(truckId, newMaterialCode);
        } catch (err: unknown) {
          const conflict = err as Error & { code?: string; orderId?: number };
          if (conflict?.code === "OPEN_ORDER" && conflict.orderId) {
            const existing = await fetchTruckWeighOrder(conflict.orderId);
            if (existing.status === "awaiting_second") {
              setActiveOrder(existing);
              resetNewEntryForm();
              setMessage(
                `Open trip ${existing.ticket} needs exit — use Truck Exit, then Capture Exit.`
              );
              setLoading(false);
              await refreshData();
              return;
            }
            order = existing;
          } else {
            throw err;
          }
        }
      }

      await saveFirstWeight(order.id, rounded);
      clearActiveOrder();
      resetNewEntryForm();
      setMessage(
        `Entry ${fmtWeight(rounded)} kg saved for ${order.truck_plate ?? `Truck ${order.truck_id}`}. Use Truck Exit when ready.`
      );
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to capture entry weight");
    } finally {
      setLoading(false);
    }
  }

  const canCapture =
    !loading &&
    Boolean(liveReading?.ok) &&
    Boolean(liveReading?.stable) &&
    liveReading?.weight_kg != null &&
    liveReading.weight_kg > 0 &&
    (isExitPhase || isEntryPhase || readyForNewEntry);

  const showTruckVisual = Boolean(previewTruck || activeOrder);
  const showInMode = !isExitPhase;

  function statusBadge(row: TruckWeighOrder) {
    if (activeOrder?.id === row.id && activeScaleId) {
      return (
        <span className="wb-badge wb-badge-cyan">
          <span className="wb-badge-dot" /> On Scale
        </span>
      );
    }
    if (row.status === "awaiting_second") {
      return (
        <span className="wb-badge wb-badge-amber">
          <span className="wb-badge-dot" /> Exit Pending
        </span>
      );
    }
    return (
      <span className="wb-badge wb-badge-amber">
        <span className="wb-badge-dot" /> Entry Pending
      </span>
    );
  }

  return (
    <WaterSystemLayout
      title="Weighbridge Entry"
      subtitle="Scale 1 for entry · Scale 2 for exit — live capture from Baykon indicators"
    >
      <div className="wb-console space-y-4">
        {(message || errorMsg) && (
          <div className="text-sm px-0.5">
            {message && <span className="text-[#19D37E] light:text-green-700">{message}</span>}
            {errorMsg && <span className="text-[#FF4D5E] light:text-red-600 ml-3">{errorMsg}</span>}
          </div>
        )}

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Out Pending"
            value={outPendingOrders.length}
            unit={outPendingOrders.length === 1 ? "Truck" : "Trucks"}
            icon={<Truck className="h-4 w-4" />}
            tone="cyan"
          />
          <KpiTile
            label="Awaiting Weight"
            value={awaitingFirstCount}
            unit={awaitingFirstCount === 1 ? "Truck" : "Trucks"}
            icon={<Hourglass className="h-4 w-4" />}
            tone="amber"
          />
          <KpiTile
            label="On Scale"
            value={activeScaleId ? 1 : 0}
            unit="Truck"
            icon={<Scale className="h-4 w-4" />}
            tone="cyan"
          />
          <KpiTile
            label="Today Entries"
            value={completedToday.length}
            unit="Total"
            icon={<BarChart3 className="h-4 w-4" />}
            tone="cyan"
          />
        </div>

        {/* ── NEW ENTRY ── */}
        <section className="wb-panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00D9FF]" />
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] wb-text">
                New Entry
              </h2>
              <p className="text-[11px] wb-text-muted mt-0.5">
                Select truck and material — live Scale 1 weight appears, then Capture Entry
              </p>
            </div>
          </div>

          <div
            key={newEntryFormKey}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end"
          >
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider wb-text-sec">
                Select Truck
              </label>
              <Select
                value={newTruckId || undefined}
                onValueChange={(v) => {
                  setNewTruckId(v);
                  if (activeOrder?.status === "awaiting_first") clearActiveOrder();
                }}
                disabled={isExitPhase}
              >
                <SelectTrigger className="wb-input h-12 wb-text">
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent className="wb-select-content wb-text">
                  {availableTrucks.length === 0 ? (
                    <div className="px-3 py-2 text-xs wb-text-muted">
                      No free trucks — all have open trips
                    </div>
                  ) : (
                    availableTrucks.map((truck) => (
                      <SelectItem key={truck.id} value={String(truck.id)}>
                        <span className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5 wb-text-cyan shrink-0" />
                          <span>
                            {truck.license}
                            {truck.model ? ` — ${truck.model}` : ""}
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider wb-text-sec">
                Select Material
              </label>
              <Select
                value={newMaterialCode || undefined}
                onValueChange={(v) => {
                  setNewMaterialCode(v);
                  if (activeOrder?.status === "awaiting_first") clearActiveOrder();
                }}
                disabled={isExitPhase}
              >
                <SelectTrigger className="wb-input h-12 wb-text">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent className="wb-select-content wb-text max-h-60">
                  {selectableMaterials.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      <span className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 wb-text-cyan shrink-0" />
                        <span>
                          {m.code} — {m.name}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── MAIN WORKSPACE ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4">
          {/* Truck Preview */}
          <section className="wb-panel overflow-hidden flex flex-col min-h-[340px]">
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b wb-border">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] wb-text">
                  Truck Preview
                </h2>
                <p className="text-[10px] wb-text-muted mt-0.5">Live vehicle position</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {previewPlate && (
                  <span className="wb-chip">
                    Truck <strong>{previewPlate}</strong>
                  </span>
                )}
                {previewMaterialName && (
                  <span className="wb-chip">
                    Material <strong className="truncate max-w-[140px]">{previewMaterialName}</strong>
                  </span>
                )}
                {activeScaleId ? (
                  motionDetected ? (
                    <span className="wb-badge wb-badge-amber">
                      <span className="wb-badge-dot animate-pulse" /> Motion Detected
                    </span>
                  ) : scaleStable ? (
                    <span className="wb-badge wb-badge-ok">
                      <span className="wb-badge-dot" /> Weight Stable
                    </span>
                  ) : (
                    <span className="wb-badge wb-badge-cyan">
                      <span className="wb-badge-dot" /> On Scale
                    </span>
                  )
                ) : null}
              </div>
            </div>

            <div className="relative flex-1 wb-stage min-h-[280px] flex items-center justify-center">
              {showTruckVisual ? (
                <img
                  src={truck3}
                  alt="Truck on weighbridge"
                  className="max-h-[320px] w-full object-contain object-center px-2 py-4"
                />
              ) : (
                <div className="text-center px-6 py-16 space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-lg border wb-border flex items-center justify-center wb-text-cyan opacity-70">
                    <Truck className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium tracking-wide wb-text-sec uppercase">
                    Select a truck to begin
                  </p>
                  <p className="text-xs wb-text-muted">
                    Choose truck and material above, then create entry
                  </p>
                </div>
              )}

              {activeScaleId && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] wb-text-sec">
                  {livePolling || liveReading?.ok ? (
                    <Wifi className="h-3 w-3 text-[#19D37E]" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-[#FF4D5E]" />
                  )}
                  Scale {activeScaleId}
                  {liveReading?.ip ? ` · ${liveReading.ip}` : ""}
                </div>
              )}
            </div>
          </section>

          {/* Right column */}
          <div className="flex flex-col gap-4 min-h-0">
            {/* Live weight */}
            <section
              className={`wb-panel p-4 ${
                activeScaleId ? "wb-panel-active" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] wb-text">
                  Live Weight Reading
                </h2>
                <span className="rounded border wb-border px-2 py-0.5 text-[10px] font-semibold uppercase wb-text-sec">
                  kg
                </span>
              </div>

              <div className="flex gap-4 items-center">
                <div className="flex-1 min-w-0">
                  {liveError && activeScaleId && !liveReading?.ok ? (
                    <div className="space-y-1">
                      <p className="text-[#FF4D5E] text-sm font-medium">Scale connection lost</p>
                      <p className="text-[11px] wb-text-muted break-all">{liveError}</p>
                    </div>
                  ) : (
                    <div
                      className={`text-[40px] md:text-[48px] leading-none font-semibold tabular-nums tracking-tight ${
                        activeScaleId
                          ? "wb-weight-live drop-shadow-[0_0_18px_rgba(0,217,255,0.25)] light:drop-shadow-none"
                          : "wb-weight-idle"
                      }`}
                    >
                      {activeScaleId ? fmtWeight(liveKg) : "— — —"}
                    </div>
                  )}
                  {activeScaleId && (
                    <div className="mt-2">
                      {scaleStable ? (
                        <span className="wb-badge wb-badge-ok">
                          <span className="wb-badge-dot" /> Stable
                        </span>
                      ) : motionDetected ? (
                        <span className="wb-badge wb-badge-amber">
                          <span className="wb-badge-dot animate-pulse" /> Motion
                        </span>
                      ) : (
                        <span className="text-[10px] wb-text-muted uppercase tracking-wider">
                          Waiting for reading…
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="w-[96px] shrink-0 space-y-2.5 border-l wb-border pl-3">
                  {(
                    [
                      ["Gross", grossKg],
                      ["Tare", tareKg],
                      ["Net", netKg],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[9px] uppercase tracking-wider wb-text-muted">
                        {label}
                      </div>
                      <div className="text-sm font-semibold tabular-nums wb-text">
                        {fmtWeight(value)}
                        {value != null ? (
                          <span className="text-[10px] wb-text-muted ml-0.5">kg</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Entry details */}
            <section className="wb-panel p-4 flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] wb-text">
                  Entry Details
                </h2>
                {activeOrder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearActiveOrder}
                    className="h-7 text-[11px] wb-text-sec hover:opacity-90"
                  >
                    Clear
                  </Button>
                )}
              </div>

              {activeOrder && (
                <p className="text-[10px] font-mono wb-text-muted truncate">
                  {activeOrder.ticket}
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider wb-text-sec">
                  Selected Truck
                </label>
                <div className="wb-input h-10 flex items-center px-3 text-sm wb-text truncate">
                  {activeOrder
                    ? `${activeOrder.truck_plate ?? `Truck ${activeOrder.truck_id}`}${
                        previewTruck?.model ? ` — ${previewTruck.model}` : ""
                      }`
                    : selectedTruck
                      ? `${selectedTruck.license}${selectedTruck.model ? ` — ${selectedTruck.model}` : ""}`
                      : "—"}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider wb-text-sec">
                  Selected Material
                </label>
                <div className="wb-input h-10 flex items-center px-3 text-sm wb-text truncate">
                  {activeOrder
                    ? `${activeOrder.material_code}${
                        activeOrder.material_name ? ` — ${activeOrder.material_name}` : ""
                      }`
                    : selectedMaterial
                      ? `${selectedMaterial.code} — ${selectedMaterial.name}`
                      : "—"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="inline-flex rounded-md border wb-border overflow-hidden p-0.5 wb-stage">
                  <span
                    className={`px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider rounded ${
                      showInMode
                        ? "bg-[#00D9FF]/20 text-[#0e7490] dark:text-[#5CEBFF] light:bg-cyan-100 light:text-cyan-800"
                        : "wb-text-muted"
                    }`}
                  >
                    In
                  </span>
                  <span
                    className={`px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider rounded ${
                      isExitPhase
                        ? "bg-[#FFB020]/20 text-[#c2410c] dark:text-[#FFB020] light:bg-orange-100 light:text-orange-700"
                        : "wb-text-muted"
                    }`}
                  >
                    Out
                  </span>
                </div>

                <Button
                  className="wb-btn-primary h-10 flex-1 min-w-[160px] gap-2 font-semibold disabled:opacity-40"
                  onClick={handleCaptureAndSave}
                  disabled={!canCapture}
                >
                  <Crosshair className="h-4 w-4" />
                  {loading
                    ? "Saving…"
                    : isExitPhase
                      ? "Capture Exit"
                      : "Capture Entry"}
                </Button>
              </div>

              <p className="text-[10px] wb-text-muted leading-relaxed">
                {isExitPhase
                  ? `Entry ${fmtWeight(activeOrder?.first_weight_kg)} kg · place on Scale 2, wait for STABLE, then Capture Exit.`
                  : readyForNewEntry || isEntryPhase
                    ? "Live Scale 1 weight shown — wait for STABLE, then Capture Entry (creates trip + saves weight)."
                    : "Select truck & material above — live weight starts, then Capture Entry in one click."}
              </p>
            </section>
          </div>
        </div>

        {/* ── OPEN TRIPS (entry / exit in progress) ── */}
        <section className="wb-panel overflow-hidden">
          <div className="px-4 py-3 border-b wb-border flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] wb-text">
                Open Trips — On Site
              </h2>
              <p className="text-[10px] wb-text-muted mt-0.5">
                Entry &amp; exit in progress. Completed cycles move to Weighbridge Log.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void refreshData() }}
                disabled={loading}
                className="h-7 gap-1 wb-text-sec hover:opacity-90"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Link
                href="/fakieh/weighbridge"
                className="text-[11px] font-semibold uppercase tracking-wider wb-text-cyan hover:opacity-80"
              >
                Weighbridge Log →
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="wb-border hover:bg-transparent wb-table-head">
                  {(
                    [
                      "Time",
                      "Truck No",
                      "Material",
                      "Type",
                      "Entry Weight",
                      "Exit Weight",
                      "Status",
                      "Action",
                    ] as const
                  ).map((h) => (
                    <TableHead
                      key={h}
                      className={`text-[10px] uppercase tracking-wider wb-text-muted h-10 ${
                        h === "Action" ? "text-right" : ""
                      }`}
                    >
                      {["Entry Weight", "Exit Weight"].includes(h) ? `${h} (kg)` : h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTripRows.map((row) => {
                  const needsEntry = row.status === "awaiting_first";
                  const needsExit = row.status === "awaiting_second";
                  const type = needsEntry ? "IN" : "OUT";
                  const entryKg = row.first_weight_kg ?? null;
                  const exitKg =
                    activeOrder?.id === row.id && isExitPhase && liveKg != null
                      ? liveKg
                      : row.second_weight_kg ?? null;
                  return (
                    <TableRow
                      key={row.id}
                      className={`wb-border hover:bg-[var(--wb-row-hover)] ${
                        activeOrder?.id === row.id ? "bg-[var(--wb-row-active)]" : ""
                      }`}
                    >
                      <TableCell className="text-xs tabular-nums wb-text-sec py-2.5">
                        {fmtTime(rowTimestamp(row))}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <button
                          type="button"
                          className="text-sm font-medium wb-text-cyan hover:opacity-80"
                          onClick={() =>
                            needsExit ? startTruckExit(row) : startTruckEntry(row)
                          }
                        >
                          {row.truck_plate ?? `Truck ${row.truck_id}`}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm wb-text py-2.5 max-w-[160px] truncate">
                        {row.material_name ?? row.material_code}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
                            type === "IN"
                              ? "border-[#00D9FF]/40 wb-text-cyan-bright light:border-cyan-300 light:bg-cyan-50"
                              : "border-[#FFB020]/40 text-[#FFB020] light:border-orange-300 light:text-orange-700 light:bg-orange-50"
                          }`}
                        >
                          {type}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm wb-text py-2.5">
                        {fmtWeight(entryKg)}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm wb-text-sec py-2.5">
                        {fmtWeight(exitKg)}
                      </TableCell>
                      <TableCell className="py-2.5">{statusBadge(row)}</TableCell>
                      <TableCell className="text-right py-2.5">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {needsExit ? (
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 bg-[#FFB020] hover:bg-[#e09a18] text-[#001018] font-semibold light:bg-orange-500 light:hover:bg-orange-600 light:text-white"
                              onClick={() => startTruckExit(row)}
                            >
                              <ArrowUpFromLine className="h-3.5 w-3.5" />
                              Truck Exit
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 wb-btn-primary font-semibold"
                              onClick={() => startTruckEntry(row)}
                            >
                              Capture Entry
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 border-[#FF4D5E]/40 text-[#FF4D5E] hover:bg-[#FF4D5E]/10"
                            onClick={() => setDeleteTarget(row)}
                            disabled={loading}
                            title="Cancel trip"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {openTripRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 wb-text-muted text-sm"
                    >
                      No open trips — create a new entry above. Finished cycles are on Weighbridge
                      Log.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="wb-panel wb-text sm:max-w-md light:bg-white">
            <AlertDialogHeader>
              <div className="mx-auto sm:mx-0 mb-2 h-11 w-11 rounded-full bg-[#FF4D5E]/15 light:bg-red-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-[#FF4D5E]" />
              </div>
              <AlertDialogTitle className="wb-text">Delete open trip?</AlertDialogTitle>
              <AlertDialogDescription className="wb-text-sec space-y-2">
                <span className="block">
                  Remove{" "}
                  <span className="font-mono wb-text">{deleteTarget?.ticket}</span> for{" "}
                  <span className="font-semibold wb-text">
                    {deleteTarget?.truck_plate ??
                      (deleteTarget ? `Truck ${deleteTarget.truck_id}` : "")}
                  </span>
                  .
                </span>
                <span className="block text-xs">
                  The truck will be free for a new weigh entry after this. This cannot be undone.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="bg-transparent border wb-border wb-text-sec hover:opacity-90 light:border-gray-300 light:bg-white">
                Keep trip
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-[#FF4D5E] hover:bg-[#e04454] text-white"
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDeleteOrder();
                }}
              >
                Delete trip
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </WaterSystemLayout>
  );
}

function KpiTile({
  label,
  value,
  unit,
  icon,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  tone: "cyan" | "amber";
}) {
  return (
    <div className="wb-panel flex items-center gap-3 px-3.5 py-[14px] min-h-[70px]">
      <div
        className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 border ${
          tone === "amber" ? "wb-kpi-icon-amber" : "wb-kpi-icon-cyan"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider wb-text-sec truncate">
          {label}
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-[22px] font-semibold leading-none wb-text tabular-nums">
            {value}
          </span>
          <span className="text-[10px] uppercase tracking-wider wb-text-muted">{unit}</span>
        </div>
      </div>
    </div>
  );
}

export { TruckEntry };
