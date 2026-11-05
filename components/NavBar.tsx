"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { normalizePagePath, publicNavigation, workspaceNavigation } from "../lib/navigation";
import { withBasePath } from "../lib/site";
import PageLoadingIndicator from "./PageLoadingIndicator";

export default function NavBar({ agentAvailable = false }: { agentAvailable?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, error: sessionError, refresh } = useWorkspaceSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const navGroups = workspaceNavigation(user);

  useEffect(() => {
    setIsNavigating(false);
    setMobileMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
    const outside = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) { setAccountOpen(false); accountButton.current?.focus(); }
      if (mobileMenuOpen) { setMobileMenuOpen(false); mobileButton.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [accountOpen, mobileMenuOpen]);

  const navigate = (href: string) => {
    if (normalizePagePath(pathname) !== normalizePagePath(href)) setIsNavigating(true);
    setAccountOpen(false);
    setMobileMenuOpen(false);
  };
  const active = (href: string) => normalizePagePath(pathname) === normalizePagePath(href);
  const toggleTheme = () => {
    const next = !darkMode;
    document.documentElement.classList.toggle("dark", next);
    setDarkMode(next);
    try { window.localStorage.setItem("trustvc-theme", next ? "dark" : "light"); }
    catch { setError("Theme changed for this visit. Your browser could not save the preference."); }
  };
  const logout = async () => {
    setLoggingOut(true); setError(null);
    try {
      const response = await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      await refresh();
      setAccountOpen(false); setMobileMenuOpen(false);
      router.push("/issuer/");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign out."); }
    finally { setLoggingOut(false); }
  };

  return <header className="site-header sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    {isNavigating && <PageLoadingIndicator />}
    <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
      <Link href="/" prefetch={false} onNavigate={() => navigate("/")} className="shrink-0 rounded-lg" aria-label="Verifiable.sg home">
        <img src={withBasePath("/vs-light.png")} alt="Verifiable.sg" width={1420} height={300} className="h-auto w-[144px] dark:hidden sm:w-[185px]" />
        <img src={withBasePath("/vs-dark.png")} alt="Verifiable.sg" width={1420} height={300} className="hidden h-auto w-[144px] dark:block sm:w-[185px]" />
      </Link>
      <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
        {publicNavigation.map((item) => <Link key={item.href} href={item.href} prefetch={false}
          onNavigate={() => navigate(item.href)} aria-current={active(item.href) ? "page" : undefined}
          className={`nav-link ${active(item.href) ? "nav-link-active" : ""}`}>{item.label}</Link>)}
      </nav>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        {user && agentAvailable && <button type="button" aria-label="Open Issuer Success Agent"
          onClick={() => window.dispatchEvent(new Event("trustvc-agent-open"))}
          className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700 sm:inline-flex">Assistant</button>}
        <button type="button" onClick={toggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="icon-button">{darkMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}</button>
        <div ref={accountRef} className="relative hidden lg:block">
          {user ? <><button ref={accountButton} type="button" aria-expanded={accountOpen} aria-controls="account-navigation"
            onClick={() => setAccountOpen((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700">
            <span className="max-w-36 truncate">{user.displayName || "My workspace"}</span><ChevronDown size={16} aria-hidden="true" />
          </button>
          {accountOpen && <nav id="account-navigation" aria-label="Account navigation" className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <p className="truncate px-3 py-2 text-xs text-slate-500">{user.email}</p>
            <Link href="/dashboard" prefetch={false} onNavigate={() => navigate("/dashboard")} className="nav-link block">Open workspace</Link>
            <Link href="/profile" prefetch={false} onNavigate={() => navigate("/profile")} className="nav-link block">My profile</Link>
            <button type="button" disabled={loggingOut} onClick={() => void logout()} className="nav-link flex w-full items-center gap-2 text-left text-red-700 dark:text-red-300"><LogOut size={16} aria-hidden="true" />{loggingOut ? "Signing out..." : "Sign out"}</button>
          </nav>}</> : <Link href="/issuer/" prefetch={false} onNavigate={() => navigate("/issuer/")} className="btn-primary">Sign in <ArrowUpRight size={16} className="ml-2" aria-hidden="true" /></Link>}
        </div>
        {!user && <Link href="/issuer/" prefetch={false} onNavigate={() => navigate("/issuer/")} className="nav-link hidden whitespace-nowrap px-2 min-[360px]:inline-flex lg:hidden">Sign in</Link>}
        <button ref={mobileButton} type="button" aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" onClick={() => setMobileMenuOpen((value) => !value)}
          className="icon-button lg:hidden">{mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
      </div>
    </div>
    {(error || sessionError) && <p role="alert" className="mx-auto max-w-7xl px-4 pb-3 text-sm text-red-700 dark:text-red-300">{error || sessionError}</p>}
    {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="max-h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain border-t border-slate-200 px-4 pb-6 dark:border-slate-800 lg:hidden">
      <div className="grid grid-cols-2 gap-1 py-3">{publicNavigation.map((item) => <Link key={item.href} href={item.href} prefetch={false}
        onNavigate={() => navigate(item.href)} aria-current={active(item.href) ? "page" : undefined}
        className={`nav-link ${active(item.href) ? "nav-link-active" : ""}`}>{item.label}</Link>)}</div>
      {!user && <Link href="/issuer/" prefetch={false} onNavigate={() => navigate("/issuer/")} className="btn-primary mb-3 w-full">Sign in to your workspace</Link>}
      {navGroups.map((group) => <section key={group.label} className="border-t border-slate-200 py-3 dark:border-slate-800">
        <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{group.label}</h2>
        <div className="grid gap-1 sm:grid-cols-2">{group.items.map((item) => <Link key={item.href} href={item.href} prefetch={false}
          onNavigate={() => navigate(item.href)} aria-current={active(item.href) ? "page" : undefined}
          className={`nav-link ${active(item.href) ? "nav-link-active" : ""}`}>{item.label}</Link>)}</div>
      </section>)}
      {user && <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <p className="truncate px-3 py-2 text-sm text-slate-500">{user.email}</p>
        {agentAvailable && <button type="button" className="nav-link block w-full text-left" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new Event("trustvc-agent-open")); }}>Open assistant</button>}
        <button type="button" disabled={loggingOut} className="nav-link text-red-700 dark:text-red-300" onClick={() => void logout()}>{loggingOut ? "Signing out..." : "Sign out"}</button>
      </div>}
    </nav>}
  </header>;
}
