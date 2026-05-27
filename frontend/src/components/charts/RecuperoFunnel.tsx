"use client";

import { formatGs } from "@/lib/format";

interface Props {
  vencidoTotal: number;
  recuperoTotal: number;
  pctRecuperoTotal: number;
  asegPagaron: number;
  asegEnMora: number;
}

export function RecuperoFunnel({
  vencidoTotal,
  recuperoTotal,
  pctRecuperoTotal,
  asegPagaron,
  asegEnMora,
}: Props) {
  const max = Math.max(vencidoTotal, recuperoTotal, 1);
  const w = (val: number) => `${Math.max((val / max) * 100, 8)}%`;

  return (
    <div className="space-y-3">
      <FunnelRow
        label="Saldo en mora"
        value={vencidoTotal}
        width={w(vencidoTotal)}
        color="bg-brand-mist"
        hint={`${asegEnMora} asegurados`}
      />
      <FunnelRow
        label="Recupero total del mes"
        value={recuperoTotal}
        width={w(recuperoTotal)}
        color="bg-brand-primary"
        hint={`${pctRecuperoTotal.toFixed(1)} % vs vencido · ${asegPagaron} pagaron`}
      />
    </div>
  );
}

function FunnelRow({
  label,
  value,
  width,
  color,
  hint,
}: {
  label: string;
  value: number;
  width: string;
  color: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-brand-graphite">{label}</span>
        <span className="text-sm font-bold text-brand-ink">{formatGs(value)}</span>
      </div>
      <div className="h-7 bg-brand-bg rounded">
        <div
          className={`h-full rounded flex items-center justify-end px-3 text-xs text-white ${color}`}
          style={{ width }}
        >
          {hint}
        </div>
      </div>
    </div>
  );
}
