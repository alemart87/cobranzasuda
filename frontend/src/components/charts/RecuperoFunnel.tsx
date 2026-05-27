"use client";

import { formatGs } from "@/lib/format";

interface Props {
  vencidoTotal: number;
  recuperoTotal: number;
  recuperoSobreMora: number;
  pctRecuperoTotal: number;
  pctSobreMora: number;
}

export function RecuperoFunnel({
  vencidoTotal,
  recuperoTotal,
  recuperoSobreMora,
  pctRecuperoTotal,
  pctSobreMora,
}: Props) {
  const max = Math.max(vencidoTotal, recuperoTotal, recuperoSobreMora);
  const w = (val: number) => `${Math.max((val / max) * 100, 8)}%`;

  return (
    <div className="space-y-3">
      <FunnelRow
        label="Saldo en mora"
        value={vencidoTotal}
        width={w(vencidoTotal)}
        color="bg-brand-neutral-400"
      />
      <FunnelRow
        label="Recupero total del mes"
        value={recuperoTotal}
        width={w(recuperoTotal)}
        color="bg-brand-primary"
        hint={`${pctRecuperoTotal.toFixed(1)}% del vencido`}
      />
      <FunnelRow
        label="Recupero efectivo sobre mora"
        value={recuperoSobreMora}
        width={w(recuperoSobreMora)}
        color="bg-brand-accent"
        hint={`${pctSobreMora.toFixed(2)}% del vencido`}
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
        <span className="text-sm font-medium text-brand-neutral-700">{label}</span>
        <span className="text-sm font-bold text-brand-secondary">{formatGs(value)}</span>
      </div>
      <div className="h-7 bg-brand-neutral-100 rounded">
        <div className={`h-full rounded flex items-center justify-end px-3 text-xs text-white ${color}`} style={{ width }}>
          {hint}
        </div>
      </div>
    </div>
  );
}
