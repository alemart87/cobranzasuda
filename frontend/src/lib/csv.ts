"use client";

export interface CsvColumn {
  key: string;
  label: string;
}

/** Descarga una lista de objetos como .csv (compatible con Excel/Sheets). */
export function downloadCsv(filename: string, rows: Array<Record<string, any>>, columns: CsvColumn[]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(","));
  // BOM para que Excel reconozca UTF-8 (acentos correctos).
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
