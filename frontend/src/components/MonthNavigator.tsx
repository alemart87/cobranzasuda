"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/month";

interface MonthNavigatorProps {
  /** Meses disponibles en formato "YYYY-MM", ordenados desc (más reciente primero). */
  months: string[];
  /** Mes seleccionado ("YYYY-MM"). */
  value: string | null;
  onChange: (month: string) => void;
}

/**
 * Navegador de mes corporativo: ‹  Junio 2026 ▾  ›
 * Flechas para mes anterior/siguiente (limitadas a los disponibles) + dropdown
 * para saltar a cualquier mes. Pensado para que el gerente recorra los períodos.
 */
export function MonthNavigator({ months, value, onChange }: MonthNavigatorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (months.length === 0) return null;

  const idx = value ? months.indexOf(value) : 0;
  const safeIdx = idx < 0 ? 0 : idx;
  // months desc → índice menor = más nuevo. "Siguiente" (más nuevo) = idx-1.
  const hasNewer = safeIdx > 0;
  const hasOlder = safeIdx < months.length - 1;

  const go = (i: number) => {
    if (i >= 0 && i < months.length) onChange(months[i]);
  };

  const arrowBtn =
    "w-8 h-8 flex items-center justify-center text-brand-slate hover:text-brand-primary hover:bg-brand-bg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-brand-slate transition-colors";

  return (
    <div ref={ref} className="relative inline-flex items-stretch rounded-md border border-brand-border bg-white shadow-soft overflow-visible">
      <button
        type="button"
        aria-label="Mes anterior"
        className={`${arrowBtn} rounded-l-md border-r border-brand-border`}
        disabled={!hasOlder}
        onClick={() => go(safeIdx + 1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 h-8 inline-flex items-center gap-2 text-sm font-semibold text-brand-ink hover:bg-brand-bg transition-colors min-w-[150px] justify-center"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-brand-slate">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        {value ? monthLabel(value) : "—"}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-brand-slate transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Mes siguiente"
        className={`${arrowBtn} rounded-r-md border-l border-brand-border`}
        disabled={!hasNewer}
        onClick={() => go(safeIdx - 1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-40 min-w-[170px] max-h-72 overflow-y-auto bg-white rounded-md shadow-elevated border border-brand-border py-1 animate-pop">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-2 text-sm font-medium hover:bg-brand-bg ${
                m === value ? "text-brand-primary bg-brand-primary-light/40" : "text-brand-graphite"
              }`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
