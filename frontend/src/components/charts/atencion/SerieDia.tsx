"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SerieBar {
  key: string;
  name: string;
  color: string;
}

/** Serie diaria con barras (oferta/contestadas/abandono) + línea opcional (AHT/atención). */
export function SerieDia({
  data,
  bars,
  line,
  xKey = "dia",
}: {
  data: Array<Record<string, any>>;
  bars: SerieBar[];
  line?: { key: string; name: string; color: string; unit?: string };
  xKey?: string;
}) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-brand-slate">Sin datos.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        {line && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} />}
        <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => (
          <Bar key={b.key} yAxisId="left" dataKey={b.key} name={b.name} fill={b.color} radius={[3, 3, 0, 0]} barSize={14} />
        ))}
        {line && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
