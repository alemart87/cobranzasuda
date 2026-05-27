"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { formatGs } from "@/lib/format";

interface Tramo {
  tramo: string;
  monto: number;
  clientes: number;
  pct_del_vencido: number;
}

const COLORS = ["#FCD34D", "#FB923C", "#F97316", "#EF4444", "#DC2626", "#991B1B"];

export function TramosBarChart({ tramos }: { tramos: Tramo[] }) {
  const data = tramos.map((t) => ({ ...t, label: t.tramo }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => (v / 1_000_000).toFixed(0) + " M"} />
        <YAxis type="category" dataKey="label" width={120} />
        <Tooltip
          formatter={(v: any, name: string) => {
            if (name === "monto") return [formatGs(v), "Monto"];
            return [v, name];
          }}
        />
        <Bar dataKey="monto" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
