import React, { useState, useEffect } from "react";
import axios from "axios";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import { AlertTriangle, CheckCircle, Clock, Filter, Database, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSilos, useSilosPolling } from "../../contexts/SiloContext";

// // ✅ Mock data
// const mockSilos = [
//   {
//     id: 1,
//     name: "Silo A",
//     material: "Wheat",
//     capacity: 1000,
//     current: 750,
//     temperature: 25,
//     humidity: 60,
//     lastUpdated: "2025-08-02",
//     status: "Online",
//     utilization: 75,
//   },
//   {
//     id: 2,
//     name: "Silo B",
//     material: "Corn",
//     capacity: 1200,
//     current: 900,
//     temperature: 24,
//     humidity: 58,
//     lastUpdated: "2025-08-02",
//     status: "Warning",
//     utilization: 75,
//   },
//   {
//     id: 3,
//     name: "Silo C",
//     material: "Barley",
//     capacity: 1500,
//     current: 300,
//     temperature: 26,
//     humidity: 55,
//     lastUpdated: "2025-08-02",
//     status: "Offline",
//     utilization: 20,
//   },
// ];

// const mockBinMaterials = [
//   {
//     binName: "Bin X",
//     materialName: "Rice",
//     materialCode: "RC123",
//     hlActive: true,
//     lockActive: false,
//   },
//   {
//     binName: "Bin Y",
//     materialName: "Barley",
//     materialCode: "BL456",
//     hlActive: false,
//     lockActive: true,
//   },
// ];

export function Storage() {
  const { 
    allSilos, 
    db1Silos, 
    db2Silos, 
    db3Silos, 
    loading, 
    error, 
    lastUpdated, 
    fetchSilos
  } = useSilos();
  // Storage is a live silo view — opt in to polling here (not app-wide).
  useSilosPolling(15000);

  const [filters, setFilters] = useState({
    binName: "",
    materialName: "",
    materialCode: "",
    hlActive: "all",
    lockActive: "all",
    dbFilter: "all", // Filter by database (DB1, DB2, DB3, DB5)
  });
  
  const syncWithPLC = async () => {
    try {
      // First, sync with PLC to get fresh data
      const syncResponse = await axios.post('/api/plc/silos/sync');
      // Then refresh silo data from the updated database
      await fetchSilos();
    } catch (err) {
      
      // Still try to fetch silos even if sync fails
      await fetchSilos();
    }
  };
  
  

 
  // Get unique values for filters
  const uniqueMaterials = Array.from(
    new Set(allSilos.map((item) => item.material_name).filter(name => name && name.trim() !== ""))
  ).sort();
  const uniqueCodes = Array.from(
    new Set(allSilos.map((item) => item.material_code).filter(code => code && code.trim() !== ""))
  ).sort();
  const uniqueBins = Array.from(
    new Set(allSilos.map((item) => item.bin_name).filter(name => name && name.trim() !== ""))
  ).sort();

  // Filter silos based on current filters
  const filteredSilos = allSilos.filter((item) => {
    return (
      (filters.binName === "" ||
        item.bin_name.toLowerCase().includes(filters.binName.toLowerCase())) &&
      (filters.materialName === "all" ||
        filters.materialName === "" ||
        item.material_name === filters.materialName) &&
      (filters.materialCode === "all" ||
        filters.materialCode === "" ||
        item.material_code === filters.materialCode) &&
      (filters.hlActive === "all" ||
        (filters.hlActive === "true" ? item.hl_active : !item.hl_active)) &&
      (filters.lockActive === "all" ||
        (filters.lockActive === "true" ? item.lock_active : !item.lock_active)) &&
      (filters.dbFilter === "all" ||
        item.dbSource === filters.dbFilter)
    );
  });

  const clearFilters = () => {
    setFilters({
      binName: "",
      materialName: "",
      materialCode: "",
      hlActive: "all",
      lockActive: "all",
      dbFilter: "all",
    });
  };

  // Calculate statistics
  const totalSilos = allSilos.length;
  const activeSilos = allSilos.filter(silo => silo.material_code || silo.material_name).length;
  const hlActiveCount = allSilos.filter(silo => silo.hl_active).length;
  const lockActiveCount = allSilos.filter(silo => silo.lock_active).length;
  const totalQtyKg = allSilos.reduce((sum, s) => sum + (s.quantity_kg ?? 0), 0);

  return (
    <WaterSystemLayout
      title="Storage Management"
      subtitle="Real-time monitoring of silos and raw levels"
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPICard
            title="TOTAL SILOS"
            value={totalSilos.toString()}
            subtitle="All Databases"
            icon="gauge"
            color="blue"
            chartType="bar"
          />
          <KPICard
            title="ACTIVE SILOS"
            value={activeSilos.toString()}
            subtitle="With Materials"
            icon="water"
            color="green"
            chartType="line"
          />
          <KPICard
            title="HIGH LEVEL"
            value={hlActiveCount.toString()}
            subtitle="Sensors Active"
            icon="activity"
            color="orange"
            chartType="bar"
          />
          <KPICard
            title="LOCKED SILOS"
            value={lockActiveCount.toString()}
            subtitle="Currently Locked"
            icon="pump"
            color="purple"
            chartType="line"
          />
          <KPICard
            title="TOTAL INVENTORY"
            value={totalQtyKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            subtitle="KG (DB5 qty)"
            icon="gauge"
            color="cyan"
            chartType="bar"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => { void fetchSilos() }}
              variant="outline"
              className="text-sm border-slate-600 text-white light:border-gray-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100"
              disabled={loading}
            >
              {loading ? "🔄 Loading..." : "🔁 Refresh"}
            </Button>
            <Button 
              onClick={syncWithPLC} 
              variant="outline" 
              className="text-sm border-cyan-600 text-cyan-400 hover:bg-cyan-600/20"
              disabled={loading}
            >
              {loading ? "🔄 Syncing..." : "⚡ Sync PLC"}
            </Button>
            {error && (
              <div className="text-red-400 text-sm">
                ⚠️ {error}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Database className="h-4 w-4" />
            <span>Last updated: {lastUpdated}</span>
            <Zap className="h-4 w-4 text-green-400" />
            <span>Real-time</span>
          </div>
        </div>

        {/* Filter section */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              Bin Materials Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  Bin Name
                </label>
                <Input
                  type="text"
                  placeholder="Search bin..."
                  value={filters.binName}
                  onChange={(e) =>
                    setFilters({ ...filters, binName: e.target.value })
                  }
                  className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  Material Name
                </label>
                <Select
                  onValueChange={(value) =>
                    setFilters({ ...filters, materialName: value })
                  }
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Materials" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Materials</SelectItem>
                    {uniqueMaterials.map((material) => (
                      <SelectItem key={material} value={material || "unknown"}>
                        {material || "Unknown Material"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  Material Code
                </label>
                <Select
                  onValueChange={(value) =>
                    setFilters({ ...filters, materialCode: value })
                  }
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Codes" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Codes</SelectItem>
                    {uniqueCodes.map((code) => (
                      <SelectItem key={code} value={code || "unknown"}>
                        {code || "Unknown Code"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  HL Active
                </label>
                <Select
                  onValueChange={(value) =>
                    setFilters({ ...filters, hlActive: value })
                  }
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="true">Active (TRUE)</SelectItem>
                    <SelectItem value="false">Inactive (FALSE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  Lock Active
                </label>
                <Select
                  onValueChange={(value) =>
                    setFilters({ ...filters, lockActive: value })
                  }
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="true">Locked (TRUE)</SelectItem>
                    <SelectItem value="false">Unlocked (FALSE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">
                  Database
                </label>
                <Select
                  onValueChange={(value) =>
                    setFilters({ ...filters, dbFilter: value })
                  }
                >
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All DBs" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Databases</SelectItem>
                    <SelectItem value="DB1">DB1 - Intake</SelectItem>
                    <SelectItem value="DB2">DB2 - Outloading</SelectItem>
                    <SelectItem value="DB3">DB3 - Main Storage</SelectItem>
                    <SelectItem value="DB5">DB5 - Qty Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={clearFilters}
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 light:border-gray-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 h-8"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real-time Silo Data Table */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">
          {/* Header */}
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white light:text-gray-900">
                Real-time Silo Monitoring
              </h3>
              <div className="text-sm text-slate-400">
                Showing {filteredSilos.length} of {totalSilos} silos
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="p-6">
            <div className="rounded-md border border-slate-700/30 light:border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Silo Name
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Material Name
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Material Code
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Quantity (KG)
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      High Level
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Lock Status
                    </TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSilos.map((silo, index) => {
                    const isEven = index % 2 === 0;
                    const hasMaterial = silo.material_code || silo.material_name;
                    const isActive = hasMaterial || silo.hl_active || silo.lock_active;
                    
                    return (
                      <TableRow
                        key={`${silo.dbSource}-${silo.bin_name}-${index}`}
                        className={`border-slate-700/30 light:border-gray-200 transition-colors ${
                          isEven 
                            ? "bg-slate-800/20 light:bg-white hover:bg-slate-700/30 light:hover:bg-gray-50" 
                            : "bg-slate-900/20 light:bg-blue-50/20 hover:bg-slate-700/30 light:hover:bg-blue-50/40"
                        }`}
                      >
                        <TableCell className="text-white light:text-gray-900 font-medium">
                          {silo.bin_name}
                        </TableCell>
                        <TableCell className="text-slate-300 light:text-gray-700">
                          {silo.material_name || "—"}
                        </TableCell>
                        <TableCell className="text-slate-300 light:text-gray-700">
                          {silo.material_code || "—"}
                        </TableCell>
                        <TableCell className="text-slate-300 light:text-gray-700 tabular-nums">
                          {(silo.quantity_kg ?? 0).toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                            minimumFractionDigits: 0,
                          })}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              silo.hl_active
                                ? "text-orange-400 light:text-orange-600 bg-orange-500/10 light:bg-orange-100"
                                : "text-gray-400 light:text-gray-600 bg-gray-500/10 light:bg-gray-100"
                            }`}
                          >
                            {silo.hl_active ? "HIGH" : "NORMAL"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              silo.lock_active
                                ? "text-red-400 light:text-red-600 bg-red-500/10 light:bg-red-100"
                                : "text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100"
                            }`}
                          >
                            {silo.lock_active ? "LOCKED" : "UNLOCKED"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? "text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100"
                                : "text-gray-400 light:text-gray-600 bg-gray-500/10 light:bg-gray-100"
                            }`}
                          >
                            {isActive ? "ACTIVE" : "EMPTY"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>


      </div>
    </WaterSystemLayout>
  );
}
