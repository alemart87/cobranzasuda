"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

/** Bajas de operadores (Televentas): dar de baja saca al operador de pendientes y apaga
 *  sus alertas abiertas; reincorporar lo devuelve al circuito de alertas. */

export type Baja = { id: string; operador: string; fecha_baja: string | null; motivo: string | null; alertas_apagadas: string[]; dado_de_baja_por: string; created_at: string | null; activa: boolean };

export const opKey = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().split(/\s+/).join(" ");
export const estaDeBaja = (bajas: Baja[], operador: string) => bajas.some((b) => b.activa && opKey(b.operador) === opKey(operador));

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY") : "—");

/** Botón "Dar de baja" con confirmación y motivo. */
export function BotonBaja({ operador, bajas, onChange, compacto = false }: { operador: string; bajas: Baja[]; onChange: () => void; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (estaDeBaja(bajas, operador)) {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-ink text-white whitespace-nowrap">BAJA</span>;
  }
  const confirmar = async () => {
    setEnviando(true); setError(null);
    try {
      await apiFetch("/api/v1/televentas/eficiencia/bajas", { method: "POST", body: JSON.stringify({ operador, motivo: motivo.trim() || null, fecha_baja: fechaBaja || null }) });
      setAbierto(false); setMotivo(""); onChange();
    } catch (e: any) { setError(e.message); } finally { setEnviando(false); }
  };
  return (
    <span className="no-print inline-block">
      <button onClick={() => setAbierto(!abierto)} title="Marcar que el operador ya no está: sale de pendientes y se apagan sus alertas"
        className={`rounded border border-brand-border text-brand-slate hover:border-brand-ink hover:text-brand-ink ${compacto ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs font-semibold"}`}>
        Dar de baja
      </button>
      {abierto && (
        <div className="mt-2 rounded-md border border-brand-ink bg-white p-3 text-left shadow-md max-w-md">
          <div className="text-[11px] font-semibold text-brand-ink mb-1">Dar de baja a {operador}</div>
          <p className="text-[11px] text-brand-slate mb-2">Sale de pendientes y se apagan automáticamente todas sus alertas abiertas (queda registrado en el seguimiento). Los próximos análisis no le generan alertas. Se puede reincorporar.</p>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} className="input !py-1 text-sm w-40" />
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej.: renuncia el 15/09)" className="input !py-1 text-sm flex-1 min-w-[180px]" />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={confirmar} disabled={enviando} className="btn-primary !py-1.5 text-sm disabled:opacity-50">Confirmar baja</button>
            <button onClick={() => setAbierto(false)} className="px-3 py-1.5 rounded-md border border-brand-border text-sm">Cancelar</button>
          </div>
          {error && <p className="text-xs text-brand-primary mt-1">{error}</p>}
        </div>
      )}
    </span>
  );
}

/** Lista de operadores dados de baja con reincorporación. */
export function ListaBajas({ bajas, onChange }: { bajas: Baja[]; onChange: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activas = bajas.filter((b) => b.activa);
  const reincorporar = async (b: Baja) => {
    if (!confirm(`¿Reincorporar a ${b.operador}? Vuelve a entrar al circuito de alertas.`)) return;
    setError(null);
    try { await apiFetch(`/api/v1/televentas/eficiencia/bajas/${b.id}`, { method: "DELETE" }); onChange(); }
    catch (e: any) { setError(e.message); }
  };
  return (
    <div className="mt-3 rounded-md border border-brand-border bg-brand-bg-soft">
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="text-[11px] uppercase tracking-wider2 font-bold text-brand-slate">Operadores dados de baja <span className="ml-1 px-1.5 py-0.5 rounded bg-brand-ink text-white text-[10px]">{activas.length}</span></span>
        <span className="text-[11px] text-brand-slate no-print">{abierto ? "ocultar" : "ver"}</span>
      </button>
      {abierto && (
        <div className="px-3 pb-3">
          {activas.length === 0 ? <p className="text-xs text-brand-slate">Ningún operador dado de baja.</p> : (
            <ul className="divide-y divide-brand-border">
              {activas.map((b) => (
                <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <b className="text-brand-ink">{b.operador}</b>
                    <div className="text-[11px] text-brand-slate">baja {fecha(b.fecha_baja)} · {b.motivo || "sin motivo"} · {b.alertas_apagadas.length} alerta(s) apagada(s) · por {b.dado_de_baja_por} el {fecha(b.created_at)}</div>
                  </div>
                  <button onClick={() => reincorporar(b)} className="no-print px-2.5 py-1 rounded border border-brand-border text-xs font-semibold text-brand-graphite hover:border-brand-primary hover:text-brand-primary">Reincorporar</button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-xs text-brand-primary mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
