import { useEffect, useRef } from "react";
import { aggregateMetrics } from "@/lib/mockData";

interface Advanced3DGaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

function Advanced3DGauge({ value, max, label, unit, color, size = 'md' }: Advanced3DGaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const sizes = {
    sm: { width: 80, height: 80, radius: 30 },
    md: { width: 120, height: 120, radius: 45 },
    lg: { width: 160, height: 160, radius: 60 }
  };
  
  const { width, height, radius } = sizes[size];
  const progress = Math.min(value, max) / max;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Create gradient for 3D effect
    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.3, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
    gradient.addColorStop(0.7, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    
    // Draw outer ring (background)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Draw inner shadow ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 4, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw progress arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw center circle with 3D effect
    const centerGradient = ctx.createRadialGradient(centerX - 5, centerY - 5, 0, centerX, centerY, radius * 0.3);
    centerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    centerGradient.addColorStop(1, 'rgba(0, 20, 40, 0.9)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
    ctx.fillStyle = centerGradient;
    ctx.fill();
    
    // Draw border around center
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
  }, [value, max, color, width, height, radius, progress]);
  
  return (
    <div className="metric-gauge cyberpunk-card rounded-xl p-3 relative">
      <div className="relative flex flex-col items-center">
        <canvas 
          ref={canvasRef} 
          width={width} 
          height={height}
          className="animate-cyber-breathe"
        />
        
        {/* Center text overlay - positioned above canvas */}
        <div 
          className="absolute flex flex-col items-center justify-center pointer-events-none"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 30
          }}
        >
          <div 
            className="text-xl font-bold text-center font-mono"
            style={{ 
              color: '#ffffff',
              textShadow: `0 0 15px ${color}, 0 0 30px ${color}, 0 0 5px rgba(0,0,0,1), 2px 2px 4px rgba(0,0,0,0.8)`,
              filter: `drop-shadow(0 0 8px ${color})`,
              WebkitTextStroke: `1px ${color}40`
            }}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div 
            className="text-xs font-mono text-center mt-1"
            style={{ 
              color: '#cccccc',
              textShadow: '0 0 8px rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,1)',
              filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.5))'
            }}
          >
            {unit}
          </div>
        </div>
        
        {/* Label */}
        <div className="text-xs text-center mt-1 text-[hsl(180,100%,50%)] hologram-text font-mono tracking-wider">
          {label}
        </div>
        
        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-[hsl(180,100%,50%)] rounded-full opacity-60 animate-float"
              style={{
                left: `${20 + i * 30}%`,
                top: `${30 + (i % 2) * 40}%`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Advanced3DGauges() {
  return (
    <div className="cyberpunk-card rounded-lg p-3 h-full">
      <div className="text-sm text-[hsl(180,100%,50%)] mb-2 text-glow font-mono">
        PERFORMANCE GAUGES
      </div>
      <div className="grid grid-cols-1 gap-2 h-full">
        <Advanced3DGauge
          value={aggregateMetrics.totalProduction / 1000}
          max={25}
          label="TOTAL OUTPUT"
          unit="K m³/day"
          color="hsl(180, 100%, 50%)"
          size="sm"
        />
        
        <Advanced3DGauge
          value={2.4}
          max={5}
          label="ENERGY EFFICIENCY"
          unit="kWh/m³"
          color="hsl(158, 100%, 50%)"
          size="sm"
        />
        
        <Advanced3DGauge
          value={aggregateMetrics.averageEfficiency}
          max={100}
          label="SYSTEM QUALITY"
          unit="Score"
          color="hsl(45, 100%, 50%)"
          size="sm"
        />
      </div>
    </div>
  );
}