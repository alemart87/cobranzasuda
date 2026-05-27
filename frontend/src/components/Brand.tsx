export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-brand-primary flex items-center justify-center text-white font-bold">
        V
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-brand-secondary">Cobranzas Sudameris Seguros</div>
        <div className="text-xs text-brand-neutral-500">Operado por Voicenter S.A.</div>
      </div>
    </div>
  );
}
