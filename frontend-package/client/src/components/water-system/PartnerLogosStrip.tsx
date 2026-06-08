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
        'shrink-0 items-center gap-2.5 border-r border-slate-600/70 pr-4 md:gap-3 md:pr-5',
        isSidebar ? 'flex' : 'hidden sm:flex'
      )}
      aria-label="Fakieh and ASM"
    >
      {/* Fakieh — left */}
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-white/5 px-2.5 ring-1 ring-white/10 sm:px-3',
          isSidebar
            ? 'h-14 max-w-[170px] sm:h-16 sm:max-w-[205px] md:h-[4.25rem] md:max-w-[245px]'
            : 'h-28 max-w-[280px] sm:max-w-[320px] md:max-w-[360px]'
        )}
      >
        <img
          src={FakiehLogo}
          alt="Fakieh"
          className={cn(
            'w-auto max-w-full object-contain',
            isSidebar ? 'max-h-12 sm:max-h-14 md:max-h-[4rem]' : 'max-h-[6.5rem]'
          )}
        />
      </div>
      {/* ASM — right */}
      <div
        className={cn(
          'flex items-center rounded-md bg-white p-0.5 shadow-sm ring-1 ring-slate-600/25 sm:px-1',
          isSidebar
            ? 'h-14 max-w-[260px] sm:h-16 sm:max-w-[305px] md:h-[4.25rem] md:max-w-[360px]'
            : 'h-28 max-w-[400px] sm:max-w-[460px] md:max-w-[520px]'
        )}
      >
        <img
          src={AsmLogo}
          alt="ASM Process Automation"
          className={cn(
            'w-auto max-w-full object-contain object-left',
            isSidebar ? 'max-h-12 sm:max-h-14 md:max-h-[4rem]' : 'max-h-[6.5rem]'
          )}
        />
      </div>
    </div>
  )
}
