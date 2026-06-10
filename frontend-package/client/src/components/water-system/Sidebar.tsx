import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { ChevronDown, Menu, Settings } from 'lucide-react'
import herculesLogo from '../../assets/Hercules_New_white.png'
import {
  sidebarNavEntries,
  isSidebarNavGroup,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './navConfig'
import { cn } from '@/lib/utils'

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
    <Link href={item.path} className="block w-full">
      <div
        className={cn(
          'sidebar-nav-item group flex w-full cursor-pointer items-center rounded-xl px-3.5 py-3.5 text-base font-medium leading-snug transition-colors',
          indent && !collapsed && 'pl-10',
          isActive && 'sidebar-nav-item--active'
        )}
      >
        <Icon className={cn('h-5 w-5 shrink-0', collapsed ? 'mx-auto' : 'mr-3')} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </div>
    </Link>
  )
}

function CollapsibleNavGroup({ group, collapsed }: { group: SidebarNavGroup; collapsed: boolean }) {
  const [location] = useLocation()
  const groupActive = group.items.some((i) => i.path === location)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (groupActive) setOpen(true)
  }, [groupActive])

  const Icon = group.icon

  if (collapsed) {
    return (
      <div className="flex flex-col gap-2 border-b border-slate-800 py-3">
        {group.items.map((item) => (
          <NavLinkRow key={item.path} item={item} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      <button
        type="button"
        data-sidebar-group-trigger
        data-active={groupActive ? 'true' : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'sidebar-nav-group-trigger flex w-full items-center rounded-xl px-3.5 py-3.5 text-left text-base font-medium leading-snug transition-colors',
          groupActive && 'sidebar-nav-item--active'
        )}
        aria-expanded={open}
      >
        <Icon className="mr-3 h-5 w-5 shrink-0" />
        <span className="flex-1 truncate">{group.label}</span>
        <ChevronDown
          className={cn('h-5 w-5 shrink-0 opacity-70 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {group.items.map((item) => (
            <NavLinkRow key={item.path} item={item} collapsed={false} indent />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation()
  const settingsActive = location === '/fakieh/admin'

  return (
    <div
      className={cn(
        'sidebar-shell app-chrome-dark relative flex h-screen shrink-0 flex-col border-r border-slate-800 bg-[#0f172a] transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Menu + logo */}
      <div
        className={cn(
          'flex min-h-[120px] shrink-0 items-center border-b border-slate-800 py-3',
          collapsed ? 'flex-col justify-center gap-2 px-1.5' : 'gap-2.5 px-3'
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="sidebar-menu-toggle shrink-0 rounded-lg border border-slate-700/60 bg-slate-800/70 p-2.5 text-white transition-colors hover:bg-slate-700/80"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/fakieh/fakieh-dashboard"
          className={cn('flex min-w-0 items-center', collapsed ? 'justify-center' : 'flex-1')}
        >
          <img
            src={herculesLogo}
            alt="Hercules"
            className={cn(
              'shrink-0 object-contain object-left',
              collapsed ? 'h-10 w-10 object-center' : 'h-16 w-auto md:h-20'
            )}
          />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
        {sidebarNavEntries.map((entry) => (
          <div key={isSidebarNavGroup(entry) ? entry.id : entry.path} className="w-full shrink-0">
            {isSidebarNavGroup(entry) ? (
              <CollapsibleNavGroup group={entry} collapsed={collapsed} />
            ) : (
              <NavLinkRow item={entry} collapsed={collapsed} />
            )}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 border-t border-slate-800 px-3 py-5">
        <Link href="/fakieh/admin" className="block w-full">
          <div
            className={cn(
              'sidebar-nav-item flex w-full cursor-pointer items-center rounded-xl px-3.5 py-3.5 text-base font-medium leading-snug transition-colors',
              settingsActive && 'sidebar-nav-item--active'
            )}
          >
            <Settings className={cn('h-5 w-5 shrink-0', collapsed ? 'mx-auto' : 'mr-3')} />
            {!collapsed && <span>Settings</span>}
          </div>
        </Link>
      </div>
    </div>
  )
}
