import { useEffect, useRef } from "react";
import { TrendingUp, Droplets, Zap, Activity } from "lucide-react";

// Futuristic 3D Gauge component
function Futuristic3DGauge({ 
  value, 
  max, 
  color, 
  label, 
  size = 120 
}: { 
  value: number; 
  max: number; 
  color: string; 
  label: string; 
  size?: number; 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;
    const percentage = (value / max) * 100;

    ctx.clearRect(0, 0, size, size);

    // Create gradient for 3D effect
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(0.7, color + '20');
    gradient.addColorStop(1, color + '10');

    // Draw outer ring with 3D effect
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Draw inner background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw progress arc with consistent appearance
    const startAngle = -Math.PI * 0.75;
    const endAngle = startAngle + (percentage / 100) * Math.PI * 1.5;

    // Standard glow effect (no hover changes)
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Additional inner glow
    ctx.shadowBlur = 25;
    ctx.lineWidth = 8;
    ctx.stroke();

    // Reset shadow for other elements
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw center circle with 3D effect
    const centerGradient = ctx.createRadialGradient(
      centerX - 5, centerY - 5, 0,
      centerX, centerY, 15
    );
    centerGradient.addColorStop(0, color + '80');
    centerGradient.addColorStop(1, color + '20');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
    ctx.fillStyle = centerGradient;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw tick marks
    for (let i = 0; i <= 10; i++) {
      const angle = startAngle + (i / 10) * Math.PI * 1.5;
      const x1 = centerX + Math.cos(angle) * (radius - 15);
      const y1 = centerY + Math.sin(angle) * (radius - 15);
      const x2 = centerX + Math.cos(angle) * (radius - 5);
      const y2 = centerY + Math.sin(angle) * (radius - 5);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 2 === 0 ? color + '80' : color + '40';
      ctx.lineWidth = i % 2 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // Draw needle
    const needleAngle = startAngle + (percentage / 100) * Math.PI * 1.5;
    const needleLength = radius - 10;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(needleAngle) * needleLength,
      centerY + Math.sin(needleAngle) * needleLength
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Add needle glow
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.stroke();

  }, [value, max, color, size]);

  return (
    <div className="relative flex items-center justify-center">
      <div className="rounded-full transition-transform duration-300 hover:scale-125">
        <canvas ref={canvasRef} width={size} height={size} />
      </div>
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs text-slate-400 font-mono">
        {label}
      </div>
    </div>
  );
}



export function CenterMetricsPanel() {
  return (
    <div className="grid grid-cols-4 gap-6 mb-6">
      {/* Flow Rate 3D Gauge */}
      <div className="bg-gradient-to-br from-slate-900/90 via-blue-900/20 to-slate-800/80 rounded-xl p-6 border border-blue-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-600/5"></div>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400/80 to-transparent animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 text-sm font-semibold">Flow Rate</span>
            </div>
            <div className="text-blue-400 text-xs font-mono bg-blue-500/20 px-2 py-1 rounded">+2.3%</div>
          </div>
          
          <Futuristic3DGauge 
            value={2400} 
            max={3000} 
            color="#3b82f6" 
            label="L/s" 
            size={160} 
          />
          
          <div className="mt-2">
            <div className="text-white text-lg font-bold font-mono">2.4k</div>
            <div className="text-blue-400 text-xs font-medium">OPTIMAL FLOW</div>
          </div>
        </div>
      </div>

      {/* Pressure 3D Gauge */}
      <div className="bg-gradient-to-br from-slate-900/90 via-amber-900/20 to-slate-800/80 rounded-xl p-6 border border-amber-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-600/5"></div>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-sm font-semibold">Pressure</span>
            </div>
            <div className="text-amber-400 text-xs font-mono bg-amber-500/20 px-2 py-1 rounded">-0.8%</div>
          </div>
          
          <Futuristic3DGauge 
            value={85.2} 
            max={120} 
            color="#f59e0b" 
            label="PSI" 
            size={160} 
          />
          
          <div className="mt-2">
            <div className="text-white text-lg font-bold font-mono">85.2</div>
            <div className="text-amber-400 text-xs font-medium">STABLE</div>
          </div>
        </div>
      </div>

      {/* Energy 3D Gauge */}
      <div className="bg-gradient-to-br from-slate-900/90 via-emerald-900/20 to-slate-800/80 rounded-xl p-6 border border-emerald-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-emerald-600/5"></div>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-semibold">Energy</span>
            </div>
            <div className="text-emerald-400 text-xs font-mono bg-emerald-500/20 px-2 py-1 rounded">+1.2%</div>
          </div>
          
          <Futuristic3DGauge 
            value={847} 
            max={1200} 
            color="#10b981" 
            label="kW" 
            size={160} 
          />
          
          <div className="mt-2">
            <div className="text-white text-lg font-bold font-mono">847</div>
            <div className="text-emerald-400 text-xs font-medium">EFFICIENT</div>
          </div>
        </div>
      </div>

      {/* Quality 3D Gauge */}
      <div className="bg-gradient-to-br from-slate-900/90 via-purple-900/20 to-slate-800/80 rounded-xl p-6 border border-purple-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-purple-600/5"></div>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-purple-400/80 to-transparent animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span className="text-purple-400 text-sm font-semibold">Quality</span>
            </div>
            <div className="text-purple-400 text-xs font-mono bg-purple-500/20 px-2 py-1 rounded">+0.5%</div>
          </div>
          
          <Futuristic3DGauge 
            value={94.7} 
            max={100} 
            color="#a855f7" 
            label="Score" 
            size={160} 
          />
          
          <div className="mt-2">
            <div className="text-white text-lg font-bold font-mono">94.7</div>
            <div className="text-purple-400 text-xs font-medium">EXCELLENT</div>
          </div>
        </div>
      </div>
    </div>
  );
}