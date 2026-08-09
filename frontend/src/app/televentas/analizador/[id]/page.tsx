"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PrintButton, PrintCover, PrintHeader } from "@/components/PrintButton";
import { InformeAnalisis } from "@/components/televentas/InformeAnalisis";
import { apiFetch } from "@/lib/api";
import { formatGs } from "@/lib/format";
import { periodLabel } from "@/lib/month";

/** Informe completo de un análisis registrado — versión imprimible (PDF corporativo). */
export default function InformeAnalizadorPage() {
  const params = useParams<{ id: string }>();
  const [log, setLog] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<any>(`/api/v1/televentas/analizador/logs/${params.id}`)
      .then(setLog).catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!log) return <AppShell><div className="text-brand-slate">Cargando informe…</div></AppShell>;

  const meses = String(log.meses || "").split(",").filter(Boolean);
  const mesAnalizado = meses[meses.length - 1];
  const fecha = log.created_at ? new Date(log.created_at).toLocaleString("es-PY") : "—";

  return (
    <AppShell>
      <PrintCover
        titulo={`Informe del Analizador — ${periodLabel(mesAnalizado)}`}
        periodo={`Hipótesis: producción vs objetivo de ${formatGs(log.objetivo_prima)} · Meses base: ${meses.map((m) => periodLabel(m)).join(", ")}`}
      />
      <PrintHeader
        titulo={`Informe del Analizador · ${periodLabel(mesAnalizado)}`}
        subtitulo={`Generado: ${fecha} · Registro #${String(log.id).slice(0, 8)}`}
      />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span>
        <Link href="/televentas/comparativo" className="hover:text-brand-primary">Comparativo</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Informe del Analizador</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">
            Informe del Analizador
          </h1>
          <p className="text-sm text-brand-slate mt-1">
            {periodLabel(mesAnalizado)} vs referencia {meses.slice(0, -1).map((m) => periodLabel(m)).join(" + ")} ·
            objetivo {formatGs(log.objetivo_prima)} · generado {fecha}
            {log.consulta ? <> · consulta: <i>"{log.consulta}"</i></> : null}
          </p>
        </div>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <InformeAnalisis res={log.data} meses={meses} />

      <div className="mt-6 no-print">
        <Link href="/televentas/comparativo" className="btn-ghost inline-flex items-center gap-2">
          ← Volver al comparativo
        </Link>
      </div>
    </AppShell>
  );
}
