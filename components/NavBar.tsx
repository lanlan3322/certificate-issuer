"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle,
  FilePlus2,
  Menu,
  X,
  Moon,
  Sun,
  KeyRound,
  LayoutDashboard,
  BookOpen,
  Palette,
  Wallet,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function NavBar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [issuerAuthenticated, setIssuerAuthenticated] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("trustvc-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = storedTheme ? storedTheme === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", shouldUseDark);
    setDarkMode(shouldUseDark);
  }, []);

  useEffect(() => {
    void fetch("/api/auth/me", { method: "POST" })
      .then(async (response) => response.ok ? await response.json() as { user?: unknown } : null)
      .then((payload) => setIssuerAuthenticated(Boolean(payload?.user)))
      .catch(() => setIssuerAuthenticated(false));
  }, [pathname]);

  const toggleTheme = () => {
    const nextMode = !darkMode;
    document.documentElement.classList.toggle("dark", nextMode);
    window.localStorage.setItem("trustvc-theme", nextMode ? "dark" : "light");
    setDarkMode(nextMode);
  };

  const publicNavItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/verify", label: "Verification", icon: CheckCircle },
    { href: "/platform", label: "Platform", icon: KeyRound },
    { href: "/docs", label: "Docs", icon: BookOpen },
    { href: "/issuer/", label: "Issuer access", icon: KeyRound },
  ];
  const issuerNavItems = [
    { href: "/insurance", label: "Issue", icon: FilePlus2 },
    { href: "/branding", label: "Branding", icon: Palette },
    { href: "/did", label: "DID lifecycle", icon: KeyRound },
    { href: "/wallet", label: "Wallet", icon: Wallet },
    { href: "/delivery", label: "Delivery", icon: Send },
  ];
  const navItems = issuerAuthenticated ? [...publicNavItems.slice(0, 1), ...issuerNavItems, ...publicNavItems.slice(1)] : publicNavItems;

  return (
    <nav className="sticky top-3 z-50 px-4 pb-3 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/85 dark:shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/verifiable-logo.svg" alt="Verifiable" className="h-8 w-auto max-w-[170px] sm:h-9 sm:max-w-[205px]" />
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              className="rounded-lg border border-slate-200 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700 md:hidden">
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
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
