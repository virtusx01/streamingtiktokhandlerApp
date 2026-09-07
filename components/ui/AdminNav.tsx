'use client';

import React, { useState } from 'react';
import Link from 'next/navigation';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, LayoutDashboard, Gift, Layout, MessageSquare, Type } from 'lucide-react';

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Do not display on login page or stream overlay pages
  if (pathname === '/login' || pathname === '/widget' || pathname === '/comment') return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Engine & Config', icon: LayoutDashboard },
    { href: '/giveaway', label: 'Wheel Giveaway', icon: Gift },
    { href: '/widget', label: 'Widget Overlay', icon: Layout },
    { href: '/comment', label: 'Komentar', icon: MessageSquare },
    { href: '/textberjalan', label: 'Text Berjalan', icon: Type },
  ];

  return (
    <nav className="w-full bg-slate-950/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Admin Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-sm text-white tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Streaming TikTok Handler</span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Admin: virtusx01
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-1 sm:gap-2 text-xs overflow-x-auto no-scrollbar py-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  isActive
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 shadow-sm shadow-purple-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">{link.label}</span>
              </a>
            );
          })}

          {/* Logout button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Keluar dari sesi Admin"
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{loggingOut ? 'Keluar...' : 'Logout'}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
