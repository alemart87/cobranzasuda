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

interface Asesor {
  usuario: string;
  llamadas: number;
  efectivas: number;
  no_efectivas: number;
  talk_horas: number;
}

export function AsesoresLlamadasChart({ asesores }: { asesores: Asesor[] }) {
  const data = asesores.map((a) => ({
    usuario: a.usuario.length > 22 ? a.usuario.slice(0, 20) + "…" : a.usuario,
    Efectivas: a.efectivas,
    "No efectivas": a.no_efectivas,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(80, asesores.length * 38) + 60}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" fontSize={12} />
        <YAxis type="category" dataKey="usuario" width={200} fontSize={12} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Efectivas" stackId="a" fill="#0066B3" />
        <Bar dataKey="No efectivas" stackId="a" fill="#9CA3AF" />
      </BarChart>
    </ResponsiveContainer>
  );
}
