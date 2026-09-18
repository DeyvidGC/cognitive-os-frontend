import { useEffect, useState } from "react";
import type { Client, Session } from "../../shared/api";
import type { Recording } from "./recordings";
import { Badge } from "../../shared/ui";
import { date } from "../../shared/utils";

export default function VideoHistory({
  api,
  sessions,
  onOpen,
}: {
  api: Client;
  sessions: Session[];
  onOpen: (session: Session) => void;
}) {
  const [items, setItems] = useState<{ session: Session; video: Recording }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "25", query });
    if (cursor) params.set("cursor", cursor);
    const timer = setTimeout(() => {
      setLoading(true);
      api<{ items: (Recording & { session: Session })[]; next_cursor: string | null }>(`/recordings?${params}`, { signal: controller.signal })
        .then((page) => {
          if (!active) return;
          const rows = page.items.map((video) => ({ session: video.session, video }));
          setItems((previous) => cursor ? [...previous, ...rows.filter((row) => !previous.some((p) => p.video.id === row.video.id))] : rows);
          setNextCursor(page.next_cursor);
          setFailed(0);
        })
        .catch(() => { if (active) setFailed(1); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [api, sessions, refresh, query, cursor]);
  const filtered = items;
  return (
    <section className="panel video-history">
      <div className="section-heading">
        <div>
          <h2>Historial de videos</h2>
          <p>
            Cada sesión conserva su video y su aprendizaje. Agrega nuevas
            sesiones para actualizar la información con el tiempo.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => { setCursor(null); setRefresh((key) => key + 1); }}
        >
          Actualizar
        </button>
      </div>
      <label>
        Buscar por proceso o aplicación
        <input
          value={query}
          onChange={(event) => { setCursor(null); setItems([]); setQuery(event.target.value); }}
          placeholder="Buscar en el historial"
        />
      </label>
      {loading ? (
        <p role="status">Consultando videos…</p>
      ) : (
        <>
          {failed > 0 && (
            <p role="alert" className="info">
              No se pudo consultar el historial. Puedes reintentar con Actualizar.
            </p>
          )}
          <div className="video-history-grid">
            {filtered.map(({ session, video }) => (
              <button
                type="button"
                className="video-history-card"
                key={video.id}
                onClick={() => onOpen(session)}
              >
                <span className="video-history-symbol" aria-hidden="true">
                  ▶
                </span>
                <strong>{session.objective}</strong>
                <span>{session.application_name}</span>
                <small>
                  {date(video.created_at)} ·{" "}
                  {(video.size_bytes / 1048576).toFixed(1)} MB
                </small>
                <Badge status={video.status} />
                <span className="text-button">Abrir video y aprendizaje →</span>
              </button>
            ))}
          </div>
          {nextCursor && <button type="button" className="secondary" disabled={loading} onClick={() => setCursor(nextCursor)}>Cargar más videos</button>}
          {!filtered.length && !failed && (
            <p>
              {query
                ? "No hay videos que coincidan con tu búsqueda."
                : "Los videos que guardes en tus sesiones aparecerán aquí."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
