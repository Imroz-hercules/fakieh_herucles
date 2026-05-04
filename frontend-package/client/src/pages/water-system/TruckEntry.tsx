import React, { useState, useEffect, useMemo, useRef } from 'react'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { KPICard } from '../../components/water-system/KPICard'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------- Config ----------
const API_BASE = "http://localhost:5000"

// ---------- Types from /api/weights/today ----------
interface Row {
  ticket: string;
  truck_id: number | string;
  truck_plate?: string | null;
  truck_driver?: string | null;
  truck_material?: string | null; // derived from RFIDLog.order_ref
  // weights
  weight: string;       // NET display e.g. "24T" or "24000 kg"
  weight_kg: number;    // NET exact kg
  in_weight_kg?: number | null;
  out_weight_kg?: number | null;
  // flags
  rfid_linked: boolean;
  order_linked: string | null;
  // timestamps
  in_ts?: string | null;
  out_ts?: string | null;
}

function fmtTime(ts?: string | null) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

export default function TruckEntry() {
  // ------- table state -------
  const [weighbridgeData, setWeighbridgeData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ------- forms -------
  const [truckIdIn, setTruckIdIn] = useState("");
  const [weightIn, setWeightIn] = useState("");
  const [truckIdOut, setTruckIdOut] = useState("");
  const [weightOut, setWeightOut] = useState("");

  // ------- truck data for dropdowns -------
  const [truckData, setTruckData] = useState<Array<{id: number, license: string, model: string}>>([]);

  // ------- filters -------
  const [filters, setFilters] = useState({
    truckId: "",
    truckPlate: "",
    truckDriver: "",
  });

  // ------- helpers -------
  function normalizeRows(data: any): Row[] {
    // Preferred: rows (table-ready)
    if (Array.isArray(data?.rows)) {
      return data.rows.map((r: any) => ({
        ticket: r.ticket ?? `${r.truck_id}-${r.out_ts ?? ''}`,
        truck_id: r.truck_id,
        truck_plate: r.truck_plate ?? null,
        truck_driver: r.truck_driver ?? null,
        truck_material: r.truck_material ?? r.order_linked ?? null,
        weight: r.weight,                       // NET display
        weight_kg: Number(r.weight_kg ?? 0),    // NET exact
        in_weight_kg: r.in_weight ?? r.in_weight_kg ?? null,
        out_weight_kg: r.out_weight ?? r.out_weight_kg ?? null,
        rfid_linked: !!r.rfid_linked,
        order_linked: r.order_linked ?? null,
        in_ts: r.in_ts ?? null,
        out_ts: r.out_ts ?? null,
      }));
    }
    // Fallback: pairs (classic)
    if (Array.isArray(data?.pairs)) {
      return data.pairs.map((p: any) => {
        const net = typeof p.net === 'number' ? p.net : (p.out_weight != null && p.in_weight != null ? p.out_weight - p.in_weight : 0);
        return {
          ticket: `${p.truck_id}-${p.out_ts ?? ''}`,
          truck_id: p.truck_id,
          truck_plate: p.truck_plate ?? null,
          truck_driver: p.truck_driver ?? null,
          truck_material: p.order_linked ?? null,
          weight: `${Math.round(net)} kg`,
          weight_kg: net ?? 0,
          in_weight_kg: p.in_weight ?? null,
          out_weight_kg: p.out_weight ?? null,
          rfid_linked: !!p.order_linked,
          order_linked: p.order_linked ?? null,
          in_ts: p.in_ts ?? null,
          out_ts: p.out_ts ?? null,
        } as Row;
      });
    }
    return [];
  }

  async function fetchTable() {
    setErrorMsg(null);
    setMessage(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      // Ask for kg so we can show exact numbers
      const res = await fetch(`${API_BASE}/api/weights/today?unit=kg`, { signal: ac.signal });
      const data = await res.json();
      setWeighbridgeData(normalizeRows(data));
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        
        setErrorMsg("Failed to load table");
        setWeighbridgeData([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchTrucks() {
    try {
      const res = await fetch(`${API_BASE}/api/trucks/`);
      const data = await res.json();
      setTruckData(data);
    } catch (err) {
      
      setTruckData([]);
    }
  }

  async function postJSON(path: string, body: any) {
    setErrorMsg(null);
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  useEffect(() => {
    fetchTable();
    fetchTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unique options for filters
  const uniqueMaterials = useMemo(
    () => Array.from(new Set(weighbridgeData.map((i) => i.truck_material).filter(Boolean))).sort(),
    [weighbridgeData]
  );
  const uniqueOrders = useMemo(
    () => Array.from(new Set(weighbridgeData.map((i) => i.order_linked).filter((o) => o && o !== "NA"))).sort() as string[],
    [weighbridgeData]
  );

  // apply filters
  const filteredWeighbridgeData = useMemo(() => {
    return weighbridgeData.filter((item) => {
      if (!item) return false;
      return (
        (filters.truckId === "" || String(item.truck_id ?? "").includes(filters.truckId)) &&
        (filters.truckPlate === "" || String(item.truck_plate ?? "").toLowerCase().includes(filters.truckPlate.toLowerCase())) &&
        (filters.truckDriver === "" || String(item.truck_driver ?? "").toLowerCase().includes(filters.truckDriver.toLowerCase()))
      );
    });
  }, [weighbridgeData, filters]);

  function clearFilters() {
    setFilters({ truckId: "", truckPlate: "", truckDriver: "" });
  }

  // KPI values
  const totalTrucks = filteredWeighbridgeData.length;
  const completeToday = weighbridgeData.length; // all rows are completed pairs
  const weighingNow = 0;
  const activeBays = 1;

  // Handlers: IN, OUT
  async function handleSaveIn() {
    const id = Number(truckIdIn), w = Number(weightIn);
    if (!id || !w) return setErrorMsg("Truck ID and IN weight are required.");
    try {
      setLoading(true);
      const resp = await postJSON("/api/weigh/in", { truck_id: id, weight: w });
      setMessage(`IN saved for Truck ${resp.truck_id} @ ${resp.weight} kg`);
      setWeightIn("");
      await fetchTable();
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save IN");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOut() {
    const id = Number(truckIdOut), w = Number(weightOut);
    if (!id || !w) return setErrorMsg("Truck ID and OUT weight are required.");
    try {
      setLoading(true);
      const resp = await postJSON("/api/weigh/out", { truck_id: id, weight: w });
      if (resp.warning) setErrorMsg(resp.warning);
      else setMessage(`OUT saved. NET = ${resp.NET} kg (Truck ${resp.truck_id})`);
      setWeightOut("");
      await fetchTable();
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save OUT");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WaterSystemLayout title="Truck Entry" subtitle="Vehicle weighing, truck logging, and weight management">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="TOTAL TRUCKS" value={String(totalTrucks)} icon="gauge" color="blue" chartType="bar" />
          <KPICard title="ACTIVE BAYS" value={String(activeBays)} icon="activity" color="orange" chartType="circle" />
          <KPICard title="WEIGHING" value={String(weighingNow)} icon="pump" color="purple" chartType="line" />
          <KPICard title="COMPLETE TODAY" value={String(completeToday)} icon="water" color="green" chartType="gauge" />
        </div>

        {/* Controls: Gate IN and OUT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gate IN */}
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3"><CardTitle className="text-white light:text-gray-900 text-sm">Gate IN</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <label className="text-slate-300 light:text-gray-700 text-xs">Truck ID</label>
                <Select onValueChange={(value) => setTruckIdIn(value)} value={truckIdIn || "manual"}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700">
                    <SelectValue placeholder="Select Truck or Enter Manually" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="manual">Enter Manually</SelectItem>
                    {truckData.map((truck) => (
                      <SelectItem key={truck.id} value={String(truck.id)}>
                        {truck.id} - {truck.license} ({truck.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {truckIdIn === "manual" && (
                  <Input 
                    placeholder="Enter Truck ID manually" 
                    value={truckIdIn === "manual" ? "" : truckIdIn} 
                    onChange={(e) => setTruckIdIn(e.target.value)}
                    className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                  />
                )}
              </div>
              <Input placeholder="IN Weight (kg)" value={weightIn} onChange={(e)=>setWeightIn(e.target.value)} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700" />
              <Button size="sm" onClick={handleSaveIn} disabled={loading} className="bg-cyan-600 text-white light:bg-cyan-600 light:text-white hover:bg-cyan-700 light:hover:bg-cyan-700">Save IN</Button>
            </CardContent>
          </Card>

          {/* Gate OUT */}
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3"><CardTitle className="text-white light:text-gray-900 text-sm">Gate OUT</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <label className="text-slate-300 light:text-gray-700 text-xs">Truck ID</label>
                <Select onValueChange={(value) => setTruckIdOut(value)} value={truckIdOut || "manual"}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700">
                    <SelectValue placeholder="Select Truck or Enter Manually" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="manual">Enter Manually</SelectItem>
                    {truckData.map((truck) => (
                      <SelectItem key={truck.id} value={String(truck.id)}>
                        {truck.id} - {truck.license} ({truck.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {truckIdOut === "manual" && (
                  <Input 
                    placeholder="Enter Truck ID manually" 
                    value={truckIdOut === "manual" ? "" : truckIdOut} 
                    onChange={(e) => setTruckIdOut(e.target.value)}
                    className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700"
                  />
                )}
              </div>
              <Input placeholder="OUT Weight (kg)" value={weightOut} onChange={(e)=>setWeightOut(e.target.value)} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700" />
              <Button size="sm" onClick={handleSaveOut} disabled={loading} className="bg-cyan-600 text-white light:bg-cyan-600 light:text-white hover:bg-cyan-700 light:hover:bg-cyan-700">Save OUT</Button>
            </CardContent>
          </Card>
        </div>

        {/* Filter Section */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              Truck Entry Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck ID</label>
                <Input type="text" placeholder="Search ID..." value={filters.truckId} onChange={(e) => setFilters({ ...filters, truckId: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck Plate</label>
                <Input type="text" placeholder="Search plate..." value={filters.truckPlate} onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Driver</label>
                  <Input type="text" placeholder="Search driver..." value={filters.truckDriver} onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
                </div>
                <Button onClick={clearFilters} variant="outline" size="sm" className="border-slate-600 text-slate-300 light:border-gray-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 h-8">
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weighbridge Data Table */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white light:text-gray-900">Weighbridge Data Table</h3>
            {(message || errorMsg) && (
              <div className="text-xs">
                {message && <span className="text-green-400 light:text-green-700 mr-3">{message}</span>}
                {errorMsg && <span className="text-red-400 light:text-red-700">{errorMsg}</span>}
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="rounded-md border border-slate-700/30 light:border-gray-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck ID</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck Plate</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Driver</TableHead>
                    {/* New time + weight columns */}
                    <TableHead className="text-white light:text-gray-900 font-semibold">IN Time</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">OUT Time</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">IN (kg)</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">OUT (kg)</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">NET (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWeighbridgeData.map((item, index) => (
                    <TableRow key={index} className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/30 light:hover:bg-gray-50 transition-colors">
                      <TableCell className="text-white light:text-gray-900 font-medium">{item.truck_id}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.truck_plate ?? "-"}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.truck_driver ?? "-"}</TableCell>

                      <TableCell className="text-slate-300 light:text-gray-700">{fmtTime(item.in_ts)}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{fmtTime(item.out_ts)}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.in_weight_kg != null ? Math.round(item.in_weight_kg) : "-"}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.out_weight_kg != null ? Math.round(item.out_weight_kg) : "-"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 light:border-yellow-300 text-yellow-400 light:text-yellow-600">
                          {Math.round(item.weight_kg)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredWeighbridgeData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-sm text-slate-400 light:text-gray-600">No records</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </WaterSystemLayout>
  );
}

// Optional named export
export { TruckEntry };
