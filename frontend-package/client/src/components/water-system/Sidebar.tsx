import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import herculesLogo from "../../assets/Hercules_New.png"
import {
  sidebarNavEntries,
  isSidebarNavGroup,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './navConfig'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

function NavLinkRow({
  item,
  collapsed,
  indent,
}: {
  item: SidebarNavItem
  collapsed: boolean
  indent?: boolean
}) {
  const [location] = useLocation()
  const Icon = item.icon
  const isActive = location === item.path

  return (
    <Link href={item.path}>
      <div
        className={`flex items-center rounded-lg p-3 transition-all duration-200 group cursor-pointer
          ${indent && !collapsed ? 'pl-6' : ''}
          ${
            isActive
              ? 'border border-cyan-500/30 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 font-bold text-cyan-400'
              : 'font-bold text-white hover:bg-slate-800/50 hover:text-cyan-400'
          }`}
      >
        <Icon className={`h-5 w-5 flex-shrink-0 ${collapsed ? 'mx-auto' : 'mr-3'}`} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{item.label}</div>
            {isActive && (
              <div className="mt-0.5 truncate text-xs font-bold text-white/80">{item.description}</div>
            )}
          </div>
        )}
        {!collapsed && isActive && <div className="h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400" />}
      </div>
    </Link>
  )
}

function CollapsibleNavGroup({ group, collapsed }: { group: SidebarNavGroup; collapsed: boolean }) {
  const [location] = useLocation()
  const groupActive = group.items.some((i) => i.path === location)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (groupActive) setOpen(true)
  }, [groupActive])

  const Icon = group.icon

  if (collapsed) {
    return (
      <div className="space-y-1 border-b border-slate-700/40 py-1">
        {group.items.map((item) => (
          <NavLinkRow key={item.path} item={item} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-sidebar-group-trigger
        data-active={groupActive ? 'true' : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center rounded-lg border border-transparent p-3 text-left font-bold transition-colors
          ${
            groupActive
              ? 'border-cyan-500/30 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 text-cyan-300 shadow-sm'
              : 'text-slate-100 hover:border-slate-600/50 hover:bg-slate-800/50 hover:text-white'
          }`}
        aria-expanded={open}
      >
        <Icon className="mr-3 h-5 w-5 shrink-0 text-current" />
        <span className="flex-1 truncate text-current">{group.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-current opacity-90 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-0.5 border-l border-cyan-500/20 pl-1">
          {group.items.map((item) => (
            <NavLinkRow key={item.path} item={item} collapsed={false} indent />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <div
      className={`app-chrome-dark relative flex h-screen flex-col border-r border-slate-700/50 bg-slate-900/95 shadow-none backdrop-blur-sm 
                     transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}
    >
      <div className="flex min-h-[108px] shrink-0 items-center border-b border-slate-700/50 p-4">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-3">
              <span className="inline-flex rounded-md bg-white p-1 shadow-sm ring-1 ring-slate-600/30">
                <img
                  src={herculesLogo}
                  alt="Hercules"
                  className="h-14 max-w-[220px] rounded object-contain"
                />
              </span>
            </div>
          )}
          {collapsed && (
            <span className="mx-auto inline-flex rounded-md bg-white p-1 shadow-sm ring-1 ring-slate-600/30">
              <img
                src={herculesLogo}
                alt="Hercules"
                className="h-11 max-w-[56px] rounded object-contain"
              />
            </span>
          )}
          <button
            onClick={onToggle}
            data-toggle-button="true"
            className="sidebar-toggle-button rounded-lg p-2 font-bold text-white transition-colors hover:text-cyan-400"
            style={
              {
                backgroundColor: 'transparent !important',
                background: 'transparent !important',
                border: 'none !important',
                boxShadow: 'none !important',
                '--tw-bg-opacity': '0 !important',
              } as React.CSSProperties
            }
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {sidebarNavEntries.map((entry) => {
          if (isSidebarNavGroup(entry)) {
            return <CollapsibleNavGroup key={entry.id} group={entry} collapsed={collapsed} />
          }
          return <NavLinkRow key={entry.path} item={entry} collapsed={collapsed} />
        })}
      </nav>

      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent opacity-30">
        <div className="absolute inset-0 h-8 animate-pulse bg-gradient-to-b from-cyan-400/0 via-cyan-400/80 to-cyan-400/0" />
      </div>
    </div>
  )
}
