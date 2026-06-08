import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Database,
  Truck,
  History,
  Radio,
  Scale,
  Settings,
  ShoppingCart,
  Calendar,
  FileBarChart,
  Table2,
  BarChart3,
  Send,
} from 'lucide-react'

export interface SidebarNavItem {
  path: string
  icon: LucideIcon
  label: string
  description: string
}

export interface SidebarNavGroup {
  id: string
  label: string
  description: string
  icon: LucideIcon
  items: SidebarNavItem[]
}

export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup

export function isSidebarNavGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return 'items' in entry && Array.isArray((entry as SidebarNavGroup).items)
}

const ordersItems: SidebarNavItem[] = [
  {
    path: '/fakieh/live_orders',
    icon: Truck,
    label: 'Live orders',
    description: 'Real-time Orders from SCADA',
  },
  {
    path: '/fakieh/order-history',
    icon: History,
    label: 'Order History',
    description: 'Complete Order History from Database',
  },
]

const trucksItems: SidebarNavItem[] = [
  {
    path: '/fakieh/truck-management',
    icon: Truck,
    label: 'Truck Management',
    description: 'Manage Trucks & Fleet',
  },
  {
    path: '/fakieh/truck-entry',
    icon: Scale,
    label: 'Truck Weighbridge',
    description: 'Live Weighbridge & Entry Management',
  },
]

const fakiehReportingItems: SidebarNavItem[] = [
  {
    path: '/fakieh/fakieh-dashboard',
    icon: LayoutDashboard,
    label: 'Fakieh Dashboard',
    description: 'Main production dashboard',
  },
  {
    path: '/fakieh/batch-calendar',
    icon: Calendar,
    label: 'Batch calendar',
    description: 'Daily production from batch materials',
  },
  {
    path: '/fakieh/batch-raw-data',
    icon: Table2,
    label: 'Raw data',
    description: 'Filtered batch material rows and CSV export',
  },
  {
    path: '/fakieh/batch-historical-reports',
    icon: FileBarChart,
    label: 'Historical reports',
    description: 'Summaries, weekly, monthly, daily, material usage',
  },
]

/** Sidebar + Admin */
export const sidebarNavEntries: SidebarNavEntry[] = [
  {
    id: 'fakieh-reporting',
    label: 'Fakieh Reporting',
    description: 'Dashboard and batch reporting',
    icon: BarChart3,
    items: fakiehReportingItems,
  },
  {
    path: '/fakieh/storage',
    icon: Database,
    label: 'Storage',
    description: 'Storage Management',
  },
  {
    id: 'orders',
    label: 'Orders',
    description: 'Live orders and order history',
    icon: ShoppingCart,
    items: ordersItems,
  },
  {
    path: '/fakieh/rfid',
    icon: Radio,
    label: 'RFID',
    description: 'RFID Tracking System',
  },
  {
    path: '/fakieh/weighbridge',
    icon: Scale,
    label: 'Weighbridge Log',
    description: 'Weighbridge Management',
  },
  {
    id: 'trucks',
    label: 'Trucks',
    description: 'Fleet and weighbridge entry',
    icon: Truck,
    items: trucksItems,
  },
  {
    path: '/fakieh/distribution',
    icon: Send,
    label: 'Distribution',
    description: 'Scheduled report email & disk delivery',
  },
  {
    path: '/fakieh/admin',
    icon: Settings,
    label: 'Admin',
    description: 'System Administration & Configuration',
  },
]

export type TopNavLinkItem = {
  kind: 'link'
  path: string
  label: string
  icon: LucideIcon
}

export type TopNavGroupItem = {
  kind: 'group'
  label: string
  icon: LucideIcon
  items: { path: string; label: string }[]
}

export type TopNavItem = TopNavLinkItem | TopNavGroupItem

/** Top bar: Admin omitted (gear in chrome). */
export const topNavItems: TopNavItem[] = [
  {
    kind: 'group',
    label: 'Fakieh Reporting',
    icon: BarChart3,
    items: [
      { path: '/fakieh/fakieh-dashboard', label: 'Fakieh Dashboard' },
      { path: '/fakieh/batch-calendar', label: 'Batch calendar' },
      { path: '/fakieh/batch-raw-data', label: 'Raw data' },
      { path: '/fakieh/batch-historical-reports', label: 'Historical reports' },
    ],
  },
  {
    kind: 'link',
    path: '/fakieh/storage',
    label: 'Storage',
    icon: Database,
  },
  {
    kind: 'group',
    label: 'Orders',
    icon: ShoppingCart,
    items: [
      { path: '/fakieh/live_orders', label: 'Live orders' },
      { path: '/fakieh/order-history', label: 'Order history' },
    ],
  },
  {
    kind: 'link',
    path: '/fakieh/rfid',
    label: 'RFID',
    icon: Radio,
  },
  {
    kind: 'link',
    path: '/fakieh/weighbridge',
    label: 'Weighbridge Log',
    icon: Scale,
  },
  {
    kind: 'group',
    label: 'Trucks',
    icon: Truck,
    items: [
      { path: '/fakieh/truck-management', label: 'Truck management' },
      { path: '/fakieh/truck-entry', label: 'Truck weighbridge' },
    ],
  },
  {
    kind: 'link',
    path: '/fakieh/distribution',
    label: 'Distribution',
    icon: Send,
  },
]
