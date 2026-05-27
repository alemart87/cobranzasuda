export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo-voicenter-color.png"
        alt="Voicenter"
        className="h-9 w-auto"
      />
      <div className="leading-tight border-l border-brand-neutral-200 pl-3">
        <div className="text-sm font-bold text-brand-secondary">Cobranzas Sudameris Seguros</div>
        <div className="text-xs text-brand-neutral-500">Operado por Voicenter S.A.</div>
      </div>
    </div>
  );
}
