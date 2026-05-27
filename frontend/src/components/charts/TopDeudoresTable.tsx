"use client";

import { formatGs, formatPct } from "@/lib/format";

interface Deudor {
  asegurado: string;
  polizas: number;
  saldo_total: number;
  vencido: number;
  organizador: string;
  pct_vencido_sobre_saldo: number;
}

export function TopDeudoresTable({ deudores }: { deudores: Deudor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-brand-neutral-100 text-brand-neutral-700">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Asegurado</th>
            <th className="px-3 py-2 text-left">Organizador</th>
            <th className="px-3 py-2 text-right">Pol.</th>
            <th className="px-3 py-2 text-right">Vencido</th>
            <th className="px-3 py-2 text-right">Saldo Total</th>
            <th className="px-3 py-2 text-right">% Venc.</th>
          </tr>
        </thead>
        <tbody>
          {deudores.map((d, i) => (
            <tr key={d.asegurado} className="border-b border-brand-neutral-200 hover:bg-brand-neutral-50">
              <td className="px-3 py-2 text-brand-neutral-500">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-brand-secondary">{d.asegurado}</td>
              <td className="px-3 py-2 text-brand-neutral-600 text-xs">{d.organizador}</td>
              <td className="px-3 py-2 text-right">{d.polizas}</td>
              <td className="px-3 py-2 text-right font-semibold text-brand-accent">{formatGs(d.vencido)}</td>
              <td className="px-3 py-2 text-right text-brand-neutral-700">{formatGs(d.saldo_total)}</td>
              <td className="px-3 py-2 text-right">{formatPct(d.pct_vencido_sobre_saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
