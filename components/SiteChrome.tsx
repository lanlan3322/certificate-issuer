"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { isWorkspacePage, normalizePagePath, pageNavigation, workspaceNavigation } from "../lib/navigation";

interface SiteChromeProps {
  header: ReactNode;
  footer: ReactNode;
  widget: ReactNode;
  children: ReactNode;
}

/** Omits site navigation on pages framed by external viewers. */
export default function SiteChrome({ header, footer, widget, children }: SiteChromeProps) {
  const pathname = usePathname() ?? "";
  const { user } = useWorkspaceSession();
  if (/^\/renderer\/?$/.test(pathname)) return <>{children}</>;
  const workspace = Boolean(user) && isWorkspacePage(pathname);
  const page = pageNavigation(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <div className={`site-body flex-1 ${workspace ? "workspace-layout" : ""}`}>
        {workspace && <aside className="workspace-sidebar hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:block">
          <div className="sticky top-[72px] max-h-[calc(100dvh-72px)] overflow-y-auto p-4">
            <div className="mb-5 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Organization workspace</p>
              <p className="mt-1 break-words text-sm font-semibold">{user?.issuerName}</p>
              <p className="mt-1 text-xs text-slate-500">{user?.roles.map((role) => role.replaceAll("_", " ")).join(", ")}</p>
            </div>
            <nav aria-label="Workspace navigation" className="space-y-5">
              {workspaceNavigation(user).map((group) => <section key={group.label}>
                <h2 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</h2>
                <div className="mt-2 space-y-1">{group.items.map((item) => <Link key={item.href} href={item.href} prefetch={false}
                  aria-current={normalizePagePath(pathname) === item.href ? "page" : undefined}
                  className={`nav-link block ${normalizePagePath(pathname) === item.href ? "nav-link-active" : ""}`}>{item.label}</Link>)}</div>
              </section>)}
            </nav>
          </div>
        </aside>}
        <div id="main-content" tabIndex={-1} className={`site-content min-w-0 ${workspace ? "workspace-content" : ""}`}>
          {workspace && page && <div className="workspace-context border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6 lg:px-8">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <Link href="/dashboard" prefetch={false} className="shrink-0 hover:text-cyan-700">Workspace</Link>
              <span aria-hidden="true">/</span><span className="truncate text-slate-700 dark:text-slate-200" aria-current="page">{page.label}</span>
            </nav>
            <p className="mt-1 text-sm text-slate-500">{page.description}</p>
          </div>}
          {children}
        </div>
      </div>
      {footer}
      {user && widget}
    </div>
  );
}
