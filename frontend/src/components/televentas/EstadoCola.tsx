"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const KIND_LABEL: Record<string, string> = {
  llamadas: "Llamadas", produccion: "Producción", crm: "Gestiones CRM",
};

/** Estado de la cola de procesamiento — visible en las páginas de subida.
 *  Muestra si el worker está vivo, qué se está procesando y los últimos fallos. */
export function EstadoCola() {
  const [estado, setEstado] = useState<any>(null);

  useEffect(() => {
    let activo = true;
    const tick = () =>
      apiFetch<any>("/api/v1/televentas/cola").then((d) => { if (activo) setEstado(d); }).catch(() => {});
    tick();
    const t = setInterval(tick, 5000);
    return () => { activo = false; clearInterval(t); };
  }, []);

  if (!estado) return null;
  const kinds = Object.entries(estado.kinds ?? {}) as Array<[string, any]>;
  const pendientes = kinds.reduce((s, [, k]) => s + (k.pendientes ?? 0), 0);
  const procesando = kinds.reduce((s, [, k]) => s + (k.procesando ?? 0), 0);
  const enProceso = kinds.flatMap(([kind, k]) => (k.en_proceso ?? []).map((p: any) => ({ ...p, kind })));
  const fallosRecientes = kinds.flatMap(([kind, k]) => (k.ultimos_fallidos ?? []).map((f: any) => ({ ...f, kind }))).slice(0, 2);

  return (
    <section className="mt-6 rounded-md border border-brand-border bg-brand-bg-soft px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Cola de procesamiento</span>
        {estado.worker_vivo ? (
          <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Activa{estado.heartbeat_hace_s != null ? ` (latido hace ${estado.heartbeat_hace_s}s)` : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-brand-primary font-bold">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
            Sin señal del procesador — se autorecupera solo; si persiste más de 2 minutos, avisá a soporte
          </span>
        )}
        <span className="text-brand-graphite">Pendientes: <b>{pendientes}</b></span>
        <span className="text-brand-graphite">Procesando: <b>{procesando}</b></span>
        {estado.ultimo_error_worker && (
          <span className="text-brand-orange" title={estado.ultimo_error_worker}>Reintentando tras un error transitorio…</span>
        )}
      </div>
      {enProceso.length > 0 && (
        <div className="mt-1.5 text-[11px] text-brand-graphite">
          {enProceso.map((p) => (
            <div key={p.id}>
              Procesando <b>{KIND_LABEL[p.kind] ?? p.kind}</b>: {p.filename ?? p.id}
              {p.hace_s != null ? ` · hace ${p.hace_s >= 60 ? `${Math.floor(p.hace_s / 60)}m ${p.hace_s % 60}s` : `${p.hace_s}s`}` : ""}
              {p.hace_s != null && p.hace_s > 300 && (
                <span className="text-brand-orange"> — demorado; el watchdog lo re-encola o marca fallido solo</span>
              )}
            </div>
          ))}
        </div>
      )}
      {fallosRecientes.length > 0 && (
        <div className="mt-1.5 text-[11px] text-brand-slate">
          {fallosRecientes.map((f) => (
            <div key={f.id} className="truncate" title={f.error ?? undefined}>
              Último fallo en {KIND_LABEL[f.kind] ?? f.kind}: {f.filename ?? f.id} — {f.error ?? "sin detalle"}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
