"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatGs } from "@/lib/format";

interface Props {
  aVencer: number;
  vencido: number;
}

export function CarteraDonut({ aVencer, vencido }: Props) {
  const data = [
    { name: "A vencer (vigente)", value: aVencer, color: "#0066B3" },
    { name: "Vencido (mora)", value: vencido, color: "#E30613" },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v: any) => formatGs(v)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
