"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

/** Registro del trabajo en el Simulador Anual (Televentas Claro): simulaciones
 *  guardadas con nombre y comentario, ítems marcados y post-its. */

export type Marca = { key: string; label: string };
export type Postit = { id?: string; texto: string; color: string; item?: string | null; autor?: string; fecha?: string; x?: number; y?: number };
export type Snapshot = { parametros: any; ventas_por_mes: number[]; horizonte: number; resumen: any };

export const COLORES_POSTIT: Record<string, { label: string; bg: string; border: string }> = {
  amarillo: { label: "Amarillo", bg: "#FEF3C7", border: "#F59E0B" },
  rosa: { label: "Rosa", bg: "#FCE7F3", border: "#EC4899" },
  verde: { label: "Verde", bg: "#DCFCE7", border: "#22C55E" },
  celeste: { label: "Celeste", bg: "#E0F2FE", border: "#0EA5E9" },
};

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY") : "—");

/** Pin para marcar un ítem (KPI, mes, fila del EERR). */
export function Pin({ marcado, onClick, className = "" }: { marcado: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={marcado ? "Quitar marca" : "Marcar este ítem"}
      className={`no-print inline-flex items-center justify-center w-6 h-6 rounded-full text-[13px] leading-none transition-colors ${
        marcado ? "bg-amber-400 text-white shadow" : "bg-white/80 border border-brand-border text-brand-slate opacity-40 hover:opacity-100 hover:border-amber-400 hover:text-amber-500"} ${className}`}>
      📌
    </button>
  );
}

/** Contenedor que agrega el pin y el resaltado a cualquier bloque (ej. un KpiCard). */
export function Marcable({ marcado, onToggle, children }: { marcado: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`relative rounded-md ${marcado ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}>
      {children}
      <div className="absolute top-1.5 right-1.5"><Pin marcado={marcado} onClick={onToggle} /></div>
      {marcado && <span className="print-only absolute top-1 right-2 text-[10px] font-bold text-amber-600">MARCADO</span>}
    </div>
  );
}

export function RegistroSimulaciones({ listo, getSnapshot, onAbrir, actual, setActual, marcas, setMarcas, postits, setPostits }: {
  listo: boolean;                                   // hay simulación en pantalla para guardar
  getSnapshot: () => Snapshot;
  onAbrir: (sim: any) => void;
  actual: any | null;                                // simulación guardada abierta
  setActual: (s: any | null) => void;
  marcas: Marca[]; setMarcas: (m: Marca[]) => void;
  postits: Postit[]; setPostits: (p: Postit[]) => void;
}) {
  const [lista, setLista] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // formulario guardar / editar nombre
  const [form, setForm] = useState<null | "nueva" | "editar">(null);
  const [nombre, setNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  // post-it nuevo
  const [piTexto, setPiTexto] = useState("");
  const [piColor, setPiColor] = useState("amarillo");
  const [piItem, setPiItem] = useState("");
  const skipSync = useRef(false);

  const cargarLista = () => apiFetch<any>("/api/v1/facturacion/simulaciones").then((d) => setLista(d.simulaciones ?? [])).catch(() => setLista([]));
  useEffect(() => { cargarLista(); }, []);

  const aviso = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };
  const run = async (fn: () => Promise<any>, exito?: string) => {
    setError(null);
    try { const r = await fn(); if (exito) aviso(exito); return r; } catch (e: any) { setError(e.message || "No se pudo guardar."); return null; }
  };

  // Marcas y post-its de una simulación abierta se persisten solos.
  useEffect(() => {
    if (!actual) { skipSync.current = false; return; }
    if (skipSync.current) { skipSync.current = false; return; }
    const t = setTimeout(() => {
      apiFetch<any>(`/api/v1/facturacion/simulaciones/${actual.id}`, { method: "PATCH", body: JSON.stringify({ marcas, postits }) })
        .then((s) => {
          // Solo reasignar si el servidor firmó post-its nuevos (id/autor/fecha); si no, evitamos re-disparar el efecto.
          if (JSON.stringify(s.postits ?? []) !== JSON.stringify(postits)) { skipSync.current = true; setPostits(s.postits ?? []); }
          setActual({ ...actual, marcas: s.marcas, postits: s.postits, updated_at: s.updated_at, updated_by_nombre: s.updated_by_nombre });
          cargarLista();
        })
        .catch((e) => setError(e.message));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, postits]);

  const abrir = async (id: string) => {
    const s = await run(() => apiFetch<any>(`/api/v1/facturacion/simulaciones/${id}`));
    if (!s) return;
    skipSync.current = true;
    onAbrir(s);
    setActual(s);
    setForm(null);
    aviso(`Simulación "${s.nombre}" abierta.`);
  };

  const cerrar = () => { skipSync.current = true; setActual(null); setMarcas([]); setPostits([]); setForm(null); };

  const guardarNueva = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    const snap = getSnapshot();
    const s = await run(() => apiFetch<any>("/api/v1/facturacion/simulaciones", {
      method: "POST", body: JSON.stringify({ nombre: nombre.trim(), comentario: comentario.trim() || null, ...snap, marcas, postits }),
    }), "Simulación guardada.");
    setGuardando(false);
    if (!s) return;
    skipSync.current = true;
    setActual(s); setPostits(s.postits ?? []); setForm(null); cargarLista();
  };

  const guardarCambios = async () => {
    if (!actual) return;
    setGuardando(true);
    const s = await run(() => apiFetch<any>(`/api/v1/facturacion/simulaciones/${actual.id}`, {
      method: "PATCH", body: JSON.stringify({ ...getSnapshot(), marcas, postits }),
    }), "Cambios guardados.");
    setGuardando(false);
    if (s) { setActual(s); cargarLista(); }
  };

  const guardarNombre = async () => {
    if (!actual || !nombre.trim()) return;
    const s = await run(() => apiFetch<any>(`/api/v1/facturacion/simulaciones/${actual.id}`, {
      method: "PATCH", body: JSON.stringify({ nombre: nombre.trim(), comentario: comentario.trim() }),
    }), "Nombre y comentario actualizados.");
    if (s) { setActual(s); setForm(null); cargarLista(); }
  };

  const eliminar = async (s: any) => {
    if (!window.confirm(`¿Eliminar la simulación "${s.nombre}"?\n\nSe borran también sus marcas y post-its. Queda en la auditoría.`)) return;
    const r = await run(() => apiFetch<any>(`/api/v1/facturacion/simulaciones/${s.id}`, { method: "DELETE" }), "Simulación eliminada.");
    if (r) { if (actual?.id === s.id) cerrar(); cargarLista(); }
  };

  const agregarPostit = () => {
    if (!piTexto.trim()) return;
    // Nace en el lienzo, escalonado para que no se tapen; después se arrastra a donde haga falta.
    const n = postits.length;
    setPostits([...postits, { texto: piTexto.trim(), color: piColor, item: piItem || null, x: 24 + (n % 6) * 36, y: 150 + (n % 6) * 28 }]);
    setPiTexto(""); setPiItem("");
  };
  const quitarPostit = (i: number) => setPostits(postits.filter((_, j) => j !== i));
  const quitarMarca = (key: string) => setMarcas(marcas.filter((m) => m.key !== key));

  const snap = listo ? getSnapshot() : null;
  const sinGuardar = !!actual && !!snap && (
    JSON.stringify(snap.parametros) !== JSON.stringify(actual.parametros)
    || JSON.stringify(snap.ventas_por_mes) !== JSON.stringify(actual.ventas_por_mes)
    || snap.horizonte !== actual.horizonte);

  const abrirForm = (tipo: "nueva" | "editar") => {
    setNombre(tipo === "editar" && actual ? actual.nombre : "");
    setComentario(tipo === "editar" && actual ? (actual.comentario ?? "") : "");
    setForm(tipo);
  };

  return (
    <section className="card mb-6 overflow-hidden">
      {/* ===== Cabecera ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-brand-ink text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => setAbierto(!abierto)} className="no-print text-white/70 hover:text-white text-xs">{abierto ? "▾" : "▸"}</button>
          <div>
            <div className="text-[10px] uppercase tracking-wider2 font-bold text-white/70">Registro del trabajo</div>
            <div className="font-display text-lg uppercase leading-tight">
              {actual ? actual.nombre : "Simulación sin guardar"}
              {sinGuardar && <span className="ml-2 text-[10px] font-sans font-bold px-1.5 py-0.5 rounded bg-brand-orange text-white align-middle">cambios sin guardar</span>}
            </div>
            {actual && (
              <div className="text-[11px] text-white/70">
                Guardada por {actual.created_by_nombre || "—"} el {fecha(actual.created_at)}
                {actual.updated_at && <> · última edición {fecha(actual.updated_at)}{actual.updated_by_nombre ? ` por ${actual.updated_by_nombre}` : ""}</>}
                {" "}· {actual.horizonte} meses · {marcas.length} marcados · {postits.length} post-its
              </div>
            )}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {ok && <span className="text-[11px] text-emerald-300 font-semibold">{ok}</span>}
          {actual ? (
            <>
              <button onClick={guardarCambios} disabled={guardando || !listo} className={`px-3 py-1.5 rounded text-xs font-bold disabled:opacity-40 ${sinGuardar ? "bg-brand-orange text-white" : "bg-white/15 text-white hover:bg-white/25"}`}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              <button onClick={() => abrirForm("nueva")} disabled={!listo} className="px-3 py-1.5 rounded text-xs font-bold bg-white/15 text-white hover:bg-white/25 disabled:opacity-40">Guardar como nueva</button>
              <button onClick={() => abrirForm("editar")} className="px-3 py-1.5 rounded text-xs font-bold bg-white/15 text-white hover:bg-white/25">Editar nombre / comentario</button>
              <button onClick={() => eliminar(actual)} className="px-3 py-1.5 rounded text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary/90">Eliminar</button>
              <button onClick={cerrar} className="px-2 py-1.5 text-xs text-white/70 hover:text-white">Cerrar</button>
            </>
          ) : (
            <button onClick={() => abrirForm("nueva")} disabled={!listo} title={listo ? "" : "Seteá el mes 1 para poder guardar"}
              className="px-4 py-1.5 rounded text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40">
              Guardar simulación
            </button>
          )}
        </div>
      </div>

      {error && <div className="mx-5 mt-3 text-xs text-brand-primary bg-brand-primary/5 border border-brand-primary/30 rounded px-3 py-2 no-print">{error}</div>}

      {/* ===== Formulario nombre / comentario ===== */}
      {form && (
        <div className="no-print mx-5 mt-4 rounded-md border-2 border-brand-primary bg-brand-primary/5 p-4">
          <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-primary mb-2">{form === "nueva" ? "Guardar simulación" : "Editar nombre y comentario"}</div>
          <div className="grid md:grid-cols-[1fr_2fr_auto] gap-2 items-start">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder='Nombre. Ej.: "Escenario base 1.700 · ajuste 5%"' className="input !py-1.5 text-sm" />
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} placeholder="Comentario: qué se probó, qué supuestos, para quién" className="input !py-1.5 text-sm" />
            <div className="flex gap-2">
              <button onClick={form === "nueva" ? guardarNueva : guardarNombre} disabled={guardando || !nombre.trim()} className="btn-primary !py-1.5 !px-4 text-sm disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button onClick={() => setForm(null)} className="text-sm text-brand-slate hover:text-brand-ink px-2">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {abierto && (
        <div className="p-5 space-y-5">
          {/* ===== Comentario de la simulación abierta ===== */}
          {actual?.comentario && (
            <div className="rounded-md border-l-4 border-brand-ink bg-brand-bg-soft px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Comentario</div>
              <p className="text-sm text-brand-ink leading-relaxed whitespace-pre-line">{actual.comentario}</p>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* ===== Ítems marcados ===== */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Ítems marcados · {marcas.length}</div>
                <span className="text-[11px] text-brand-slate no-print">usá el 📌 sobre los cuadros, los meses o las filas del EERR</span>
              </div>
              {marcas.length === 0 ? (
                <p className="text-sm text-brand-slate">Nada marcado todavía.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {marcas.map((m) => (
                    <li key={m.key} className="flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold pl-2.5 pr-1 py-0.5">
                      📌 {m.label}
                      <button onClick={() => quitarMarca(m.key)} className="no-print ml-1 w-4 h-4 rounded-full hover:bg-amber-300 text-[10px]" title="Quitar marca">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ===== Post-its ===== */}
            <div>
              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Post-its · {postits.length}</div>
              <div className="no-print flex flex-wrap gap-2 items-start mb-3">
                <textarea value={piTexto} onChange={(e) => setPiTexto(e.target.value)} rows={2} placeholder="Comentario suelto: una duda, una idea, algo para revisar con Claro…" className="input !py-1.5 text-sm flex-1 min-w-[220px]" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1">
                    {Object.entries(COLORES_POSTIT).map(([k, c]) => (
                      <button key={k} onClick={() => setPiColor(k)} title={c.label} className={`w-6 h-6 rounded border-2 ${piColor === k ? "border-brand-ink scale-110" : "border-transparent"}`} style={{ background: c.bg }} />
                    ))}
                  </div>
                  <select value={piItem} onChange={(e) => setPiItem(e.target.value)} className="text-[11px] border border-brand-border rounded px-2 py-1 bg-white max-w-[180px]">
                    <option value="">Sin ítem asociado</option>
                    {marcas.map((m) => <option key={m.key} value={m.key}>Sobre: {m.label}</option>)}
                  </select>
                  <button onClick={agregarPostit} disabled={!piTexto.trim()} className="btn-primary !py-1 !px-3 text-xs disabled:opacity-50">Pegar post-it</button>
                </div>
              </div>
              {postits.length === 0 ? (
                <p className="text-sm text-brand-slate">Sin post-its. Los que pegues quedan flotando sobre el lienzo: arrastralos desde su franja de color y soltalos donde quieras.</p>
              ) : (
                <ul className="space-y-1">
                  {postits.map((pi, i) => {
                    const c = COLORES_POSTIT[pi.color] ?? COLORES_POSTIT.amarillo;
                    return (
                      <li key={pi.id ?? i} className="flex items-start gap-2 text-[12px] text-brand-ink">
                        <span className="mt-1 w-3 h-3 rounded-sm shrink-0" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
                        <span className="flex-1 line-clamp-2">{pi.texto}</span>
                        <button onClick={() => quitarPostit(i)} className="no-print text-[11px] text-brand-slate hover:text-brand-primary" title="Quitar post-it">✕</button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!actual && postits.length + marcas.length > 0 && (
                <p className="no-print text-[11px] text-brand-orange mt-2">Las marcas y los post-its quedan guardados al guardar la simulación.</p>
              )}
            </div>
          </div>

          {/* ===== Simulaciones guardadas ===== */}
          <div className="no-print">
            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Simulaciones guardadas · {lista.length}</div>
            {lista.length === 0 ? (
              <p className="text-sm text-brand-slate">Todavía no hay simulaciones guardadas. Seteá el mes 1, cargá las ventas y usá "Guardar simulación".</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-brand-bg text-[9px] uppercase tracking-wider2 text-brand-slate">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Nombre</th>
                    <th className="px-3 py-1.5 text-right">Horizonte</th>
                    <th className="px-3 py-1.5 text-right">Ventas</th>
                    <th className="px-3 py-1.5 text-right">Resultado final</th>
                    <th className="px-3 py-1.5 text-center">Marcas / post-its</th>
                    <th className="px-3 py-1.5 text-right">Guardada</th>
                    <th className="px-3 py-1.5 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((s) => {
                    const r = s.resumen || {};
                    const fin = r.resultado_con_cola ?? r.resultado;
                    return (
                      <tr key={s.id} className={`border-t border-brand-border ${actual?.id === s.id ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-1.5">
                          <div className="font-semibold text-brand-ink">{s.nombre}</div>
                          {s.comentario && <div className="text-[11px] text-brand-slate line-clamp-1">{s.comentario}</div>}
                        </td>
                        <td className="px-3 py-1.5 text-right">{s.horizonte} m</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.ventas != null ? formatInt(r.ventas) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${fin != null && fin < 0 ? "text-brand-primary" : "text-emerald-700"}`}>{fin != null ? formatGs(fin) : "—"}</td>
                        <td className="px-3 py-1.5 text-center text-brand-slate">{(s.marcas ?? []).length} / {(s.postits ?? []).length}</td>
                        <td className="px-3 py-1.5 text-right text-brand-slate whitespace-nowrap">{fecha(s.created_at)}<div className="text-[10px]">{s.created_by_nombre}</div></td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <button onClick={() => abrir(s.id)} className="font-semibold text-brand-ink hover:text-brand-primary hover:underline mr-3">Abrir</button>
                          <button onClick={() => eliminar(s)} className="font-semibold text-brand-primary hover:underline">Eliminar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
