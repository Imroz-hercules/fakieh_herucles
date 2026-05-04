import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";
import { chartColors, chartDefaults } from "@/lib/chartUtils";
import { mockAlerts } from "@/lib/mockData";

Chart.register(...registerables);

function EnergyDonutChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Pumps', 'RO', 'Lighting', 'Control'],
        datasets: [{
          data: [45, 35, 12, 8],
          backgroundColor: [
            chartColors.cyberBlue,
            chartColors.neonGreen,
            chartColors.neonAmber,
            chartColors.cyberPurple,
          ],
          borderColor: 'hsl(240, 25%, 6%)',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaults,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              font: { size: 9 },
              usePointStyle: true,
              color: '#ffffff',
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="holographic rounded-lg p-4 relative">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        ENERGY BREAKDOWN
      </div>
      <div className="h-24">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function QualityTrendsChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          data: [94, 95, 93, 96, 94, 97, 95],
          borderColor: chartColors.neonGreen,
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: chartColors.neonGreen,
        }],
      },
      options: chartDefaults,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="holographic rounded-lg p-4 relative">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        QUALITY TRENDS
      </div>
      <div className="h-24">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function MaintenanceWidget() {
  const maintenanceItems = [
    { name: "RO Membrane", status: "Due 3d", color: "hsl(45, 100%, 50%)" },
    { name: "Pump Service", status: "OK", color: "hsl(158, 100%, 50%)" },
    { name: "Filter Change", status: "Overdue", color: "hsl(0, 84%, 60%)" },
    { name: "Calibration", status: "OK", color: "hsl(158, 100%, 50%)" },
  ];

  return (
    <div className="holographic rounded-lg p-4 relative">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        MAINTENANCE
      </div>
      <div className="space-y-2">
        {maintenanceItems.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="text-xs font-mono">{item.name}</div>
            <div className="text-xs font-mono" style={{ color: item.color }}>
              {item.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsWidget() {
  return (
    <div className="holographic rounded-lg p-4 relative">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        ACTIVE ALERTS
      </div>
      <div className="space-y-2">
        {mockAlerts.slice(0, 3).map((alert) => {
          const alertColors = {
            critical: "hsl(0, 84%, 60%)",
            medium: "hsl(45, 100%, 50%)",
            low: "hsl(158, 100%, 50%)",
          };

          return (
            <div key={alert.id} className="flex items-center space-x-2">
              <div
                className="w-2 h-2 rounded-full animate-glow-pulse"
                style={{ backgroundColor: alertColors[alert.severity as keyof typeof alertColors] }}
              />
              <div className="text-xs font-mono">{alert.message}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsPanel() {
  return (
    <div className="col-span-9 row-span-2 grid grid-cols-4 gap-4">
      <EnergyDonutChart />
      <QualityTrendsChart />
      <MaintenanceWidget />
      <AlertsWidget />
    </div>
  );
}
