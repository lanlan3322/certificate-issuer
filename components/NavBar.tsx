"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  FileText,
  CheckCircle,
  Menu,
  X,
  KeyRound,
  LayoutDashboard,
  Briefcase,
  BookOpen,
  FolderKanban,
} from "lucide-react";
import { useState } from "react";

export default function NavBar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/platform", label: "Platform", icon: Shield },
    { href: "/did", label: "DID", icon: KeyRound },
    { href: "/verify", label: "Verification", icon: CheckCircle },
    { href: "/wallet", label: "Wallet", icon: FolderKanban },
    { href: "/enterprise", label: "Enterprise", icon: Briefcase },
    { href: "/docs", label: "Docs", icon: BookOpen },
    { href: "/admin", label: "Admin", icon: FileText },
  ];

  return (
    <nav className="border-b border-slate-200 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-cyan-300 shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">TrustVC</div>
              <div className="text-base font-bold text-slate-900">Verifiable Certificates</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <button
            className="rounded-lg border border-slate-200 p-2 text-slate-700 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="space-y-2 border-t border-slate-200 py-3 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
