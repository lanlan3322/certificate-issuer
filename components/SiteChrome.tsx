"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface SiteChromeProps {
  header: ReactNode;
  footer: ReactNode;
  widget: ReactNode;
  children: ReactNode;
}

/** Omits site navigation on pages framed by external viewers. */
export default function SiteChrome({ header, footer, widget, children }: SiteChromeProps) {
  const pathname = usePathname() ?? "";
  if (/^\/renderer\/?$/.test(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <div className="flex-1">{children}</div>
      {footer}
      {widget}
    </div>
  );
}
