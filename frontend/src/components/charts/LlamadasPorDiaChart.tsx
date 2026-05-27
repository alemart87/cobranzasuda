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

const COLORS = [
  "#0066B3",
  "#E30613",
  "#003C71",
  "#FB923C",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
];

interface Props {
  data: Array<Record<string, any>>;
  usuarios: string[];
}

export function LlamadasPorDiaChart({ data, usuarios }: Props) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="fecha" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {usuarios.map((u, i) => (
          <Bar key={u} dataKey={u} stackId="a" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
