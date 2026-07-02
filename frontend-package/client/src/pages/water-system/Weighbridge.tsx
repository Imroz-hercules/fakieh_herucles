import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import { Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCompletedToday, fetchOpenOrders, type TruckWeighOrder } from "../../api/truckEntry";
import { getSelectableMaterialCodes } from "../../constants/materialCodes";

function fmtTime(ts?: string | null) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

export default function Weighbridge() {
  const [completedRows, setCompletedRows] = useState<TruckWeighOrder[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [outPendingCount, setOutPendingCount] = useState(0);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    truckId: "",
    truckPlate: "",
    truckDriver: "",
    material: "all",
  });

  const selectableMaterials = useMemo(() => getSelectableMaterialCodes(), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [completedResult, open] = await Promise.all([fetchCompletedToday(), fetchOpenOrders()]);
      setCompletedRows(completedResult.rows);
      setReportDate(completedResult.date);
      setOpenCount(open.length);
      setOutPendingCount(open.filter((o) => o.status === "awaiting_second").length);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load weighbridge log");
      setCompletedRows([]);
      setOpenCount(0);
      setOutPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const uniqueMaterialsInData = useMemo(
    () =>
      Array.from(
        new Set(completedRows.map((r) => r.material_code).filter(Boolean))
      ).sort(),
    [completedRows]
  );

  const filteredRows = useMemo(() => {
    return completedRows.filter((item) => {
      const matName = item.material_name ?? "";
      const matCode = item.material_code ?? "";
      const materialMatch =
        filters.material === "all" ||
        matCode === filters.material ||
        matName === filters.material;

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
        materialMatch
      );
    });
  }, [completedRows, filters]);

  const totalNetKg = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (r.net_kg ?? 0), 0),
    [filteredRows]
  );

  function clearFilters() {
    setFilters({ truckId: "", truckPlate: "", truckDriver: "", material: "all" });
  }

  return (
    <WaterSystemLayout
      title="Weighbridge Log"
      subtitle="Read-only log of completed truck weigh trips"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            title="COMPLETED TODAY"
            value={String(completedRows.length)}
            icon="water"
            color="green"
            chartType="gauge"
          />
          <KPICard
            title="FILTERED ROWS"
            value={String(filteredRows.length)}
            icon="gauge"
            color="blue"
            chartType="bar"
          />
          <KPICard
            title="OUT PENDING"
            value={String(outPendingCount)}
            icon="pump"
            color="purple"
            chartType="line"
          />
          <KPICard
            title="TOTAL NET (kg)"
            value={String(Math.round(totalNetKg))}
            icon="activity"
            color="orange"
            chartType="circle"
          />
        </div>

        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
                Weighbridge filters
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="h-8 gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck ID</label>
                <Input
                  placeholder="Search ID..."
                  value={filters.truckId}
                  onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}
                  className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck plate</label>
                <Input
                  placeholder="Search plate..."
                  value={filters.truckPlate}
                  onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })}
                  className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Driver</label>
                <Input
                  placeholder="Search driver..."
                  value={filters.truckDriver}
                  onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })}
                  className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Material</label>
                <Select
                  value={filters.material}
                  onValueChange={(value) => setFilters({ ...filters, material: value })}
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 h-8 text-sm">
                    <SelectValue placeholder="All materials" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All materials</SelectItem>
                    {uniqueMaterialsInData.map((code) => {
                      const label = selectableMaterials.find((m) => m.code === code);
                      return (
                        <SelectItem key={code} value={code}>
                          {label ? `${code} — ${label.name}` : code}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={clearFilters}
                  variant="outline"
                  size="sm"
                  className="h-8 w-full border-slate-600"
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white light:text-gray-900">
                Completed weighbridge trips
              </h3>
              {reportDate && (
                <p className="text-xs text-slate-400 light:text-gray-500 mt-1">Date: {reportDate}</p>
              )}
            </div>
            {errorMsg && (
              <span className="text-xs text-red-400 light:text-red-700">{errorMsg}</span>
            )}
            {openCount > 0 && !errorMsg && (
              <span className="text-xs text-amber-400 light:text-amber-700">
                {openCount} open trip(s) on Weighbridge Entry — not shown here
              </span>
            )}
          </div>

          <div className="p-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Truck ID</TableHead>
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
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-slate-400 light:text-gray-500 text-xs font-mono">
                      {row.ticket}
                    </TableCell>
                    <TableCell className="font-medium text-white light:text-gray-900">
                      {row.truck_id}
                    </TableCell>
                    <TableCell>{row.truck_plate ?? "-"}</TableCell>
                    <TableCell>{row.truck_driver ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400 light:text-gray-500">
                          {row.material_code}
                        </span>
                        <span>{row.material_name ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{fmtTime(row.first_ts)}</TableCell>
                    <TableCell>{fmtTime(row.second_ts)}</TableCell>
                    <TableCell>
                      {row.first_weight_kg != null ? Math.round(row.first_weight_kg) : "-"}
                    </TableCell>
                    <TableCell>
                      {row.second_weight_kg != null ? Math.round(row.second_weight_kg) : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 text-yellow-400 light:text-yellow-600">
                        {row.net_kg != null ? Math.round(row.net_kg) : "-"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-8 text-sm text-slate-400 light:text-gray-500"
                    >
                      {loading ? "Loading..." : "No completed trips today"}
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

export { Weighbridge };
