import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import { Filter, Plus, RefreshCw } from "lucide-react";
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
  fetchCompletedToday,
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

function statusLabel(status: TruckWeighOrder["status"]) {
  if (status === "awaiting_first") return "Awaiting first weight";
  if (status === "awaiting_second") return "OUT pending";
  if (status === "completed") return "Completed";
  return status;
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
  const [firstWeightInput, setFirstWeightInput] = useState("");
  const [secondWeightInput, setSecondWeightInput] = useState("");

  const [filters, setFilters] = useState({
    truckId: "",
    truckPlate: "",
    truckDriver: "",
    material: "all",
  });

  const selectableMaterials = useMemo(() => getSelectableMaterialCodes(), []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [open, today] = await Promise.all([fetchOpenOrders(), fetchCompletedToday()]);
      setOpenOrders(open);
      setCompletedToday(today);
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

  const outPendingCount = openOrders.filter((o) => o.status === "awaiting_second").length;

  const filteredCompleted = useMemo(() => {
    return completedToday.filter((item) => {
      const matLabel = item.material_name || item.material_code || "";
      return (
        (filters.truckId === "" || String(item.truck_id).includes(filters.truckId)) &&
        (filters.truckPlate === "" ||
          String(item.truck_plate ?? "")
            .toLowerCase()
            .includes(filters.truckPlate.toLowerCase())) &&
        (filters.truckDriver === "" ||
          String(item.truck_driver ?? "")
            .toLowerCase()
            .includes(filters.truckDriver.toLowerCase())) &&
        (filters.material === "all" || item.material_code === filters.material)
      );
    });
  }, [completedToday, filters]);

  function clearFilters() {
    setFilters({ truckId: "", truckPlate: "", truckDriver: "", material: "all" });
  }

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
      setNewTruckId("");
      setNewMaterialCode("");
      setMessage(`Order ${order.ticket} created — enter first weight.`);
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
      setErrorMsg("Enter a valid first weight (kg).");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const updated = await saveFirstWeight(activeOrder.id, w);
      setActiveOrder(updated);
      setMessage(`First weight saved. OUT pending for ${updated.truck_plate ?? updated.truck_id}.`);
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save first weight");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSecond() {
    if (!activeOrder) return;
    const w = Number(secondWeightInput);
    if (!w || w <= 0) {
      setErrorMsg("Enter a valid second weight (kg).");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const updated = await saveSecondWeight(activeOrder.id, w);
      setMessage(`Trip completed. NET = ${Math.round(updated.net_kg ?? 0)} kg`);
      clearActiveOrder();
      await refreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save second weight");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WaterSystemLayout
      title="Truck Weighbridge"
      subtitle="Create entry, record first and second weights manually"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="OPEN ORDERS" value={String(openOrders.length)} icon="activity" color="orange" chartType="circle" />
          <KPICard title="OUT PENDING" value={String(outPendingCount)} icon="pump" color="purple" chartType="line" />
          <KPICard title="COMPLETE TODAY" value={String(completedToday.length)} icon="water" color="green" chartType="gauge" />
          <KPICard title="ON SCALE" value={activeOrder ? "1" : "0"} icon="gauge" color="blue" chartType="bar" />
        </div>

        {(message || errorMsg) && (
          <div className="text-sm px-1">
            {message && <span className="text-green-400 light:text-green-700">{message}</span>}
            {errorMsg && <span className="text-red-400 light:text-red-700 ml-3">{errorMsg}</span>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Open orders sidebar */}
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-white light:text-gray-900 text-sm">Open orders</CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshData} disabled={loading} className="h-8 w-8 p-0">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {openOrders.length === 0 && (
                <p className="text-xs text-slate-400 light:text-gray-500 py-4 text-center">No open orders</p>
              )}
              {openOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => selectOrder(order)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    activeOrder?.id === order.id
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-slate-600 light:border-gray-200 hover:bg-slate-700/40 light:hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white light:text-gray-900">
                      {order.truck_plate ?? `Truck ${order.truck_id}`}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        order.status === "awaiting_second"
                          ? "bg-yellow-500/20 text-yellow-400 light:text-yellow-700"
                          : "bg-blue-500/20 text-blue-400 light:text-blue-700"
                      }`}
                    >
                      {order.status === "awaiting_second" ? "OUT pending" : "First weight"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 light:text-gray-600 mt-1">
                    {order.material_code} — {order.material_name}
                  </p>
                  <p className="text-xs text-slate-500 light:text-gray-500">{order.ticket}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* New entry + active order */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-white light:text-gray-900 text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" /> New entry
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

            {activeOrder && (
              <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 border-cyan-500/30">
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-white light:text-gray-900 text-sm">Active order</CardTitle>
                    <p className="text-xs text-slate-400 light:text-gray-600 mt-1">
                      {activeOrder.ticket} · {activeOrder.truck_plate ?? `Truck ${activeOrder.truck_id}`} ·{" "}
                      {activeOrder.material_name ?? activeOrder.material_code}
                    </p>
                    <p className="text-xs text-cyan-400 light:text-cyan-600 mt-0.5">{statusLabel(activeOrder.status)}</p>
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
                        placeholder="First weight — entry to site (kg)"
                        value={firstWeightInput}
                        onChange={(e) => setFirstWeightInput(e.target.value)}
                        className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                      />
                      <Button onClick={handleSaveFirst} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                        Save first weight
                      </Button>
                    </div>
                  )}

                  {activeOrder.status === "awaiting_second" && (
                    <>
                      <div className="rounded-md bg-slate-900/50 light:bg-gray-100 p-3 text-sm">
                        <span className="text-slate-400 light:text-gray-600">First weight: </span>
                        <span className="font-semibold text-white light:text-gray-900">
                          {Math.round(activeOrder.first_weight_kg ?? 0)} kg
                        </span>
                        <span className="text-slate-500 light:text-gray-500 ml-2">@ {fmtTime(activeOrder.first_ts)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="number"
                          placeholder="Second weight — leaving site (kg)"
                          value={secondWeightInput}
                          onChange={(e) => setSecondWeightInput(e.target.value)}
                          className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                        />
                        <Button onClick={handleSaveSecond} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                          Save second weight
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              Completed today — filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                placeholder="Truck ID"
                value={filters.truckId}
                onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}
                className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
              />
              <Input
                placeholder="Plate"
                value={filters.truckPlate}
                onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })}
                className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
              />
              <Input
                placeholder="Driver"
                value={filters.truckDriver}
                onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })}
                className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
              />
              <div className="flex gap-2">
                <Select value={filters.material} onValueChange={(v) => setFilters({ ...filters, material: v })}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm flex-1">
                    <SelectValue placeholder="Material" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All materials</SelectItem>
                    {selectableMaterials.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.code} — {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={clearFilters} variant="outline" size="sm" className="h-8">
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's completed table */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200">
            <h3 className="text-lg font-semibold text-white light:text-gray-900">Completed today</h3>
          </div>
          <div className="p-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>IN time</TableHead>
                  <TableHead>OUT time</TableHead>
                  <TableHead>IN (kg)</TableHead>
                  <TableHead>OUT (kg)</TableHead>
                  <TableHead>NET (kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompleted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.truck_id}</TableCell>
                    <TableCell>{row.truck_plate ?? "-"}</TableCell>
                    <TableCell>{row.truck_driver ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400">{row.material_code}</span>
                        <span>{row.material_name ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{fmtTime(row.first_ts)}</TableCell>
                    <TableCell>{fmtTime(row.second_ts)}</TableCell>
                    <TableCell>{row.first_weight_kg != null ? Math.round(row.first_weight_kg) : "-"}</TableCell>
                    <TableCell>{row.second_weight_kg != null ? Math.round(row.second_weight_kg) : "-"}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        {row.net_kg != null ? Math.round(row.net_kg) : "-"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCompleted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-400 light:text-gray-500">
                      No completed trips today
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </WaterSystemLayout>
  );
}

export { TruckEntry };
