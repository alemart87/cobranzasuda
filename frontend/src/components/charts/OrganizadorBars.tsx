"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatGs } from "@/lib/format";

interface Org {
  organizador: string;
  polizas: number;
  asegurados: number;
  saldo: number;
  vencido: number;
}

export function OrganizadorBars({ organizadores }: { organizadores: Org[] }) {
  const top = organizadores.slice(0, 10).map((o) => ({
    ...o,
    short: o.organizador.length > 30 ? o.organizador.slice(0, 28) + "…" : o.organizador,
  }));

  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={top} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => (v / 1_000_000).toFixed(0) + " M"} />
        <YAxis type="category" dataKey="short" width={220} fontSize={12} />
        <Tooltip formatter={(v: any) => formatGs(v)} />
        <Legend />
        <Bar dataKey="saldo" name="Saldo total" fill="#003C71" radius={[0, 4, 4, 0]} />
        <Bar dataKey="vencido" name="Vencido" fill="#E30613" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
