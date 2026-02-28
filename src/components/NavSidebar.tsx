'use client';

import Link     from 'next/link';
import { usePathname } from 'next/navigation';
import { LineChart, ScanLine, Newspaper } from 'lucide-react';

const NAV = [
  { href: '/',        icon: LineChart,  label: 'Chart'   },
  { href: '/scanner', icon: ScanLine,   label: 'Scanner' },
  { href: '/news',    icon: Newspaper,  label: 'News'    },
];

export default function NavSidebar() {
  const path = usePathname();

  return (
    <nav className="w-12 flex flex-col items-center py-3 gap-1 bg-[#0a0a0a] border-r border-[#111] shrink-0 h-full">

      {/* Brand */}
      <div className="mb-4 mt-1">
        <span className="text-[9px] font-black tracking-widest text-[#26a69a]">NX</span>
      </div>

      {NAV.map(({ href, icon: Icon, label }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
              active
                ? 'bg-[#26a69a]/15 text-[#26a69a]'
                : 'text-gray-700 hover:text-gray-400 hover:bg-[#111]'
            }`}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
          </Link>
        );
      })}
    </nav>
  );
}
