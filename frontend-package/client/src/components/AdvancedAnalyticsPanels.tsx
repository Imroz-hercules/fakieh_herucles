import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";
import { chartColors } from "@/lib/chartUtils";
import { mockAlerts } from "@/lib/mockData";

Chart.register(...registerables);

function EnergyDistribution3D() {
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
        labels: ['Pumps', 'RO Systems', 'Lighting', 'Controls', 'HVAC'],
        datasets: [{
          data: [35, 28, 15, 12, 10],
          backgroundColor: [
            chartColors.cyberBlue,
            chartColors.neonGreen,
            chartColors.neonAmber,
            chartColors.cyberPurple,
            chartColors.neonOrange,
          ],
          borderColor: 'rgba(0, 20, 40, 0.8)',
          borderWidth: 3,
          hoverBorderWidth: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              font: { size: 9, family: 'monospace' },
              color: '#ffffff',
              usePointStyle: true,
              padding: 10,
            },
          },
        },
        cutout: '60%',
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="cyberpunk-card rounded-lg p-4 relative h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        ENERGY DISTRIBUTION
      </div>
      <div className="h-32">
        <canvas ref={canvasRef} />
      </div>
      <div className="text-center mt-2">
        <div className="text-lg text-[hsl(45,100%,50%)] text-glow font-mono">
          847 kW
        </div>
        <div className="text-xs text-gray-400 font-mono">TOTAL CONSUMPTION</div>
      </div>
    </div>
  );
}

function WaterQualityHeatmap() {
  const metrics = [
    { name: "pH", value: 7.2, optimal: [6.5, 8.5], status: "optimal" },
    { name: "TDS", value: 156, optimal: [50, 300], status: "optimal" },
    { name: "Turbidity", value: 0.3, optimal: [0, 1], status: "optimal" },
    { name: "Chlorine", value: 0.8, optimal: [0.2, 2.0], status: "optimal" },
    { name: "Hardness", value: 120, optimal: [60, 180], status: "warning" },
    { name: "Iron", value: 0.05, optimal: [0, 0.3], status: "optimal" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal": return "hsl(158, 100%, 50%)";
      case "warning": return "hsl(45, 100%, 50%)";
      case "critical": return "hsl(0, 100%, 60%)";
      default: return "hsl(180, 100%, 50%)";
    }
  };

  return (
    <div className="cyberpunk-card rounded-lg p-4 relative h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        WATER QUALITY MATRIX
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((metric, index) => (
          <div key={metric.name} className="relative">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-mono text-gray-300">{metric.name}</span>
              <span 
                className="text-xs font-mono font-bold"
                style={{ color: getStatusColor(metric.status) }}
              >
                {metric.value}
              </span>
            </div>
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full animate-glow-pulse transition-all duration-1000"
                style={{ 
                  width: `${Math.min((metric.value / metric.optimal[1]) * 100, 100)}%`,
                  backgroundColor: getStatusColor(metric.status),
                  boxShadow: `0 0 6px ${getStatusColor(metric.status)}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationalTimeline() {
  const events = [
    { time: "14:23", event: "System Auto-Clean", status: "completed", color: "hsl(158, 100%, 50%)" },
    { time: "13:45", event: "Pump Maintenance", status: "in-progress", color: "hsl(45, 100%, 50%)" },
    { time: "12:30", event: "Quality Check", status: "completed", color: "hsl(158, 100%, 50%)" },
    { time: "11:15", event: "Filter Replacement", status: "scheduled", color: "hsl(180, 100%, 50%)" },
    { time: "10:00", event: "Daily Startup", status: "completed", color: "hsl(158, 100%, 50%)" },
  ];

  return (
    <div className="cyberpunk-card rounded-lg p-4 relative h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        OPERATIONS TIMELINE
      </div>
      <div className="space-y-3 max-h-32 overflow-y-auto">
        {events.map((event, index) => (
          <div key={index} className="flex items-center space-x-3">
            <div className="text-xs font-mono text-gray-400 w-12">{event.time}</div>
            <div 
              className="w-2 h-2 rounded-full animate-glow-pulse"
              style={{ backgroundColor: event.color }}
            />
            <div className="flex-1">
              <div className="text-xs font-mono text-white">{event.event}</div>
              <div 
                className="text-xs font-mono capitalize"
                style={{ color: event.color }}
              >
                {event.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealthRadar() {
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
      type: 'radar',
      data: {
        labels: ['Performance', 'Efficiency', 'Reliability', 'Safety', 'Maintenance'],
        datasets: [{
          label: 'Current',
          data: [85, 92, 88, 95, 78],
          borderColor: chartColors.cyberBlue,
          backgroundColor: `${chartColors.cyberBlue}30`,
          pointBackgroundColor: chartColors.cyberBlue,
          pointBorderColor: '#ffffff',
          pointRadius: 4,
        }, {
          label: 'Target',
          data: [90, 95, 92, 98, 85],
          borderColor: chartColors.neonGreen,
          backgroundColor: `${chartColors.neonGreen}20`,
          pointBackgroundColor: chartColors.neonGreen,
          pointBorderColor: '#ffffff',
          pointRadius: 3,
          borderDash: [5, 5],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              font: { size: 8, family: 'monospace' },
              color: '#ffffff',
              usePointStyle: true,
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              display: false,
            },
            grid: {
              color: 'rgba(0, 255, 255, 0.2)',
            },
            angleLines: {
              color: 'rgba(0, 255, 255, 0.3)',
            },
            pointLabels: {
              font: { size: 9, family: 'monospace' },
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
    <div className="cyberpunk-card rounded-lg p-4 relative h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        SYSTEM HEALTH
      </div>
      <div className="h-32">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function CriticalAlertsPanel() {
  const alertTypeColors = {
    critical: "hsl(0, 84%, 60%)",
    medium: "hsl(45, 100%, 50%)",
    low: "hsl(158, 100%, 50%)",
  };

  return (
    <div className="cyberpunk-card rounded-lg p-4 relative h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-3 text-glow font-mono">
        ACTIVE ALERTS
      </div>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {mockAlerts.slice(0, 4).map((alert) => (
          <div key={alert.id} className="flex items-start space-x-2 p-2 rounded bg-black bg-opacity-30">
            <div
              className="w-2 h-2 rounded-full mt-1 animate-glow-pulse"
              style={{ backgroundColor: alertTypeColors[alert.severity as keyof typeof alertTypeColors] }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-white truncate">{alert.message}</div>
              <div className="text-xs font-mono text-gray-400">
                {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Unknown time'}
              </div>
            </div>
            <div 
              className="text-xs font-mono font-bold px-1 rounded"
              style={{ 
                color: alertTypeColors[alert.severity as keyof typeof alertTypeColors],
                backgroundColor: `${alertTypeColors[alert.severity as keyof typeof alertTypeColors]}20`
              }}
            >
              {alert.severity.toUpperCase()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdvancedAnalyticsPanels() {
  return (
    <div className="col-span-12 row-span-2 grid grid-cols-5 gap-4 p-2">
      <EnergyDistribution3D />
      <WaterQualityHeatmap />
      <OperationalTimeline />
      <SystemHealthRadar />
      <CriticalAlertsPanel />
    </div>
  );
}