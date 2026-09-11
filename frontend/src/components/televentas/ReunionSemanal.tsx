"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { weekLabel } from "@/lib/month";

/** Reunión semanal Voicenter · Sudameris: conclusión de la semana + compromisos
 *  (alta, edición, eliminación, estado) + arrastrados de semanas anteriores. */

const ESTADO: Record<string, { label: string; cls: string; next: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-brand-primary/10 text-brand-primary", next: "en_proceso" },
  en_proceso: { label: "En proceso", cls: "bg-brand-orange/10 text-brand-orange", next: "cumplido" },
  cumplido: { label: "Cumplido", cls: "bg-emerald-100 text-emerald-700", next: "pendiente" },
};

type Resp = "Voicenter" | "Sudameris";

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY") : "—");

function ChipResp({ r }: { r: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r === "Voicenter" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-purple/10 text-brand-purple"}`}>{r}</span>
  );
}

export function ReunionSemanal({ semana }: { semana: string }) {
  const [todos, setTodos] = useState<any[]>([]);
  const [reunion, setReunion] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // alta
  const [nuevoDesc, setNuevoDesc] = useState("");
  const [nuevoResp, setNuevoResp] = useState<Resp>("Voicenter");
  // edición de un compromiso
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editNota, setEditNota] = useState("");
  const [editResp, setEditResp] = useState<Resp>("Voicenter");
  // conclusión
  const [editandoConclusion, setEditandoConclusion] = useState(false);
  const [textoConclusion, setTextoConclusion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch<any>("/api/v1/televentas/semanal/compromisos").then((d) => setTodos(d.compromisos ?? [])).catch(() => setTodos([]));
    apiFetch<any>(`/api/v1/televentas/semanal/reunion?semana=${semana}`).then((d) => setReunion(d.reunion ?? null)).catch(() => setReunion(null));
  }, [semana]);

  useEffect(() => { cargar(); setEditId(null); setEditandoConclusion(false); setError(null); }, [cargar]);

  const compromisos = todos.filter((c) => c.semana === semana);
  const arrastrados = todos.filter((c) => c.semana < semana && c.estado !== "cumplido");
  const n = (e: string) => compromisos.filter((c) => c.estado === e).length;

  const run = async (fn: () => Promise<any>) => {
    setError(null);
    try { await fn(); cargar(); } catch (e: any) { setError(e.message || "No se pudo guardar."); }
  };

  const agregar = () => run(async () => {
    if (!nuevoDesc.trim()) return;
    await apiFetch("/api/v1/televentas/semanal/compromisos", {
      method: "POST", body: JSON.stringify({ semana, descripcion: nuevoDesc.trim(), responsable: nuevoResp }),
    });
    setNuevoDesc("");
  });

  const cambiarEstado = (c: any) => run(() =>
    apiFetch(`/api/v1/televentas/semanal/compromisos/${c.id}`, { method: "PATCH", body: JSON.stringify({ estado: ESTADO[c.estado]?.next ?? "pendiente" }) }));

  const empezarEdicion = (c: any) => { setEditId(c.id); setEditDesc(c.descripcion); setEditNota(c.nota ?? ""); setEditResp(c.responsable); };

  const guardarEdicion = () => run(async () => {
    if (!editId || !editDesc.trim()) return;
    await apiFetch(`/api/v1/televentas/semanal/compromisos/${editId}`, {
      method: "PATCH", body: JSON.stringify({ descripcion: editDesc.trim(), nota: editNota, responsable: editResp }),
    });
    setEditId(null);
  });

  const eliminar = (c: any) => {
    if (!window.confirm(`¿Eliminar el compromiso?\n\n"${c.descripcion}"\n\nEsta acción queda en la auditoría y no se puede deshacer.`)) return;
    run(() => apiFetch(`/api/v1/televentas/semanal/compromisos/${c.id}`, { method: "DELETE" }));
  };

  const guardarConclusion = async () => {
    if (!textoConclusion.trim()) return;
    setGuardando(true);
    await run(() => apiFetch("/api/v1/televentas/semanal/reunion", { method: "PUT", body: JSON.stringify({ semana, conclusion: textoConclusion.trim() }) }));
    setGuardando(false); setEditandoConclusion(false);
  };

  const eliminarConclusion = () => {
    if (!window.confirm("¿Eliminar la conclusión de esta semana?")) return;
    run(() => apiFetch(`/api/v1/televentas/semanal/reunion?semana=${semana}`, { method: "DELETE" }));
  };

  // Funciones de render (no componentes): si fueran componentes internos se remontarían en cada
  // tecleo y el editor perdería el foco.
  const filaCompromiso = (c: any, mostrarSemana?: boolean) => {
    const st = ESTADO[c.estado] ?? ESTADO.pendiente;
    if (editId === c.id) {
      return (
        <tr key={c.id} className="border-t border-brand-border bg-brand-primary/5">
          <td className="px-3 py-2" colSpan={mostrarSemana ? 5 : 4}>
            <div className="grid md:grid-cols-[1fr_auto] gap-2 items-start">
              <div className="space-y-2">
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="input w-full !py-1.5 text-sm" placeholder="Descripción del compromiso" />
                <input value={editNota} onChange={(e) => setEditNota(e.target.value)} className="input w-full !py-1.5 text-xs" placeholder="Nota o aclaración (opcional)" />
              </div>
              <div className="flex flex-col gap-2">
                <select value={editResp} onChange={(e) => setEditResp(e.target.value as Resp)} className="text-sm border border-brand-border rounded px-3 py-1.5 bg-white">
                  <option value="Voicenter">Responsable: Voicenter</option>
                  <option value="Sudameris">Responsable: Sudameris</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={guardarEdicion} disabled={!editDesc.trim()} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">Guardar</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-brand-slate hover:text-brand-ink px-2">Cancelar</button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={c.id} className="border-t border-brand-border group">
        {mostrarSemana && <td className="px-3 py-2 text-[11px] text-brand-slate whitespace-nowrap">{weekLabel(c.semana)}</td>}
        <td className="px-3 py-2 text-brand-ink">
          {c.descripcion}
          {c.nota && <div className="text-[11px] text-brand-slate mt-0.5">{c.nota}</div>}
        </td>
        <td className="px-3 py-2 text-center"><ChipResp r={c.responsable} /></td>
        <td className="px-3 py-2 text-center">
          <button onClick={() => cambiarEstado(c)} title="Click para cambiar estado" className={`px-2 py-0.5 rounded text-[10px] font-bold ${st.cls} hover:opacity-80`}>{st.label}</button>
        </td>
        <td className="px-3 py-2 text-right text-[11px] text-brand-slate whitespace-nowrap">
          <div>{fecha(c.created_at)}</div>
          <div className="no-print flex justify-end gap-2 mt-1 opacity-70 group-hover:opacity-100">
            <button onClick={() => empezarEdicion(c)} className="text-[11px] font-semibold text-brand-ink hover:text-brand-primary hover:underline">Editar</button>
            <button onClick={() => eliminar(c)} className="text-[11px] font-semibold text-brand-primary hover:underline">Eliminar</button>
          </div>
        </td>
      </tr>
    );
  };

  const cabecera = (conSemana?: boolean) => (
    <thead className="bg-brand-bg">
      <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
        {conSemana && <th className="px-3 py-2 text-left">Semana</th>}
        <th className="px-3 py-2 text-left">Compromiso</th>
        <th className="px-3 py-2 text-center">Responsable</th>
        <th className="px-3 py-2 text-center">Estado</th>
        <th className="px-3 py-2 text-right">Registrado</th>
      </tr>
    </thead>
  );

  return (
    <section className="card p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-display text-xl text-brand-ink uppercase">Reunión semanal · {weekLabel(semana)}</h2>
        <div className="flex items-center gap-1.5 text-[10px] font-bold">
          <span className="px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">{n("pendiente")} pendientes</span>
          <span className="px-2 py-0.5 rounded bg-brand-orange/10 text-brand-orange">{n("en_proceso")} en proceso</span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{n("cumplido")} cumplidos</span>
        </div>
      </div>
      <p className="text-xs text-brand-slate mb-4 max-w-3xl">
        Reunión de los viernes Voicenter · Sudameris. Los compromisos se cargan, editan y eliminan desde acá; el estado se
        cambia clickeando el chip. La conclusión cierra la semana. Todo queda en el registro con fecha y autor.
      </p>
      {error && <div className="mb-3 text-xs text-brand-primary bg-brand-primary/5 border border-brand-primary/30 rounded px-3 py-2">{error}</div>}

      {/* ===== Conclusión de la semana ===== */}
      <div className={`rounded-md border-l-4 ${reunion ? "border-brand-ink bg-brand-bg-soft" : "border-brand-border bg-white border"} p-4 mb-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Conclusión de la semana</div>
          {reunion && !editandoConclusion && (
            <div className="no-print flex gap-3">
              <button onClick={() => { setTextoConclusion(reunion.conclusion); setEditandoConclusion(true); }} className="text-[11px] font-semibold text-brand-ink hover:text-brand-primary hover:underline">Editar</button>
              <button onClick={eliminarConclusion} className="text-[11px] font-semibold text-brand-primary hover:underline">Eliminar</button>
            </div>
          )}
        </div>
        {editandoConclusion ? (
          <div className="no-print">
            <textarea value={textoConclusion} onChange={(e) => setTextoConclusion(e.target.value)} rows={4} autoFocus
              placeholder="Qué dejó la semana y qué se decidió. Ej.: “La conversión subió al 3,26% con menos base; se acordó reponer 4 vendedores el martes y priorizar la base BPM.”"
              className="input w-full text-sm leading-relaxed" />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={guardarConclusion} disabled={guardando || !textoConclusion.trim()} className="btn-primary !py-1.5 !px-4 text-sm disabled:opacity-50">
                {guardando ? "Guardando…" : reunion ? "Guardar cambios" : "Guardar conclusión"}
              </button>
              <button onClick={() => setEditandoConclusion(false)} className="text-sm text-brand-slate hover:text-brand-ink">Cancelar</button>
            </div>
          </div>
        ) : reunion ? (
          <>
            <p className="text-[15px] text-brand-ink leading-relaxed font-medium whitespace-pre-line">{reunion.conclusion}</p>
            <div className="text-[11px] text-brand-slate mt-2">
              Registrada por {reunion.created_by_nombre || "—"} el {fecha(reunion.created_at)}
              {reunion.updated_at && <> · editada por {reunion.updated_by_nombre || "—"} el {fecha(reunion.updated_at)}</>}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-brand-slate">Esta semana todavía no tiene conclusión.</p>
            <button onClick={() => { setTextoConclusion(""); setEditandoConclusion(true); }} className="no-print btn-primary !py-1.5 !px-4 text-sm">
              Agregar conclusión a la semana
            </button>
          </div>
        )}
      </div>

      {/* ===== Alta ===== */}
      <div className="flex flex-wrap items-end gap-2 mb-4 no-print">
        <label className="text-sm flex-1 min-w-[260px]">
          <span className="block text-[11px] text-brand-slate mb-1">Nuevo compromiso para {weekLabel(semana)}</span>
          <input value={nuevoDesc} onChange={(e) => setNuevoDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            placeholder='Ej.: "Sudameris entrega base depurada de 20.000 registros el lunes"' className="input w-full !py-1.5" />
        </label>
        <select value={nuevoResp} onChange={(e) => setNuevoResp(e.target.value as Resp)} className="text-sm border border-brand-border rounded px-3 py-2 bg-white">
          <option value="Voicenter">Responsable: Voicenter</option>
          <option value="Sudameris">Responsable: Sudameris</option>
        </select>
        <button onClick={agregar} disabled={!nuevoDesc.trim()} className="btn-primary disabled:opacity-50">Registrar</button>
      </div>

      {/* ===== Compromisos de la semana ===== */}
      <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold mb-1">Compromisos de la semana</div>
      {compromisos.length === 0 ? (
        <p className="text-sm text-brand-slate mb-4">Sin compromisos registrados para esta semana.</p>
      ) : (
        <table className="w-full text-sm mb-4">
          {cabecera()}
          <tbody>{compromisos.map((c) => filaCompromiso(c))}</tbody>
        </table>
      )}

      {/* ===== Arrastrados ===== */}
      {arrastrados.length > 0 && (
        <div className="mt-2 rounded-md border border-brand-orange/40 bg-brand-orange/5 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-orange font-bold">Arrastrados de semanas anteriores · {arrastrados.length}</div>
            <span className="text-[11px] text-brand-slate">compromisos de semanas previas que siguen sin cumplirse: se repasan en cada reunión</span>
          </div>
          <table className="w-full text-sm">
            {cabecera(true)}
            <tbody>{arrastrados.map((c) => filaCompromiso(c, true))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
