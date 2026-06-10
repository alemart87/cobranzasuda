"use client";

/** Botón "Imprimir PDF" — usa la impresión nativa del navegador (Guardar como PDF). */
export function PrintButton({ label = "Imprimir PDF", className = "" }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print btn-ghost inline-flex items-center gap-2 ${className}`}
      title="Imprimir o guardar como PDF"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" rx="1" />
      </svg>
      {label}
    </button>
  );
}

/** Encabezado corporativo que aparece SOLO al imprimir (membrete del informe). */
export function PrintHeader({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="print-only" style={{ borderTop: "4px solid #E6332A", paddingTop: 10, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, color: "#E6332A", fontSize: 18, letterSpacing: 0.5 }}>voicenter</div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b" }}>
          Operaciones · Sudameris Seguros
        </div>
      </div>
      <h1 style={{ margin: "6px 0 2px", fontSize: 20, textTransform: "uppercase", color: "#0f172a" }}>{titulo}</h1>
      {subtitulo && <div style={{ fontSize: 12, color: "#64748b" }}>{subtitulo}</div>}
    </div>
  );
}
