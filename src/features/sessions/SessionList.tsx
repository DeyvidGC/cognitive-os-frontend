import { useState } from "react";
import type { Client, Session } from "../../shared/api";
import { Empty, Icon, Select } from "../../shared/ui";
import { date } from "../../shared/utils";
import VideoHistory from "../recordings/VideoHistory";
import "./Sessions.css";

const states: Record<string, { label: string; next: string; action: string; tone: string }> = {
  capturing: { label: "En captura", next: "Terminar y guardar el video", action: "Continuar", tone: "green" },
  completed: { label: "Requiere revisión", next: "Revisar el aprendizaje y sus aclaraciones", action: "Revisar", tone: "amber" },
  ready: { label: "Requiere revisión", next: "Revisar el aprendizaje y sus aclaraciones", action: "Revisar", tone: "amber" },
  failed: { label: "No se pudo procesar", next: "Revisar el error y reintentar el análisis", action: "Revisar error", tone: "red" },
  processing: { label: "Procesando", next: "Nada por ahora · análisis en curso", action: "Ver", tone: "neutral" },
  queued: { label: "En cola", next: "Nada por ahora · esperando el análisis", action: "Ver", tone: "neutral" },
  uploading: { label: "Subida pendiente", next: "Continuar la subida del video", action: "Continuar", tone: "amber" },
  uploaded: { label: "Video guardado", next: "Iniciar el análisis del video", action: "Continuar", tone: "green" },
};
export default function SessionList({ api, sessions, onOpen }: { api: Client; sessions: Session[]; onOpen: (session: Session) => void }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [app, setApp] = useState("");
  const [range, setRange] = useState(0);
  const [showVideos, setShowVideos] = useState(false);
  const [now] = useState(() => Date.now());
  const filtered = sessions.filter(s => `${s.objective} ${s.application_name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!state || (state === "review" ? ["ready", "completed"].includes(s.status) : s.status === state)) && (!app || s.application_name === app) && (!range || new Date(s.created_at).getTime() >= now - range * 86400000));
  const hasFilters = !!(query || state || app || range);
  return <div className="session-list-view">
    <div className="session-filters"><label className="session-search"><Icon name="search" size={17} /><input aria-label="Buscar una sesión" placeholder="Buscar una sesión" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <Select ariaLabel="Estado" value={state} onChange={setState} options={[{ value: "", label: "Estado · todos" }, { value: "review", label: "Requiere revisión" }, ...Object.entries(states).filter(([key]) => !["ready", "completed"].includes(key)).map(([key, value]) => ({ value: key, label: value.label }))]} />
      <Select ariaLabel="Aplicación" value={app} onChange={setApp} options={[{ value: "", label: "Aplicación · todas" }, ...[...new Set(sessions.map(s => s.application_name))].sort().map(a => ({ value: a, label: a }))]} />
      <Select ariaLabel="Fecha de creación" value={String(range)} onChange={v => setRange(Number(v))} options={[{ value: "0", label: "Fecha · todas" }, { value: "7", label: "Últimos 7 días" }, { value: "30", label: "Últimos 30 días" }, { value: "90", label: "Últimos 90 días" }]} />
      {hasFilters && <button className="text-button" onClick={() => { setQuery(""); setState(""); setApp(""); setRange(0); }}>Limpiar</button>}<span className="session-result-count" role="status">{filtered.length} {filtered.length === 1 ? "sesión" : "sesiones"}</span>
    </div>
    <section className="panel session-table"><div className="table-wrap"><table><thead><tr><th scope="col">Sesión / objetivo</th><th scope="col">Estado</th><th scope="col">Siguiente paso</th><th scope="col">Creada</th><th scope="col"><span className="visually-hidden">Acción</span></th></tr></thead><tbody>{filtered.map(s => {
      const state = states[s.status] || { label: s.status, next: "Consultar la sesión", action: "Ver", tone: "neutral" };
      return <tr key={s.id}><td><button className="session-title-link" onClick={() => onOpen(s)}>{s.objective}</button><small className="session-app">{s.application_name}</small></td><td><span className={`session-state ${state.tone}`}>{state.label}</span></td><td className="session-next">{state.next}</td><td className="session-date">{date(s.created_at)}</td><td><button className="secondary" aria-label={`${state.action}: ${s.objective}`} onClick={() => onOpen(s)}>{state.action}</button></td></tr>;
    })}</tbody></table></div>{!filtered.length && <Empty title={hasFilters ? "No encontramos esa sesión" : "Tu primera sesión empieza aquí"}>{hasFilters ? "Prueba otros filtros o limpia la búsqueda." : "Crea una nueva sesión para compartir un proceso con tu equipo."}</Empty>}</section>
    <details className="session-video-history" onToggle={e => setShowVideos(e.currentTarget.open)}><summary>Historial de videos guardados</summary>{showVideos && <VideoHistory api={api} sessions={sessions} onOpen={onOpen} />}</details>
  </div>;
}
