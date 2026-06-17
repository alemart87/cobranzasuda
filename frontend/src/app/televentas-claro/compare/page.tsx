"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

function gs(v: number) {
  const s = "Gs " + Math.abs(Math.round(v)).toLocaleString("es-PY");
  return v < 0 ? "−" + s : s;
}

interface RepItem { id: string; periodo: string | null; nro_liquidacion: string | null; total: number; is_published: boolean; title: string | null; }

export default function ComparePage() {
  const [reports, setReports] = useState<RepItem[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ can_view_facturacion: boolean }>("/api/v1/auth/me");
        if (!me.can_view_facturacion) { setError("Acceso restringido."); return; }
        const data = await apiFetch<{ items: RepItem[] }>("/api/v1/facturacion/reports");
        setReports(data.items);
      } catch (e: any) { setError(e.message); }
    })();
  }, []);

  const toggle = (id: string) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/v1/facturacion/compare", {
        method: "POST", body: JSON.stringify({ report_ids: Array.from(sel) }),
      });
      setResult(res);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap print:hidden">
        <div>
          <Link href="/televentas-claro" className="text-xs text-brand-slate hover:text-brand-primary">← Volver</Link>
          <h1 className="font-display text-3xl text-brand-ink uppercase mt-1">Comparar facturaciones</h1>
          <p className="text-sm text-brand-slate">Seleccioná 2 o más reportes (mínimo recomendado: 3 meses).</p>
        </div>
        <div className="flex gap-2">
          {result && <button onClick={() => window.print()} className="btn-outline">Imprimir</button>}
          <button onClick={run} disabled={sel.size < 2 || loading} className="btn-primary">
            {loading ? "Comparando…" : `Comparar (${sel.size})`}
          </button>
        </div>
      </div>

      {error && <div className="card p-4 text-brand-primary mb-4">{error}</div>}

      {/* Selector */}
      <div className="card p-4 mb-6 print:hidden">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
          {reports.map((r) => (
            <label key={r.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${sel.has(r.id) ? "border-brand-primary bg-brand-primary-light" : "border-brand-border"}`}>
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
              <span className="text-sm">
                <b>{r.periodo || r.title || "—"}</b> <span className="text-brand-slate">· {gs(r.total)}</span>
                {!r.is_published && <span className="badge-neutral ml-1 text-[9px]">borrador</span>}
              </span>
            </label>
          ))}
        </div>
      </div>

      {result && <CompareResult result={result} />}
    </AppShell>
  );
}

function CompareResult({ result }: { result: any }) {
  const cols = result.columnas || [];
  return (
    <div className="space-y-6">
      {/* Totales + variaciones */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider2 text-brand-slate border-b border-brand-border">
              <th className="px-4 py-2.5"> </th>
              {cols.map((c: any) => <th key={c.id} className="px-4 py-2.5 text-right">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <Row label="Facturación neta" values={result.totales} bold />
            <Row label="Créditos" values={result.creditos} cls="text-emerald-700" />
            <Row label="Débitos" values={result.debitos} cls="text-brand-primary" />
            <tr className="border-b border-brand-border/50">
              <td className="px-4 py-2 font-medium">Variación mensual</td>
              {result.variaciones.map((v: number | null, i: number) => (
                <td key={i} className={`px-4 py-2 text-right ${v == null ? "text-brand-slate" : v < 0 ? "text-brand-primary" : "text-emerald-700"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`}</td>
              ))}
            </tr>
            <tr className="border-b border-brand-border/50">
              <td className="px-4 py-2">Ventas (activaciones)</td>
              {result.ventas.map((v: number, i: number) => <td key={i} className="px-4 py-2 text-right">{v.toLocaleString("es-PY")}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Panel de drivers */}
      {result.drivers?.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-brand-border"><h2 className="font-display text-base uppercase text-brand-ink">Panel de drivers</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider2 text-brand-slate border-b border-brand-border">
                <th className="px-4 py-2">Driver</th>
                {cols.map((c: any) => <th key={c.id} className="px-4 py-2 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.drivers.map((d: any, i: number) => <Row key={i} label={d.nombre} values={d.valores} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Matriz completa por concepto */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-brand-border"><h2 className="font-display text-base uppercase text-brand-ink">Comparativo por concepto ({result.conceptos.length})</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider2 text-brand-slate border-b border-brand-border">
              <th className="px-4 py-2">Concepto</th>
              {cols.map((c: any) => <th key={c.id} className="px-4 py-2 text-right">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.conceptos.map((c: any, i: number) => <Row key={i} label={c.descripcion} values={c.valores} signo />)}
          </tbody>
        </table>
      </div>

      {/* Hallazgos */}
      {result.hallazgos?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-display text-base uppercase text-brand-ink mb-2">Hallazgos</h2>
          <ul className="space-y-1 text-sm">{result.hallazgos.map((h: string, i: number) => <li key={i}>› {h}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, values, bold, cls, signo }: { label: string; values: number[]; bold?: boolean; cls?: string; signo?: boolean }) {
  return (
    <tr className="border-b border-brand-border/50">
      <td className={`px-4 py-2 ${bold ? "font-semibold" : ""}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-4 py-2 text-right ${bold ? "font-semibold" : ""} ${cls || (signo && v < 0 ? "text-brand-primary" : "")}`}>{gs(v)}</td>
      ))}
    </tr>
  );
}
