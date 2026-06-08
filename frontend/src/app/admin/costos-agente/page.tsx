"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface CostItem {
  user_id: string;
  name: string;
  email: string;
  role: string;
  queries: number;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  avg_cost_usd: number;
  last_at: string | null;
}
interface CostsResponse {
  pricing: { model: string; input_per_mtok: number; cached_input_per_mtok: number; output_per_mtok: number; currency: string };
  items: CostItem[];
  totals: { queries: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number };
}

const usd = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: 4 })}`;

const ROLE_LABEL: Record<string, string> = { superadmin: "Superadmin", analyst: "Analista", client: "Cliente" };

export default function CostosAgentePage() {
  const [data, setData] = useState<CostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markup, setMarkup] = useState<number>(0);   // % de margen sobre el costo
  const [fx, setFx] = useState<number>(0);           // Gs por USD (0 = oculto)
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<CostsResponse>("/api/v1/agent/costs").then(setData).catch((e) => setError(e.message));
  }, []);

  if (user && user.role !== "superadmin") {
    return <AppShell><div className="card p-8 text-center"><p className="text-brand-slate">Solo el superadmin puede ver los costos del agente.</p></div></AppShell>;
  }
  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!data) return <AppShell><div className="text-brand-slate">Cargando…</div></AppShell>;

  const charge = (cost: number) => cost * (1 + (markup || 0) / 100);
  const gs = (usdv: number) => (fx > 0 ? `Gs ${Math.round(usdv * fx).toLocaleString("es-PY")}` : null);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Costos de Agente</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">
          Consumo de tokens y costo de las consultas al Agente de Experiencia, por usuario.
          Sirve para definir cuánto cobrar a cada cliente.
        </p>
      </div>

      {/* Precios del modelo */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold">Modelo {data.pricing.model}</span>
        <span>Input <b>{usd(data.pricing.input_per_mtok)}</b> /1M</span>
        <span>Cacheado <b>{usd(data.pricing.cached_input_per_mtok)}</b> /1M</span>
        <span>Output <b>{usd(data.pricing.output_per_mtok)}</b> /1M</span>
        <span className="ml-auto text-brand-slate">Costo total acumulado: <b className="text-brand-ink">{usd(data.totals.cost_usd)}</b></span>
      </div>

      {/* Controles para definir cobro */}
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-5">
        <div>
          <label className="label">Margen / markup (%)</label>
          <input type="number" min={0} value={markup} onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
            className="input w-32" placeholder="0" />
          <p className="text-[11px] text-brand-slate mt-1">Cobro sugerido = costo × (1 + margen).</p>
        </div>
        <div>
          <label className="label">Tipo de cambio (Gs por USD)</label>
          <input type="number" min={0} value={fx || ""} onChange={(e) => setFx(parseFloat(e.target.value) || 0)}
            className="input w-40" placeholder="opcional" />
          <p className="text-[11px] text-brand-slate mt-1">Si lo cargás, muestra el cobro en guaraníes.</p>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="card p-12 text-center"><p className="text-brand-slate">Todavía no hay consultas registradas.</p></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-right">Consultas</th>
                <th className="px-4 py-3 text-right">Tokens in</th>
                <th className="px-4 py-3 text-right">Tokens out</th>
                <th className="px-4 py-3 text-right">Tokens total</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Prom/consulta</th>
                <th className="px-4 py-3 text-right">Cobro sugerido</th>
                <th className="px-4 py-3 text-left">Última</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.user_id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{it.name}</div>
                    <div className="text-[11px] text-brand-slate">{it.email} · {ROLE_LABEL[it.role] ?? it.role}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{formatInt(it.queries)}</td>
                  <td className="px-4 py-3 text-right text-brand-slate">{formatInt(it.input_tokens)}{it.cached_tokens ? <span className="text-[10px]"> ({formatInt(it.cached_tokens)} cache)</span> : null}</td>
                  <td className="px-4 py-3 text-right text-brand-slate">{formatInt(it.output_tokens)}</td>
                  <td className="px-4 py-3 text-right">{formatInt(it.total_tokens)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{usd(it.cost_usd)}</td>
                  <td className="px-4 py-3 text-right text-brand-slate">{usd(it.avg_cost_usd)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold text-brand-cyan">{usd(charge(it.cost_usd))}</div>
                    {gs(charge(it.cost_usd)) && <div className="text-[11px] text-brand-slate">{gs(charge(it.cost_usd))}</div>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-brand-slate">{it.last_at ? formatDate(it.last_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border bg-brand-bg font-semibold">
                <td className="px-4 py-3 uppercase text-[11px] tracking-wider2 text-brand-ink">Total</td>
                <td className="px-4 py-3 text-right">{formatInt(data.totals.queries)}</td>
                <td className="px-4 py-3 text-right">{formatInt(data.totals.input_tokens)}</td>
                <td className="px-4 py-3 text-right">{formatInt(data.totals.output_tokens)}</td>
                <td className="px-4 py-3 text-right">{formatInt(data.totals.total_tokens)}</td>
                <td className="px-4 py-3 text-right">{usd(data.totals.cost_usd)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-brand-cyan">{usd(charge(data.totals.cost_usd))}</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AppShell>
  );
}
