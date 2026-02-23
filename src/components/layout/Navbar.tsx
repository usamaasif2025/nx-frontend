'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, BookOpen, Newspaper, Lightbulb } from 'lucide-react';

const NAV_LINKS = [
  { href: '/scanner',    label: 'Scanner',    icon: Activity },
  { href: '/watchlist',  label: 'Watchlist',  icon: LayoutDashboard },
  { href: '/news',       label: 'News',       icon: Newspaper },
  { href: '/strategies', label: 'Strategies', icon: Lightbulb },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a1a1a] bg-black/95 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/scanner" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
            <Activity size={14} className="text-cyan-400" />
          </div>
          <span className="font-bold text-white tracking-tight text-sm">
            momentum<span className="text-cyan-400">scanner</span>
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  active
                    ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={13} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-live" />
          <span>LIVE</span>
        </div>
      </div>
    </nav>
  );
}
