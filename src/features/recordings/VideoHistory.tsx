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
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const results: { session: Session; video: Recording }[] = [];
      let failures = 0;
      // Bound concurrency until the API offers an organization-wide paginated history.
      for (let offset = 0; offset < sessions.length && active; offset += 4) {
        const batch = sessions.slice(offset, offset + 4);
        const responses = await Promise.allSettled(
          batch.map((session) =>
            api<Recording[]>(`/learning-sessions/${session.id}/recordings`),
          ),
        );
        responses.forEach((response, index) => {
          if (response.status === "fulfilled")
            results.push(
              ...response.value.map((video) => ({
                session: batch[index],
                video,
              })),
            );
          else failures++;
        });
      }
      if (active) {
        setItems(
          results.sort((a, b) =>
            b.video.created_at.localeCompare(a.video.created_at),
          ),
        );
        setFailed(failures);
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, sessions, refresh]);
  const filtered = items.filter(({ session }) =>
    `${session.objective} ${session.application_name}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
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
          onClick={() => setRefresh((key) => key + 1)}
        >
          Actualizar
        </button>
      </div>
      <label>
        Buscar por proceso o aplicación
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en el historial"
        />
      </label>
      {loading ? (
        <p role="status">Consultando videos…</p>
      ) : (
        <>
          {failed > 0 && (
            <p role="alert" className="info">
              No se pudieron consultar {failed} sesiones. El historial está
              incompleto; puedes reintentar.
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
          {!filtered.length && (
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
