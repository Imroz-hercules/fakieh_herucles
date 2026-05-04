import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { SiloProvider } from "@/contexts/SiloContext";
import { AppLayout } from "@/components/AppLayout";
import NotFound from "@/pages/not-found";
import FacilityOverview from "@/pages/FacilityOverview";
import ProcessFlow from "@/pages/ProcessFlow";
import WaterQuality from "@/pages/WaterQuality";
import EnergyMonitoring from "@/pages/EnergyMonitoring";
import Maintenance from "@/pages/Maintenance";
import ChemicalDosing from "@/pages/ChemicalDosing";

// Water System Pages
import { Dashboard as WaterDashboard } from "./pages/water-system/Dashboard";
import FakiehDashboard from "./pages/water-system/FakiehDashboard";
import { Material } from "./pages/water-system/Material";
import { Storage } from "./pages/water-system/Storage";
import { Production } from "./pages/water-system/Production";
import { Orders } from "./pages/water-system/Orders";
import { OrderHistory } from "./pages/water-system/OrderHistory";
import { RFID } from "./pages/water-system/RFID";
import { Weighbridge } from "./pages/water-system/Weighbridge";
import TruckManagement from "./pages/water-system/TruckManagement";
import TruckEntry from "./pages/water-system/TruckEntry";
import { Alarms } from "./pages/water-system/Alarms";
import { Admin } from "./pages/water-system/Admin";
import { PLCConfiguration } from "./pages/water-system/PlcConfiguration";
import { PLCReports } from "./pages/water-system/PLCReports";

function Router() {
  const { isInitialized } = useTheme();
  
  // Show loading state until theme is initialized to prevent flickering
  if (!isInitialized) {
    return (
      <div className="h-screen w-screen bg-slate-950 light:bg-white flex items-center justify-center">
        <div className="text-white light:text-gray-900">Loading...</div>
      </div>
    );
  }
  
  return (
    <Switch>
      {/* Redirect root to Fakieh water system */}
      <Route path="/" component={() => { window.location.href = '/water-system/fakieh-dashboard'; return null; }} />
      
      {/* Water System Routes - Full-screen layouts without AppLayout */}
      <Route path="/water-system" component={WaterDashboard} />
      <Route path="/water-system/dashboard" component={WaterDashboard} />
      <Route path="/water-system/fakieh-dashboard" component={FakiehDashboard} />
      <Route path="/water-system/material" component={Material} />
      <Route path="/water-system/storage" component={Storage} />
      <Route path="/water-system/production" component={Production} />
      <Route path="/water-system/orders" component={Orders} />
      <Route path="/water-system/order-history" component={OrderHistory} />
      <Route path="/water-system/rfid" component={RFID} />
      <Route path="/water-system/weighbridge" component={Weighbridge} />
      <Route path="/water-system/truck-management" component={TruckManagement} />
      <Route path="/water-system/truck-entry" component={TruckEntry} />
      <Route path="/water-system/alarms" component={Alarms} />
      <Route path="/water-system/admin" component={Admin} />
      <Route path="/water-system/engineering" component={PLCConfiguration} />
      <Route path="/water-system/plc-reports" component={PLCReports} />
      
      {/* Legacy Hercules facility routes - kept for existing facility functionality */}
      <Route path="/facility/:id">
       
      </Route>
      
      {/* Catch all - redirect to Fakieh */}
      <Route component={() => { window.location.href = '/water-system/fakieh-dashboard'; return null; }} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SiloProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </SiloProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
