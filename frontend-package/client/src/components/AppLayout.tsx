import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Menu, 
  X, 
  Home, 
  BarChart3, 
  Settings, 
  Droplets, 
  Activity, 
  Zap, 
  Wrench, 
  Beaker,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import herculesLogo from "../assets/Hercules_New.png";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  isCollapsed: boolean;
  isActive: boolean;
}

function SidebarItem({ icon, label, href, isCollapsed, isActive }: SidebarItemProps) {
  return (
    <Link href={href}>
      <button
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
          isActive 
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10' 
            : 'text-slate-300 hover:bg-slate-700/50 hover:text-cyan-300'
        }`}
      >
        <div className={`flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-300'}`}>
          {icon}
        </div>
        {!isCollapsed && (
          <span className="font-medium text-sm tracking-wide transition-opacity duration-200">
            {label}
          </span>
        )}
        {isCollapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap border border-slate-600">
            {label}
          </div>
        )}
        {isActive && (
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent rounded-lg pointer-events-none" />
        )}
      </button>
    </Link>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [location] = useLocation();

  const navigationItems = [
    { icon: <Droplets size={18} />, label: 'Fakieh', href: '/fakieh/fakieh-dashboard' },
  ];

  return (
    <div className="h-screen overflow-hidden relative bg-slate-950">
      {/* Enhanced Background with Matrix Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 cyber-grid opacity-20" />
        
        {/* Matrix Rain Effect */}
        <div className="absolute inset-0">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute w-px bg-gradient-to-b from-transparent via-[hsl(120,100%,70%)] to-transparent opacity-20"
              style={{
                left: `${i * 7}%`,
                height: '100px',
                animation: `matrix-rain ${3 + Math.random() * 4}s linear infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-[hsl(180,100%,50%)] rounded-full opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `data-flow ${4 + Math.random() * 6}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex h-full relative z-10">
        {/* Collapsible Sidebar */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'w-16' : 'w-64'
          } bg-slate-900/95 backdrop-blur-md border-r border-slate-700/50 relative`}
        >
          {/* Sidebar Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700/50">
            <div className={`flex items-center gap-3 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <span className="inline-flex rounded-md bg-white p-1.5 shadow-sm ring-1 ring-slate-600/30">
                <img
                  src={herculesLogo}
                  alt="Hercules"
                  className="h-7 w-auto max-w-[140px] rounded object-contain"
                />
              </span>
              <div className="text-cyan-400 font-bold text-sm tracking-wider">HERCULES</div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-slate-400 hover:text-cyan-400 p-1"
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>
          </div>

          {/* Navigation Items */}
          <div className="p-3 space-y-1">
            {navigationItems.map((item, index) => (
              <SidebarItem
                key={index}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isCollapsed={sidebarCollapsed}
                isActive={location === item.href}
              />
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="absolute bottom-4 left-0 right-0 px-3">
            <div className={`transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-xs font-medium">NEURAL LINK ACTIVE</span>
                </div>
                <div className="text-slate-400 text-xs">
                  Monitoring 10 facilities
                </div>
              </div>
            </div>
          </div>

          {/* Scanning Line Effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[hsl(180,100%,50%)] to-transparent animate-data-flow opacity-30" />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>
      </div>

      {/* Ambient Glow Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-64 h-64 bg-[hsl(180,100%,50%)] rounded-full opacity-5 blur-3xl animate-float" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-[hsl(270,100%,50%)] rounded-full opacity-5 blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-[hsl(158,100%,50%)] rounded-full opacity-5 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>
    </div>
  );
}