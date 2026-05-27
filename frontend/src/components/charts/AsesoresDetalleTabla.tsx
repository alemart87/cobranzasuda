"use client";

interface Asesor {
  usuario: string;
  llamadas: number;
  efectivas: number;
  no_efectivas: number;
  pct_efectivas: number;
  talk_hms: string;
  talk_horas: number;
  aht_hms: string;
}

export function AsesoresDetalleTabla({ asesores }: { asesores: Asesor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-brand-neutral-100 text-brand-neutral-700">
          <tr>
            <th className="px-3 py-2 text-left">Operador</th>
            <th className="px-3 py-2 text-right">Llamadas</th>
            <th className="px-3 py-2 text-right">Efectivas</th>
            <th className="px-3 py-2 text-right">No efect.</th>
            <th className="px-3 py-2 text-right">% Efect.</th>
            <th className="px-3 py-2 text-right">Talk Time</th>
            <th className="px-3 py-2 text-right">AHT</th>
          </tr>
        </thead>
        <tbody>
          {asesores.map((a) => (
            <tr key={a.usuario} className="border-b border-brand-neutral-200 hover:bg-brand-neutral-50">
              <td className="px-3 py-2 font-medium text-brand-secondary">{a.usuario}</td>
              <td className="px-3 py-2 text-right font-semibold">{a.llamadas.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right text-brand-primary">{a.efectivas.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right text-brand-neutral-500">{a.no_efectivas.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right">{a.pct_efectivas.toFixed(1)} %</td>
              <td className="px-3 py-2 text-right font-mono">{a.talk_hms}</td>
              <td className="px-3 py-2 text-right font-mono">{a.aht_hms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
