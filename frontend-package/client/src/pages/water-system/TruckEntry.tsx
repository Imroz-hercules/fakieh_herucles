import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  RefreshCw,
  Scale,
  Truck,
  Package,
  Trash2,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createTruckWeighOrder,
  deleteTruckWeighOrder,
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
}

function fmtTime(ts?: string | null) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

function fmtWeight(kg: number | null | undefined) {
  if (kg == null || Number.isNaN(kg)) return "—";
  return kg.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

export default function TruckEntry() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [truckData, setTruckData] = useState<TruckOption[]>([]);
  const [openOrders, setOpenOrders] = useState<TruckWeighOrder[]>([]);
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

  // All unfinished trips — no date filter; leave table only when entry+exit completed
  const openTripOrders = useMemo(() => openOrders, [openOrders]);

  const activeScaleId: 1 | 2 | null = useMemo(() => {
    if (!activeOrder) return null;
    if (activeOrder.status === "awaiting_first") return 1;
    if (activeOrder.status === "awaiting_second") return 2;
    return null;
  }, [activeOrder]);

  const isEntryPhase = activeOrder?.status === "awaiting_first";
  const isExitPhase = activeOrder?.status === "awaiting_second";

  const refreshData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const open = await fetchOpenOrders();
      setOpenOrders(open);
      setActiveOrder((prev) => {
        if (!prev) return null;
        return open.find((o) => o.id === prev.id) ?? null;
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
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
    fetchTrucks();
    refreshData();
  }, [fetchTrucks, refreshData]);

  // Poll live scale while an active order is waiting for weight
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

  function selectOrder(order: TruckWeighOrder) {
    setActiveOrder(order);
    setMessage(null);
    setErrorMsg(null);
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
      if (activeOrder?.id === order.id) {
        clearActiveOrder();
      }
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

  async function handleCreate() {
    const truckId = Number(newTruckId);
    if (!truckId || !newMaterialCode) {
      setErrorMsg("Select a truck and material.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const order = await createTruckWeighOrder(truckId, newMaterialCode);
      setActiveOrder(order);
      resetNewEntryForm();
      setMessage(`Order ${order.ticket} created — place truck on Scale 1 (entry).`);
      await refreshData();
    } catch (err: unknown) {
      const conflict = err as Error & { code?: string; orderId?: number; status?: string };
      // Resume existing open trip instead of blocking the operator
      if (conflict?.code === "OPEN_ORDER" && conflict.orderId) {
        try {
          const existing = await fetchTruckWeighOrder(conflict.orderId);
          setActiveOrder(existing);
          resetNewEntryForm();
          setErrorMsg(null);
          setMessage(
            existing.status === "awaiting_second"
              ? `Open trip ${existing.ticket} resumed — capture exit on Scale 2.`
              : `Open trip ${existing.ticket} resumed — capture entry on Scale 1.`
          );
          await refreshData();
        } catch {
          setErrorMsg(conflict.message || "Truck already has an open weigh order");
        }
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to create order");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCaptureAndSave() {
    if (!activeOrder) return;
    const w = liveReading?.weight_kg;
    if (w == null || w <= 0) {
      setErrorMsg("Wait for a live scale reading before capturing.");
      return;
    }
    if (!liveReading.stable) {
      setErrorMsg("Scale is unstable — wait until STABLE, then capture.");
      return;
    }
    const rounded = Math.round(w * 10) / 10;
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      if (isEntryPhase) {
        const updated = await saveFirstWeight(activeOrder.id, rounded);
        setActiveOrder(updated);
        resetNewEntryForm();
        setMessage(`Entry weight ${fmtWeight(rounded)} kg saved (Scale 1). Truck is on site.`);
      } else if (isExitPhase) {
        const updated = await saveSecondWeight(activeOrder.id, rounded);
        setMessage(
          `Trip completed. NET = ${Math.round(updated.net_kg ?? 0)} kg — see Weighbridge Log.`
        );
        clearActiveOrder();
      }
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isEntryPhase
            ? "Failed to save entry weight"
            : "Failed to save exit weight"
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedTruck = truckData.find((t) => String(t.id) === newTruckId);
  const selectedMaterial = selectableMaterials.find((m) => m.code === newMaterialCode);

  return (
    <WaterSystemLayout
      title="Weighbridge Entry"
      subtitle="Scale 1 for entry · Scale 2 for exit — live capture from Baykon indicators"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPICard
            title="OUT PENDING"
            value={String(outPendingOrders.length)}
            icon="pump"
            color="purple"
            chartType="line"
          />
          <KPICard
            title="AWAITING ENTRY WEIGHT"
            value={String(awaitingFirstCount)}
            icon="activity"
            color="orange"
            chartType="circle"
          />
          <KPICard
            title="ON SCALE"
            value={activeOrder ? "1" : "0"}
            icon="gauge"
            color="blue"
            chartType="bar"
          />
        </div>

        {(message || errorMsg) && (
          <div className="text-sm px-1">
            {message && <span className="text-green-400 light:text-green-700">{message}</span>}
            {errorMsg && (
              <span className="text-red-400 light:text-red-700 ml-3">{errorMsg}</span>
            )}
          </div>
        )}

        {/* New entry */}
        <Card className="bg-slate-800/40 light:bg-white border-slate-700/80 light:border-gray-200 overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-700/40 light:border-gray-100">
            <CardTitle className="text-white light:text-gray-900 text-sm flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-400" /> New entry
              <span className="ml-auto text-[10px] font-normal uppercase tracking-wider text-slate-500 light:text-gray-500">
                Truck · Material · then Scale 1
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent key={newEntryFormKey} className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-300 light:text-gray-700 text-xs flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-cyan-400/80" /> Truck
                </label>
                <Select value={newTruckId || undefined} onValueChange={setNewTruckId}>
                  <SelectTrigger className="bg-slate-700/80 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-11">
                    <SelectValue placeholder="Select truck" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    {truckData.map((truck) => (
                      <SelectItem key={truck.id} value={String(truck.id)}>
                        {truck.license} — {truck.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-300 light:text-gray-700 text-xs flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-cyan-400/80" /> Material
                </label>
                <Select value={newMaterialCode || undefined} onValueChange={setNewMaterialCode}>
                  <SelectTrigger className="bg-slate-700/80 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-11">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 max-h-60">
                    {selectableMaterials.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.code} — {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-900/30 light:bg-cyan-600 light:hover:bg-cyan-700 light:text-white disabled:opacity-50"
                  onClick={handleCreate}
                  disabled={loading || !newTruckId || !newMaterialCode}
                >
                  Create & weigh entry
                </Button>
              </div>
            </div>

            {(selectedTruck || selectedMaterial) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedTruck && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/60 light:bg-slate-100 border border-slate-600/50 light:border-gray-200 px-2.5 py-1 text-xs text-slate-200 light:text-gray-800">
                    <Truck className="h-3 w-3 text-cyan-400" />
                    {selectedTruck.license}
                    <span className="text-slate-500">#{selectedTruck.id}</span>
                  </span>
                )}
                {selectedMaterial && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/60 light:bg-slate-100 border border-slate-600/50 light:border-gray-200 px-2.5 py-1 text-xs text-slate-200 light:text-gray-800">
                    <Package className="h-3 w-3 text-emerald-400" />
                    {selectedMaterial.code}
                    <span className="text-slate-500 truncate max-w-[180px]">{selectedMaterial.name}</span>
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active weigh panel */}
        {activeOrder && (
          <div
            className={`rounded-xl border overflow-hidden ${
              isEntryPhase
                ? "border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-slate-900/50 to-slate-900/30 light:bg-white light:border-cyan-300"
                : "border-amber-500/40 bg-gradient-to-br from-amber-950/35 via-slate-900/50 to-slate-900/30 light:bg-white light:border-orange-300"
            }`}
          >
            <div
              className={`px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${
                isEntryPhase
                  ? "border-cyan-500/20 bg-cyan-500/10 light:bg-cyan-50 light:border-cyan-200"
                  : "border-amber-500/20 bg-amber-500/10 light:bg-orange-50 light:border-orange-200"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isEntryPhase
                      ? "bg-cyan-500/20 text-cyan-300 light:bg-cyan-100 light:text-cyan-700"
                      : "bg-amber-500/20 text-amber-300 light:bg-orange-100 light:text-orange-600"
                  }`}
                >
                  {isEntryPhase ? (
                    <ArrowDownToLine className="h-5 w-5" />
                  ) : (
                    <ArrowUpFromLine className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white light:text-gray-900">
                      {isEntryPhase ? "ENTRY weigh" : "EXIT weigh"}
                    </h3>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                        isEntryPhase
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 light:bg-cyan-100 light:text-cyan-700 light:border-cyan-300"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30 light:bg-orange-100 light:text-orange-600 light:border-orange-300"
                      }`}
                    >
                      {isEntryPhase ? "Scale 1 · IN" : "Scale 2 · OUT"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 light:text-gray-600 font-mono mt-0.5 truncate">
                    {activeOrder.ticket}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearActiveOrder}
                className="text-slate-400 hover:text-white light:text-gray-600 light:hover:text-gray-900"
              >
                Clear
              </Button>
            </div>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 light:bg-gray-50">
              {/* Truck / material summary */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-950/50 light:bg-white border border-slate-700/50 light:border-gray-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 light:text-gray-500 mb-1 flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Truck
                    </div>
                    <div className="text-lg font-semibold text-white light:text-gray-900 tracking-tight">
                      {activeOrder.truck_plate ?? `Truck ${activeOrder.truck_id}`}
                    </div>
                    <div className="text-xs text-slate-400 light:text-gray-500 mt-0.5">
                      {activeOrder.truck_driver ?? "No driver on file"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/50 light:bg-white border border-slate-700/50 light:border-gray-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 light:text-gray-500 mb-1 flex items-center gap-1">
                      <Package className="h-3 w-3" /> Material
                    </div>
                    <div className="text-lg font-semibold text-white light:text-gray-900 tracking-tight truncate">
                      {activeOrder.material_code}
                    </div>
                    <div className="text-xs text-slate-400 light:text-gray-500 mt-0.5 truncate">
                      {activeOrder.material_name ?? "—"}
                    </div>
                  </div>
                </div>

                {isExitPhase && (
                  <div className="rounded-lg bg-slate-950/40 light:bg-white border border-slate-700/40 light:border-gray-200 px-3 py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 light:text-gray-500">
                        Entry weight (Scale 1)
                      </div>
                      <div className="text-base font-semibold text-cyan-300 light:text-cyan-700 tabular-nums">
                        {fmtWeight(activeOrder.first_weight_kg)} kg
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 light:text-gray-500">
                      {fmtTime(activeOrder.first_ts)}
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-400 light:text-gray-600 pt-1">
                  {isEntryPhase
                    ? "Place the truck on Scale 1, wait for STABLE, then Capture & save."
                    : "Place the truck on Scale 2, wait for STABLE, then Capture & save."}
                </p>
              </div>

              {/* Live scale panel */}
              <div
                className={`rounded-xl border p-4 flex flex-col ${
                  isEntryPhase
                    ? "border-cyan-500/30 bg-slate-950/60 light:bg-white light:border-cyan-300"
                    : "border-amber-500/30 bg-slate-950/60 light:bg-white light:border-orange-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400 light:text-gray-600">
                    <Scale className="h-4 w-4" />
                    <span>
                      Live · {isEntryPhase ? "Scale 1" : "Scale 2"}
                      {liveReading?.ip ? ` · ${liveReading.ip}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {livePolling || liveReading?.ok ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400 light:text-green-600" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-red-400 light:text-red-600" />
                    )}
                    {liveReading?.ok && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          liveReading.stable
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 light:bg-green-100 light:text-green-700 light:border-green-300"
                            : "bg-orange-500/20 text-orange-300 border border-orange-500/30 light:bg-orange-100 light:text-orange-600 light:border-orange-300 animate-pulse"
                        }`}
                      >
                        {liveReading.stable ? "Stable" : "Unstable"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-4 min-h-[140px]">
                  {liveError && !liveReading?.ok ? (
                    <div className="text-center space-y-1 px-2">
                      <p className="text-red-400 light:text-red-600 text-sm font-medium">Scale offline</p>
                      <p className="text-xs text-slate-500 light:text-gray-500 break-all">{liveError}</p>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`text-5xl md:text-6xl font-bold tabular-nums tracking-tight ${
                          isEntryPhase
                            ? "text-cyan-300 light:text-cyan-700"
                            : "text-amber-300 light:text-orange-600"
                        }`}
                      >
                        {fmtWeight(liveReading?.weight_kg)}
                      </div>
                      <div className="text-sm text-slate-500 light:text-gray-500 mt-1 uppercase tracking-widest">
                        {liveReading?.unit || "kg"}
                        {liveReading?.mode ? ` · ${liveReading.mode}` : ""}
                      </div>
                    </>
                  )}
                </div>

                <Button
                  className={`w-full h-12 font-semibold text-base text-white shadow-lg disabled:opacity-50 ${
                    isEntryPhase
                      ? "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/40 light:bg-cyan-600 light:hover:bg-cyan-700 light:text-white"
                      : "bg-orange-600 hover:bg-orange-500 shadow-orange-900/40 light:bg-orange-600 light:hover:bg-orange-700 light:text-white"
                  }`}
                  onClick={handleCaptureAndSave}
                  disabled={
                    loading ||
                    !liveReading?.ok ||
                    !liveReading.stable ||
                    liveReading.weight_kg == null ||
                    liveReading.weight_kg <= 0
                  }
                >
                  {loading
                    ? "Saving…"
                    : isEntryPhase
                      ? "Capture & save entry"
                      : "Capture & save exit"}
                </Button>
                <p className="text-[10px] text-slate-500 light:text-gray-500 text-center mt-2">
                  Button enables when the scale reading is STABLE.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Open trips — awaiting entry or exit (no date filter) */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white light:text-gray-900">
                Open trips — on site
              </h3>
              <p className="text-xs text-slate-500 light:text-gray-500 mt-0.5">
                Shows every unfinished weigh. Removed only after both entry and exit are saved.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading}
              className="h-8 gap-1"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="p-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plate</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entry time</TableHead>
                  <TableHead>Entry weight (kg)</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTripOrders.map((row) => {
                  const needsEntry = row.status === "awaiting_first";
                  return (
                    <TableRow
                      key={row.id}
                      className={
                        activeOrder?.id === row.id
                          ? needsEntry
                            ? "bg-cyan-500/10"
                            : "bg-amber-500/10"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium text-white light:text-gray-900">
                        {row.truck_plate ?? `Truck ${row.truck_id}`}
                      </TableCell>
                      <TableCell>{row.truck_driver ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400 light:text-gray-500">
                            {row.material_code}
                          </span>
                          <span>{row.material_name ?? "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {needsEntry ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 light:bg-cyan-100 light:text-cyan-700 light:border-cyan-300">
                            Need entry · Scale 1
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-orange-500/15 text-orange-300 border border-orange-500/25 light:bg-orange-100 light:text-orange-600 light:border-orange-300">
                            Need exit · Scale 2
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{fmtTime(row.first_ts ?? row.created_at)}</TableCell>
                      <TableCell>
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 light:bg-cyan-100 border border-cyan-500/20 text-cyan-300 light:text-cyan-700 tabular-nums">
                          {row.first_weight_kg != null ? Math.round(row.first_weight_kg) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 font-mono">{row.ticket}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            className={`text-white h-8 ${
                              needsEntry
                                ? "bg-cyan-600 hover:bg-cyan-500 light:bg-cyan-600 light:text-white"
                                : "bg-orange-600 hover:bg-orange-500 light:bg-orange-600 light:text-white"
                            }`}
                            onClick={() => selectOrder(row)}
                          >
                            {needsEntry ? "Entry on Scale 1" : "Exit on Scale 2"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 border-red-500/40 text-red-400 hover:bg-red-500/15 hover:text-red-300 light:border-red-300 light:text-red-600 light:hover:bg-red-50"
                            onClick={() => setDeleteTarget(row)}
                            disabled={loading}
                            title="Delete trip"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {openTripOrders.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-slate-400 light:text-gray-500"
                    >
                      No open weigh trips — create a new entry above
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="bg-slate-900 border-slate-700 text-white light:bg-white light:border-gray-200 light:text-gray-900 sm:max-w-md">
            <AlertDialogHeader>
              <div className="mx-auto sm:mx-0 mb-2 h-11 w-11 rounded-full bg-red-500/15 light:bg-red-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-400 light:text-red-600" />
              </div>
              <AlertDialogTitle className="text-white light:text-gray-900">
                Delete open trip?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400 light:text-gray-600 space-y-2">
                <span className="block">
                  Remove{" "}
                  <span className="font-mono text-slate-200 light:text-gray-800">
                    {deleteTarget?.ticket}
                  </span>{" "}
                  for{" "}
                  <span className="font-semibold text-slate-200 light:text-gray-800">
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
              <AlertDialogCancel className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 light:border-gray-300 light:text-gray-700 light:hover:bg-gray-100">
                Keep trip
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-500 text-white light:bg-red-600 light:hover:bg-red-700 light:text-white"
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

export { TruckEntry };
