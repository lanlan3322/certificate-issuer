"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface CertificatePaperProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function CertificatePaper({ children, className = "", style }: CertificatePaperProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ scale: number; height?: number }>({ scale: 1 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const paper = paperRef.current;
    if (!viewport || !paper) return;

    const measure = () => {
      if (!viewport.clientWidth || !paper.offsetWidth || !paper.offsetHeight) return;
      const scale = Math.min(1, viewport.clientWidth / paper.offsetWidth);
      const height = Math.ceil(paper.offsetHeight * scale);
      setLayout((current) =>
        current.scale === scale && current.height === height ? current : { scale, height }
      );
    };

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(paper);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="certificate-a4-viewport relative mx-auto aspect-[210/297] w-full min-w-0 max-w-[210mm] overflow-hidden"
      style={{ height: layout.height }}
    >
      <div
        ref={paperRef}
        className={`certificate-paper certificate-a4-paper absolute left-0 top-0 w-[210mm] min-h-[297mm] bg-white ${className}`}
        style={{ ...style, transform: `scale(${layout.scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
