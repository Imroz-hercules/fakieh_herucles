import React from 'react'
import AsmLogo from '@/assets/Asm_Logo.png'
import FakiehLogo from '@/assets/fakiehlogo.webp'
import { cn } from '@/lib/utils'

type PartnerLogosVariant = 'topnav' | 'sidebar'

interface PartnerLogosStripProps {
  /** `topnav`: full-width bar chips (hidden below `sm`). `sidebar`: same sizes, always visible in page header. */
  variant?: PartnerLogosVariant
}

export function PartnerLogosStrip({ variant = 'topnav' }: PartnerLogosStripProps) {
  const isSidebar = variant === 'sidebar'

  return (
    <div
      className={cn(
        'shrink-0 items-center gap-2.5 border-r pr-3 md:gap-3 md:pr-4',
        isSidebar
          ? 'flex border-slate-700/70'
          : 'hidden border-slate-600/70 xl:flex'
      )}
      aria-label="Fakieh and ASM"
    >
      {/* Fakieh — left */}
      <div
        className={cn(
          'flex items-center justify-center rounded-md px-2 sm:px-2.5',
          isSidebar ? 'bg-white ring-1 ring-gray-200' : 'bg-white/5 ring-1 ring-white/10 sm:px-3',
          isSidebar
            ? 'h-[4.5rem] max-w-[170px] sm:max-w-[200px]'
            : 'h-[5.25rem] max-w-[260px] 2xl:h-28 2xl:max-w-[340px]'
        )}
      >
        <img
          src={FakiehLogo}
          alt="Fakieh"
          className={cn(
            'w-auto max-w-full object-contain',
            isSidebar ? 'max-h-[3.75rem]' : 'max-h-[5rem] 2xl:max-h-[6.5rem]'
          )}
        />
      </div>
      {/* ASM — right */}
      <div
        className={cn(
          'flex items-center rounded-md bg-white p-0.5 shadow-sm ring-1 ring-slate-600/25 sm:px-1',
          isSidebar
            ? 'h-[4.5rem] max-w-[300px] sm:max-w-[360px]'
            : 'h-[5.25rem] max-w-[380px] 2xl:h-28 2xl:max-w-[520px]'
        )}
      >
        <img
          src={AsmLogo}
          alt="ASM Process Automation"
          className={cn(
            'w-auto max-w-full object-contain object-left',
            isSidebar ? 'max-h-[3.75rem]' : 'max-h-[5rem] 2xl:max-h-[6.5rem]'
          )}
        />
      </div>
    </div>
  )
}
