"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover, PrintHeader } from "@/components/PrintButton";
import { ALERTA_ESTADO, AlertaAcciones } from "@/components/televentas/AlertasEficiencia";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const FLUJO = ["activa", "en_mitigacion", "mitigada"];

/** Informe específico de una alerta de eficiencia — imprimible, con flujo y seguimiento. */
export default function InformeAlertaPage() {
  const params = useParams<{ id: string }>();
  const [alerta, setAlerta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () =>
    apiFetch<any>(`/api/v1/televentas/eficiencia/alertas/${params.id}`).then(setAlerta).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!alerta) return <AppShell><div className="text-brand-slate">Cargando alerta…</div></AppShell>;

  const d = alerta.detalle ?? {};
  const st = ALERTA_ESTADO[alerta.estado] ?? ALERTA_ESTADO.activa;

  return (
    <AppShell>
      <PrintCover
        titulo={`Informe de Alerta — ${alerta.operador}`}
        periodo={`${monthLabel(alerta.mes)} · ${alerta.titulo} · Estado: ${st.label}`}
      />
      <PrintHeader titulo={`Informe de Alerta · ${alerta.operador}`}
        subtitulo={`${monthLabel(alerta.mes)} · Severidad ${alerta.severidad} · Estado ${st.label} · Registro #${String(alerta.id).slice(0, 8)}`} />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span>
        <Link href="/televentas/eficiencia" className="hover:text-brand-primary">Eficiencia</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Informe de alerta</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Informe de Alerta</h1>
          <p className="text-sm text-brand-slate mt-1">
            {alerta.titulo} · {monthLabel(alerta.mes)} · generada {alerta.created_at ? new Date(alerta.created_at).toLocaleString("es-PY") : "—"}
          </p>
        </div>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      {/* Estado del flujo */}
      <section className="card p-5 mb-6">
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-3">Flujo de la alerta</h2>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FLUJO.map((f, i) => {
            const e = ALERTA_ESTADO[f];
            const activo = alerta.estado === f;
            const pasado = FLUJO.indexOf(alerta.estado) > i && alerta.estado !== "apagada";
            return (
              <div key={f} className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-md text-sm font-bold ${
                  activo ? e.cls : pasado ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-brand-bg text-brand-mist border border-brand-border"}`}>
                  {e.label}
                </span>
                {i < FLUJO.length - 1 && <span className="text-brand-mist font-bold">→</span>}
              </div>
            );
          })}
          <span className="text-brand-mist mx-1">|</span>
          <span className={`px-3 py-1.5 rounded-md text-sm font-bold ${
            alerta.estado === "apagada" ? ALERTA_ESTADO.apagada.cls + " !bg-brand-ink !text-white" : "bg-brand-bg text-brand-mist border border-brand-border"}`}>
            Apagada
          </span>
        </div>
        <AlertaAcciones alerta={alerta} onChange={setAlerta} />
      </section>

      {/* Detalle de la alerta */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Índice de eficiencia" value={`${d.indice ?? "—"}`} hint={d.indice_prev != null ? `mes anterior: ${d.indice_prev}` : "100 = media del equipo"} accent="primary" />
        <KpiCard label="Prima del mes" value={formatGs(d.prima ?? 0)} hint={d.cuota_por_operador ? `cuota: ${formatGs(d.cuota_por_operador)}` : undefined} accent="orange" />
        <KpiCard label="Prima por día activo" value={formatGs(d.prima_dia ?? 0)} hint={d.medias_equipo?.prima_dia ? `media: ${formatGs(d.medias_equipo.prima_dia)}` : undefined} accent="cyan" />
        <KpiCard label="Conversión" value={`${d.conversion_pct ?? "—"}%`} hint={d.medias_equipo?.conversion_pct ? `media: ${d.medias_equipo.conversion_pct}%` : undefined} accent="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Llamadas por día" value={`${d.llamadas_dia ?? "—"}`} hint={d.medias_equipo?.llamadas_dia ? `media: ${d.medias_equipo.llamadas_dia}` : undefined} accent="neutral" />
        <KpiCard label="Días activos" value={formatInt(d.dias_activos ?? 0)} accent="neutral" />
        <KpiCard label="Antigüedad" value={d.antiguedad_dias != null ? `${d.antiguedad_dias} días` : "—"} accent="neutral" />
        <KpiCard label="Objetivo del mes (equipo)" value={d.objetivo_prima ? formatGs(d.objetivo_prima) : "—"} accent="neutral" />
      </div>

      <section className="card p-5 border-l-4 border-brand-primary mb-6">
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-1">Motivo de la alerta (del análisis de eficiencia)</h2>
        <p className="text-sm text-brand-ink leading-relaxed font-medium">{d.motivo}</p>
        <p className="text-xs text-brand-slate mt-2">
          Origen: análisis de eficiencia de {monthLabel(alerta.mes)} (registro #{String(alerta.analisis_id).slice(0, 8)}).
          El servicio se paga por hora: una alerta abierta es costo sin retorno hasta que alguien la atienda.
        </p>
      </section>

      {/* Seguimiento */}
      <section className="card p-5 mb-6">
        <h2 className="font-display text-lg text-brand-ink uppercase mb-3">Seguimiento</h2>
        <ol className="space-y-2">
          {(alerta.seguimiento ?? []).map((s: any, i: number) => (
            <li key={i} className="rounded-md bg-brand-bg-soft border border-brand-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${(ALERTA_ESTADO[s.estado] ?? ALERTA_ESTADO.activa).cls}`}>
                  {s.accion}
                </span>
                <span className="text-[11px] text-brand-slate">
                  {s.autor} · {s.fecha ? new Date(s.fecha).toLocaleString("es-PY") : ""}
                </span>
              </div>
              <p className="text-sm text-brand-ink mt-1">{s.comentario}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="no-print">
        <Link href="/televentas/eficiencia" className="btn-ghost inline-flex items-center gap-2">← Volver a Eficiencia</Link>
      </div>
    </AppShell>
  );
}
