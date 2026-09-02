import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { WaterTopNav } from './WaterTopNav'
import { PartnerLogosStrip } from './PartnerLogosStrip'
import { User, Settings, Bell, Sun, Moon } from 'lucide-react'
import { Link } from 'wouter'
import { useTheme } from '@/contexts/ThemeContext'
import { useNavLayout } from '@/contexts/NavLayoutContext'
import { cn } from '@/lib/utils'

interface WaterSystemLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
  /** When false, page renders its own title inside content. */
  showPageTitle?: boolean
  /**
   * Opt-in, page-scoped only (Plant3D.tsx is the one caller today — a check
   * in scripts/verify-plant3d.mjs greps for that). When true: the sidebar
   * starts collapsed to its 68px rail, the header becomes a 44px strip with
   * the subtitle and partner logos dropped, and `main` loses its padding so
   * the page's own content owns the full frame. Every other page is
   * unaffected — this prop defaults to false and every branch below is
   * gated on it.
   */
  immersive?: boolean
  /** Immersive header only: rendered centred in the 44px strip. */
  headerCenter?: React.ReactNode
  /** Immersive header only: rendered before the theme/bell/settings/avatar cluster. */
  headerRight?: React.ReactNode
}

export function WaterSystemLayout({
  children,
  title,
  subtitle,
  showPageTitle = true,
  immersive = false,
  headerCenter,
  headerRight,
}: WaterSystemLayoutProps) {
  /*
   * Starts collapsed on an immersive route and re-collapses every time the
   * route mounts, because wouter renders a fresh WaterSystemLayout instance
   * per page — this initializer runs again on every navigation into the
   * route, not just the first. The toggle still works from there: a user can
   * expand it by hand, same as any other page.
   */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(immersive)
  const { theme, toggleTheme } = useTheme()
  const { navLayout } = useNavLayout()
  const isTopbar = navLayout === 'topbar'
  const isDarkMode = theme === 'dark'

  return (
    <div
      className={cn(
        'relative flex h-screen overflow-hidden',
        isTopbar
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white light:bg-white light:text-gray-900'
          : 'bg-gray-100 text-gray-900 dark:bg-slate-950 dark:text-white'
      )}
    >
      {/* Matrix Rain Background — topbar mode only */}
      {isTopbar && (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-5 light:opacity-0">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 via-slate-950/50 to-slate-950/80" />
        </div>
      )}

      {!isTopbar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            isTopbar ? 'px-3 pt-3 sm:px-5 sm:pt-4' : 'min-h-0'
          )}
        >
          {isTopbar ? (
            <WaterTopNav />
          ) : (
            <header
              className={cn(
                'water-page-header app-chrome-dark relative flex shrink-0 items-center border-b',
                'border-slate-800 bg-[#0f172a] text-slate-100',
                immersive
                  ? 'h-11 min-h-11 gap-3 px-3'
                  : 'min-h-[120px] gap-4 px-5 py-3 sm:px-6'
              )}
            >
              {showPageTitle && (
                <div className="relative z-10 min-w-0 shrink-0">
                  <h1
                    className={cn(
                      'truncate font-bold text-white',
                      immersive ? 'text-[15px] font-semibold leading-none' : 'text-2xl'
                    )}
                  >
                    {title}
                  </h1>
                  {!immersive && <p className="truncate text-base text-slate-400">{subtitle}</p>}
                </div>
              )}

              {/* Immersive only: the zone control / breadcrumb the page hands us,
                  centred in the 44px strip. Absent in the default header — every
                  other page keeps its title-and-partner-logos layout untouched. */}
              {immersive && headerCenter && (
                <div className="relative z-10 flex min-w-0 flex-1 items-center justify-center overflow-hidden">
                  {headerCenter}
                </div>
              )}

              <div
                className={cn(
                  'relative z-10 ml-auto flex min-w-0 items-center',
                  immersive ? 'gap-2' : 'gap-3 sm:gap-4'
                )}
              >
                {immersive && headerRight}
                {!immersive && <PartnerLogosStrip variant="sidebar" />}

                <button
                  type="button"
                  onClick={toggleTheme}
                  className={cn(
                    'rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white',
                    immersive ? 'flex h-8 w-8 shrink-0 items-center justify-center' : 'hidden p-2.5 sm:block'
                  )}
                  aria-label="Toggle theme"
                >
                  {isDarkMode ? (
                    <Sun className={immersive ? 'h-4 w-4' : 'h-5 w-5'} />
                  ) : (
                    <Moon className={immersive ? 'h-4 w-4' : 'h-5 w-5'} />
                  )}
                </button>

                <button
                  type="button"
                  className={cn(
                    'rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white',
                    immersive ? 'flex h-8 w-8 shrink-0 items-center justify-center' : 'p-2.5'
                  )}
                  aria-label="Notifications"
                >
                  <Bell className={immersive ? 'h-4 w-4' : 'h-5 w-5'} />
                </button>

                <Link href="/fakieh/admin">
                  <button
                    type="button"
                    className={cn(
                      'rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white',
                      immersive ? 'flex h-8 w-8 shrink-0 items-center justify-center' : 'p-2.5'
                    )}
                    aria-label="Settings"
                  >
                    <Settings className={immersive ? 'h-4 w-4' : 'h-5 w-5'} />
                  </button>
                </Link>

                <div
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700',
                    immersive ? 'h-8 w-8' : 'h-11 w-11'
                  )}
                  title="Production Manager"
                  aria-label="Production Manager profile"
                >
                  <User className={cn('text-white', immersive ? 'h-4 w-4' : 'h-5 w-5')} />
                </div>
              </div>
            </header>
          )}

          <main
            className={cn(
              'relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto smooth-scroll',
              isTopbar
                ? cn(
                    'dark:border-slate-600/70 light:border-gray-200 light:bg-gray-50',
                    immersive ? 'border-0 p-0' : 'rounded-b-2xl border border-t-0 p-6'
                  )
                : cn('bg-gray-100 dark:bg-slate-950', immersive ? 'p-0' : 'p-6')
            )}
          >
            {isTopbar && (
              <>
                <div className="pointer-events-none absolute inset-0 opacity-5 light:opacity-0">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage: `linear-gradient(rgba(0,188,212,0.1) 1px, transparent 1px),
                                        linear-gradient(90deg, rgba(0,188,212,0.1) 1px, transparent 1px)`,
                      backgroundSize: '50px 50px',
                    }}
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 overflow-hidden light:hidden">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute h-1 w-1 animate-float rounded-full bg-cyan-400/30"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 10}s`,
                        animationDuration: `${15 + Math.random() * 10}s`,
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="relative z-10 max-w-full page-transition page-transition-enter-active">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
