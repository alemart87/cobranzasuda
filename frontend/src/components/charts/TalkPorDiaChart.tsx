"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#0066B3", "#E30613", "#003C71", "#FB923C", "#10B981"];

interface Props {
  data: Array<Record<string, any>>;
  usuarios: string[];
}

export function TalkPorDiaChart({ data, usuarios }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="fecha" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => `${v} min`} />
        <Tooltip formatter={(v: any) => `${v} min`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {usuarios.map((u, i) => (
          <Line
            key={u}
            type="monotone"
            dataKey={u}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
