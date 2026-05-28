"use client";

// Utilidades de mes compartidas entre vistas (Overview, Carteras Totales, etc.)

const MONTH_KEY = "vc_month";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "2026-06" -> "Junio 2026". Acepta también "2026-06-01". */
export function monthLabel(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.slice(0, 7).split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${y}` : ym;
}

/** Normaliza un period_month (date o "YYYY-MM-DD") a "YYYY-MM". */
export function toMonth(value: string | null | undefined): string | null {
  return value ? value.slice(0, 7) : null;
}

/** Mes preferido por el usuario, recordado entre vistas (continuidad de navegación). */
export function getPreferredMonth(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(MONTH_KEY);
}

export function setPreferredMonth(m: string): void {
  if (typeof window !== "undefined" && m) localStorage.setItem(MONTH_KEY, m);
}

/**
 * Elige el mes inicial: la preferencia del usuario si está entre los disponibles,
 * si no el más reciente (los meses vienen desc).
 */
export function pickInitialMonth(available: string[]): string | null {
  if (available.length === 0) return null;
  const pref = getPreferredMonth();
  return pref && available.includes(pref) ? pref : available[0];
}
