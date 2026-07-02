import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { API_BASE_URL } from "../../config/api";
import { getSelectableMaterialCodes } from "../../constants/materialCodes";
import {
  createTruckWeighOrder,
  fetchOpenOrders,
  saveFirstWeight,
  saveSecondWeight,
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
  const [firstWeightInput, setFirstWeightInput] = useState("");
  const [secondWeightInput, setSecondWeightInput] = useState("");

  const selectableMaterials = useMemo(() => getSelectableMaterialCodes(), []);

  const outPendingOrders = useMemo(
    () => openOrders.filter((o) => o.status === "awaiting_second"),
    [openOrders]
  );

  const awaitingFirstCount = useMemo(
    () => openOrders.filter((o) => o.status === "awaiting_first").length,
    [openOrders]
  );

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

  function selectOrder(order: TruckWeighOrder) {
    setActiveOrder(order);
    setFirstWeightInput(order.first_weight_kg != null ? String(order.first_weight_kg) : "");
    setSecondWeightInput("");
    setMessage(null);
    setErrorMsg(null);
  }

  function clearActiveOrder() {
    setActiveOrder(null);
    setFirstWeightInput("");
    setSecondWeightInput("");
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
      setFirstWeightInput("");
      setSecondWeightInput("");
      resetNewEntryForm();
      setMessage(`Order ${order.ticket} created — enter entry weight.`);
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveFirst() {
    if (!activeOrder) return;
    const w = Number(firstWeightInput);
    if (!w || w <= 0) {
      setErrorMsg("Enter a valid entry weight (kg).");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const updated = await saveFirstWeight(activeOrder.id, w);
      setActiveOrder(updated);
      resetNewEntryForm();
      setMessage(`Entry weight saved. Truck is on site — OUT pending.`);
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save entry weight");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSecond() {
    if (!activeOrder) return;
    const w = Number(secondWeightInput);
    if (!w || w <= 0) {
      setErrorMsg("Enter a valid exit weight (kg).");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const updated = await saveSecondWeight(activeOrder.id, w);
      setMessage(`Trip completed. NET = ${Math.round(updated.net_kg ?? 0)} kg — see Weighbridge Log.`);
      clearActiveOrder();
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save exit weight");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WaterSystemLayout
      title="Weighbridge Entry"
      subtitle="Create new entries and record exit weights for trucks on site"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPICard title="OUT PENDING" value={String(outPendingOrders.length)} icon="pump" color="purple" chartType="line" />
          <KPICard title="AWAITING ENTRY WEIGHT" value={String(awaitingFirstCount)} icon="activity" color="orange" chartType="circle" />
          <KPICard title="ON SCALE" value={activeOrder ? "1" : "0"} icon="gauge" color="blue" chartType="bar" />
        </div>

        {(message || errorMsg) && (
          <div className="text-sm px-1">
            {message && <span className="text-green-400 light:text-green-700">{message}</span>}
            {errorMsg && <span className="text-red-400 light:text-red-700 ml-3">{errorMsg}</span>}
          </div>
        )}

        {/* New entry */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> New entry
            </CardTitle>
          </CardHeader>
          <CardContent key={newEntryFormKey} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 light:text-gray-700 text-xs">Truck</label>
              <Select value={newTruckId || undefined} onValueChange={setNewTruckId}>
                <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700">
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                  {truckData.map((truck) => (
                    <SelectItem key={truck.id} value={String(truck.id)}>
                      {truck.id} — {truck.license} ({truck.model})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-300 light:text-gray-700 text-xs">Material</label>
              <Select value={newMaterialCode || undefined} onValueChange={setNewMaterialCode}>
                <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700">
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
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={handleCreate}
                disabled={loading}
              >
                Create
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Active order — entry or exit weight */}
        {activeOrder && (
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 border-cyan-500/30">
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-white light:text-gray-900 text-sm">Active order</CardTitle>
                <p className="text-xs text-slate-400 light:text-gray-600 mt-1">
                  {activeOrder.ticket} · {activeOrder.truck_plate ?? `Truck ${activeOrder.truck_id}`} ·{" "}
                  {activeOrder.material_name ?? activeOrder.material_code}
                </p>
                <p className="text-xs text-cyan-400 light:text-cyan-600 mt-0.5">
                  {activeOrder.status === "awaiting_first" ? "Enter entry weight" : "Enter exit weight"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearActiveOrder} className="text-slate-400">
                Clear
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeOrder.status === "awaiting_first" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="number"
                    placeholder="Entry weight (kg)"
                    value={firstWeightInput}
                    onChange={(e) => setFirstWeightInput(e.target.value)}
                    className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                  />
                  <Button onClick={handleSaveFirst} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                    Save entry weight
                  </Button>
                </div>
              )}

              {activeOrder.status === "awaiting_second" && (
                <>
                  <div className="rounded-md bg-slate-900/50 light:bg-gray-100 p-3 text-sm">
                    <span className="text-slate-400 light:text-gray-600">Entry weight: </span>
                    <span className="font-semibold text-white light:text-gray-900">
                      {Math.round(activeOrder.first_weight_kg ?? 0)} kg
                    </span>
                    <span className="text-slate-500 light:text-gray-500 ml-2">@ {fmtTime(activeOrder.first_ts)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="number"
                      placeholder="Exit weight (kg)"
                      value={secondWeightInput}
                      onChange={(e) => setSecondWeightInput(e.target.value)}
                      className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                    />
                    <Button onClick={handleSaveSecond} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                      Save exit weight
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* OUT pending — trucks on site with entry weight */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white light:text-gray-900">OUT pending — on site</h3>
            <Button variant="outline" size="sm" onClick={refreshData} disabled={loading} className="h-8 gap-1">
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
                  <TableHead>Entry time</TableHead>
                  <TableHead>Entry weight (kg)</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outPendingOrders.map((row) => (
                  <TableRow
                    key={row.id}
                    className={activeOrder?.id === row.id ? "bg-cyan-500/10" : undefined}
                  >
                    <TableCell className="font-medium text-white light:text-gray-900">
                      {row.truck_plate ?? `Truck ${row.truck_id}`}
                    </TableCell>
                    <TableCell>{row.truck_driver ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400 light:text-gray-500">{row.material_code}</span>
                        <span>{row.material_name ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{fmtTime(row.first_ts)}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 text-yellow-400 light:text-yellow-600">
                        {row.first_weight_kg != null ? Math.round(row.first_weight_kg) : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 font-mono">{row.ticket}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="bg-cyan-600 hover:bg-cyan-700 text-white h-8"
                        onClick={() => selectOrder(row)}
                      >
                        Record exit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {outPendingOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 light:text-gray-500">
                      No trucks waiting for exit weight
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {awaitingFirstCount > 0 && (
          <p className="text-xs text-slate-400 light:text-gray-500 px-1">
            {awaitingFirstCount} order(s) still need entry weight — use Create above or refresh after saving.
          </p>
        )}
      </div>
    </WaterSystemLayout>
  );
}

export { TruckEntry };
