"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGs } from "@/lib/format";

/** Gráfico de cascada (waterfall) para los momentos de la liquidación: cada paso suma o resta
 *  sobre el anterior y los "totales" arrancan desde cero. Ejecutivo: valores en millones sobre cada barra. */
export type PasoCascada = { nombre: string; valor: number; tipo?: "delta" | "total"; color?: string; corto?: string };

const M = (v: number) => `${v < 0 ? "−" : ""}${Math.round(Math.abs(v) / 1e6)}M`;

export function Cascada({ pasos, altura = 300, colorTotal = "#0F1116" }: { pasos: PasoCascada[]; altura?: number; colorTotal?: string }) {
  let acum = 0;
  const data = pasos.map((p) => {
    const esTotal = p.tipo === "total";
    let base: number, alto: number, fin: number;
    if (esTotal) {
      acum = p.valor; base = Math.min(0, p.valor); alto = Math.abs(p.valor); fin = p.valor;
    } else {
      const ini = acum; fin = acum + p.valor; acum = fin;
      base = Math.min(ini, fin); alto = Math.abs(p.valor);
    }
    const color = p.color ?? (esTotal ? colorTotal : p.valor >= 0 ? "#10B981" : "#E6332A");
    return { nombre: p.corto ?? p.nombre, nombreLargo: p.nombre, base, alto, fin, valor: esTotal ? p.valor : p.valor, color, esTotal };
  });
  const valores = data.flatMap((d) => [d.base, d.base + d.alto, 0]);
  const min = Math.min(...valores), max = Math.max(...valores);
  const margen = (max - min) * 0.12;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
        <XAxis dataKey="nombre" fontSize={10} interval={0} tick={{ fill: "#4B5563" }} />
        <YAxis fontSize={10} tickFormatter={M} domain={[Math.floor((min - margen) / 1e8) * 1e8, Math.ceil((max + margen) / 1e8) * 1e8]} width={44} />
        <Tooltip
          formatter={(_: any, __: any, item: any) => [formatGs(item.payload.valor), item.payload.esTotal ? "Total" : item.payload.valor >= 0 ? "Suma" : "Resta"]}
          labelFormatter={(_, payload: any) => payload?.[0]?.payload?.nombreLargo ?? ""}
        />
        <ReferenceLine y={0} stroke="#0F1116" />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="alto" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={d.esTotal ? 1 : 0.85} />)}
          <LabelList dataKey="valor" position="top" fontSize={11} fontWeight={700} formatter={(v: any) => M(Number(v))} fill="#0F1116" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
