"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { monthLabel } from "@/lib/month";

export const ALERTA_ESTADO: Record<string, { label: string; cls: string; pulso?: boolean }> = {
  activa: { label: "Activa", cls: "bg-brand-primary text-white", pulso: true },
  en_mitigacion: { label: "En mitigación", cls: "bg-brand-orange text-white" },
  mitigada: { label: "Mitigada", cls: "bg-emerald-100 text-emerald-700" },
  apagada: { label: "Apagada", cls: "bg-brand-bg text-brand-slate border border-brand-border" },
};

const ACCIONES: Record<string, Array<{ accion: string; label: string; destacada?: boolean }>> = {
  activa: [{ accion: "mitigar", label: "Mitigar", destacada: true }, { accion: "apagar", label: "Apagar" }, { accion: "comentar", label: "Comentar" }],
  en_mitigacion: [{ accion: "resolver", label: "Marcar mitigada", destacada: true }, { accion: "apagar", label: "Apagar" }, { accion: "comentar", label: "Comentar" }],
  mitigada: [{ accion: "reactivar", label: "Reactivar" }, { accion: "apagar", label: "Apagar" }, { accion: "comentar", label: "Comentar" }],
  apagada: [{ accion: "reactivar", label: "Reactivar" }, { accion: "comentar", label: "Comentar" }],
};

/** Fila de alerta con acciones del flujo (toda acción exige comentario). */
export function AlertaAcciones({ alerta, onChange }: { alerta: any; onChange: (a: any) => void }) {
  const [accionSel, setAccionSel] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async () => {
    if (!accionSel || !comentario.trim()) return;
    setEnviando(true); setError(null);
    try {
      const d = await apiFetch<any>(`/api/v1/televentas/eficiencia/alertas/${alerta.id}/accion`, {
        method: "POST", body: JSON.stringify({ accion: accionSel, comentario: comentario.trim() }),
      });
      setAccionSel(null); setComentario("");
      onChange(d);
    } catch (e: any) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div className="no-print">
      <div className="flex flex-wrap gap-1.5">
        {(ACCIONES[alerta.estado] ?? []).map((a) => (
          <button key={a.accion} onClick={() => { setAccionSel(accionSel === a.accion ? null : a.accion); setError(null); }}
            className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              accionSel === a.accion ? "bg-brand-ink text-white border-brand-ink"
                : a.destacada ? "border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white"
                  : "border-brand-border text-brand-graphite hover:border-brand-primary"}`}>
            {a.label}
          </button>
        ))}
      </div>
      {accionSel && (
        <div className="flex gap-2 mt-2">
          <input value={comentario} onChange={(e) => setComentario(e.target.value)} autoFocus
            placeholder={accionSel === "apagar" ? "Justificación (obligatoria) — ej.: baja ejecutada el 15/08"
              : accionSel === "mitigar" ? "Plan de mitigación — ej.: coaching diario con supervisora 2 semanas"
                : "Comentario (obligatorio)"}
            className="input flex-1 !py-1.5 text-sm" />
          <button onClick={ejecutar} disabled={enviando || !comentario.trim()} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
            Confirmar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-brand-primary mt-1">{error}</p>}
    </div>
  );
}

/** Panel de alertas de eficiencia (control de costos). Visible en la pestaña Eficiencia. */
export function AlertasEficiencia({ refreshKey }: { refreshKey?: any }) {
  const [alertas, setAlertas] = useState<any[]>([]);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = (todas: boolean) =>
    apiFetch<any>(`/api/v1/televentas/eficiencia/alertas${todas ? "" : "?estado=abiertas"}`)
      .then((d) => setAlertas(d.alertas ?? [])).catch(() => setAlertas([]));

  useEffect(() => { cargar(verTodas); }, [verTodas, refreshKey]);

  const abiertas = alertas.filter((a) => a.estado === "activa" || a.estado === "en_mitigacion").length;

  return (
    <section className="card p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-display text-xl text-brand-ink uppercase flex items-center gap-2">
          Alertas de eficiencia
          {abiertas > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-primary text-white text-xs font-bold">
              <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />{abiertas} abierta(s)
            </span>
          )}
        </h2>
        <button onClick={() => setVerTodas(!verTodas)} className="text-xs text-brand-graphite border border-brand-border rounded px-2.5 py-1.5 hover:border-brand-primary no-print">
          {verTodas ? "Solo abiertas" : "Ver historial completo"}
        </button>
      </div>
      <p className="text-xs text-brand-slate mb-4 max-w-3xl">
        El costo por hora se controla acá: cada operador fuera de objetivo genera una alerta con su informe.
        Flujo: <b>Activa → En mitigación → Mitigada</b>, o <b>Apagada</b> con justificación — toda acción exige
        comentario y queda en el seguimiento.
      </p>

      {alertas.length === 0 ? (
        <p className="text-sm text-brand-slate">
          {verTodas ? "Sin alertas registradas." : "Sin alertas abiertas — costos bajo control."}
        </p>
      ) : (
        <ul className="space-y-3">
          {alertas.map((a) => {
            const st = ALERTA_ESTADO[a.estado] ?? ALERTA_ESTADO.activa;
            return (
              <li key={a.id} className={`rounded-md border p-3 ${a.estado === "activa" ? "border-brand-primary/60 bg-brand-primary/5" : "border-brand-border"}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st.cls}`}>
                    {st.pulso && <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse mr-1" />}{st.label}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.severidad === "alta" ? "bg-brand-ink text-white" : "bg-brand-orange/10 text-brand-orange"}`}>
                    Severidad {a.severidad}
                  </span>
                  <span className="text-sm font-semibold text-brand-ink">{a.titulo}</span>
                  <span className="text-[11px] text-brand-slate">· {monthLabel(a.mes)}</span>
                  <Link href={`/televentas/eficiencia/alertas/${a.id}`} className="ml-auto text-xs font-semibold text-brand-primary hover:underline no-print">
                    Ver informe de alerta →
                  </Link>
                </div>
                {a.seguimiento?.length > 0 && (
                  <p className="text-[11px] text-brand-slate mb-2">
                    Último seguimiento: {a.seguimiento[a.seguimiento.length - 1].comentario}
                    {" "}<i>({a.seguimiento[a.seguimiento.length - 1].autor})</i>
                  </p>
                )}
                <AlertaAcciones alerta={a} onChange={() => cargar(verTodas)} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
