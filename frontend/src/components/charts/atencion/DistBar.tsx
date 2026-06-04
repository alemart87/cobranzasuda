"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DistItem {
  label: string;
  cantidad: number;
  pct?: number;
}

/** Barras horizontales para distribuciones (tipo, estado, canal, motivos, colas). */
export function DistBar({
  data,
  color = "#00B2BF",
  palette,
  height,
  showPct = true,
}: {
  data: DistItem[];
  color?: string;
  palette?: string[];
  height?: number;
  showPct?: boolean;
}) {
  const rows = data.filter((d) => d.label);
  if (rows.length === 0) {
    return <p className="text-sm text-brand-slate">Sin datos.</p>;
  }
  const h = height ?? Math.max(140, rows.length * 38 + 20);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={170}
          tick={{ fontSize: 12, fill: "#475569" }}
          interval={0}
        />
        <Tooltip
          formatter={(v: any, _n, p: any) =>
            [`${v}${showPct && p?.payload?.pct != null ? ` · ${p.payload.pct}%` : ""}`, "Cantidad"]
          }
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
        <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} barSize={20}>
          {rows.map((_, i) => (
            <Cell key={i} fill={palette ? palette[i % palette.length] : color} />
          ))}
          <LabelList
            dataKey={showPct ? "pct" : "cantidad"}
            position="right"
            formatter={(v: any) => (showPct ? `${v}%` : v)}
            style={{ fontSize: 11, fill: "#475569", fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
