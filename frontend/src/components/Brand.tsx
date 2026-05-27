interface BrandProps {
  /** Mostrar el texto institucional al lado del isologo */
  withTagline?: boolean;
  /** Alto del isologo en px (controla la escala). Mínimo respeta 24px del manual */
  logoHeight?: number;
  /** Variante de fondo */
  variant?: "default" | "light";
}

export function Brand({ withTagline = true, logoHeight = 38, variant = "default" }: BrandProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Logo intacto (manual de marca: área de seguridad + reducción mín. 1,5 cm ≈ 24px web) */}
      <div className="flex-shrink-0" style={{ height: logoHeight }}>
        <img
          src="/logo-voicenter-color.png"
          alt="Voicenter"
          style={{ height: logoHeight, width: "auto", display: "block" }}
        />
      </div>
      {withTagline && (
        <div className="leading-tight border-l border-brand-border pl-4">
          <div className={`font-display text-base ${variant === "light" ? "text-white" : "text-brand-ink"} uppercase tracking-wide`}>
            Operaciones <span className="text-brand-primary">Sudameris Seguros</span>
          </div>
          <div className={`text-[11px] ${variant === "light" ? "text-white/70" : "text-brand-slate"} mt-0.5`}>
            Plataforma operada por Voicenter S.A.
          </div>
        </div>
      )}
    </div>
  );
}
