"use client";

export interface Tag {
  text: string;
  weight: number;
}

const PALETTE = ["#00B2BF", "#662483", "#E6332A", "#F39200", "#0f172a", "#0891b2"];

/** Nube de palabras: tamaño de fuente proporcional a la frecuencia. Sin librerías. */
export function TagCloud({ tags, max = 40 }: { tags: Tag[]; max?: number }) {
  const items = (tags || []).slice(0, max);
  if (items.length === 0) return <p className="text-sm text-brand-slate">Sin datos.</p>;

  const weights = items.map((t) => t.weight);
  const min = Math.min(...weights);
  const peak = Math.max(...weights);
  const size = (w: number) => {
    if (peak === min) return 22;
    return Math.round(14 + ((w - min) / (peak - min)) * 30); // 14–44 px
  };

  // Ordenar por peso para intercalar tamaños de forma agradable.
  const sorted = [...items].sort((a, b) => b.weight - a.weight);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 py-4">
      {sorted.map((t, i) => (
        <span
          key={t.text}
          title={`${t.text}: ${t.weight}`}
          style={{ fontSize: size(t.weight), color: PALETTE[i % PALETTE.length], lineHeight: 1.1 }}
          className="font-display uppercase tracking-wide leading-none hover:opacity-70 transition-opacity cursor-default"
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
