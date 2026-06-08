"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { DistBar, type DistItem } from "@/components/charts/atencion/DistBar";
import { TagCloud, type Tag } from "@/components/charts/atencion/TagCloud";
import { apiFetch } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";

interface Tema {
  tema: string;
  cantidad: number;
  pct: number;
  ejemplos: string[];
  por_estado: Record<string, number>;
}

interface VozCliente {
  disponible: boolean;
  total_descripciones: number;
  largo_promedio: number;
  temas: Tema[];
  palabras_clave: DistItem[];
  nube: Tag[];
  frases_bigramas: Array<{ frase: string; cantidad: number }>;
  frases_trigramas: Array<{ frase: string; cantidad: number }>;
  friccion_cantidad: number;
  friccion_pct: number;
}

interface GestionDetail {
  id: string;
  period_month: string | null;
  data: { voz_cliente?: VozCliente };
}

const TEMA_COLORS = ["#00B2BF", "#662483", "#E6332A", "#F39200", "#0891b2", "#7c3aed",
  "#0f172a", "#15803d", "#b45309", "#be123c", "#64748b", "#0e7490"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 mb-6">
      <h2 className="font-display text-lg text-brand-ink uppercase mb-1">{title}</h2>
      {hint && <p className="text-xs text-brand-slate mb-4">{hint}</p>}
      {children}
    </section>
  );
}

export default function VozClientePage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<GestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<GestionDetail>(`/api/v1/atencion/gestiones/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div>Cargando…</div></AppShell>;

  const v = report.data.voz_cliente;

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/atencion" className="hover:text-brand-primary">Atención</Link>
        <span className="mx-2">/</span>
        <Link href="/atencion/gestiones/reports" className="hover:text-brand-primary">Gestiones</Link>
        <span className="mx-2">/</span>
        <Link href={`/atencion/gestiones/reports/${params.id}`} className="hover:text-brand-primary">{report.period_month ?? "Reporte"}</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Voz del Cliente</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">La Voz del Cliente</h1>
        <p className="text-sm text-brand-slate mt-1">
          Análisis del campo <b>Descripción del problema</b>: motivos reales de contacto, palabras y
          frases clave, y señales de fricción detectadas en las gestiones.
        </p>
      </div>

      {(!v || !v.disponible) && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">Este reporte no tiene descripciones para analizar.</p>
        </div>
      )}

      {v && v.disponible && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Descripciones analizadas" value={formatInt(v.total_descripciones)} accent="purple" />
            <KpiCard label="Largo promedio" value={`${v.largo_promedio} car.`} accent="secondary" />
            <KpiCard label="Temas detectados" value={`${v.temas.length}`} accent="cyan" />
            <KpiCard label="Con señales de fricción" value={formatPct(v.friccion_pct)} hint={`${formatInt(v.friccion_cantidad)} gestiones`} accent="orange" />
          </div>

          <Section title="Nube de palabras" hint="Las palabras más frecuentes en las descripciones; el tamaño refleja la frecuencia.">
            <TagCloud tags={v.nube} />
          </Section>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Section title="Motivos de contacto (temas)" hint="Cada gestión clasificada en su tema principal.">
              <DistBar
                data={v.temas.map((t) => ({ label: t.tema, cantidad: t.cantidad, pct: t.pct }))}
                palette={TEMA_COLORS}
              />
            </Section>
            <Section title="Palabras clave" hint="Términos más mencionados (sin muletillas ni conectores).">
              <DistBar data={v.palabras_clave} color="#662483" showPct={false} />
            </Section>
          </div>

          <Section title="Frases clave" hint="Combinaciones de palabras que se repiten — revelan el motivo concreto del contacto.">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-2">Frases de 3 palabras</div>
                <ul className="space-y-1.5">
                  {v.frases_trigramas.map((f) => (
                    <li key={f.frase} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-brand-ink">{f.frase}</span>
                      <span className="text-xs font-semibold text-brand-purple bg-brand-purple/10 rounded px-2 py-0.5">{f.cantidad}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-2">Frases de 2 palabras</div>
                <div className="flex flex-wrap gap-1.5">
                  {v.frases_bigramas.map((f) => (
                    <span key={f.frase} className="text-xs bg-brand-bg border border-brand-border rounded-full px-2.5 py-1 text-brand-graphite">
                      {f.frase} <b className="text-brand-cyan">{f.cantidad}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Temas en detalle" hint="Volumen, estado de resolución y frases reales de cada motivo.">
            <div className="grid md:grid-cols-2 gap-4">
              {v.temas.map((t, i) => (
                <div key={t.tema} className="border border-brand-border rounded-md p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TEMA_COLORS[i % TEMA_COLORS.length] }} />
                      <h3 className="font-semibold text-brand-ink text-sm truncate">{t.tema}</h3>
                    </div>
                    <span className="text-xs font-semibold text-brand-slate whitespace-nowrap">{formatInt(t.cantidad)} · {formatPct(t.pct)}</span>
                  </div>
                  {Object.keys(t.por_estado).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {Object.entries(t.por_estado).map(([est, n]) => (
                        <span key={est} className="text-[10px] uppercase tracking-wider2 px-1.5 py-0.5 rounded bg-brand-bg text-brand-slate">
                          {est}: <b className="text-brand-ink">{n}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {t.ejemplos.length > 0 && (
                    <ul className="space-y-1 mt-1">
                      {t.ejemplos.map((e, j) => (
                        <li key={j} className="text-[11px] text-brand-slate italic border-l-2 border-brand-border pl-2 leading-snug">
                          "{e}"
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </AppShell>
  );
}
