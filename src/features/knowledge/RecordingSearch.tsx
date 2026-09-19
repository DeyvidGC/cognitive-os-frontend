import { useState } from "react";
import { json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { ErrorNotice } from "../../shared/ui";
import { useAction } from "../../shared/utils";
type Hit = {
  id: string;
  recording_id: string;
  session_id: string;
  report_revision: number;
  content: string;
  score: number;
  source: {
    kind: string;
    step?: number;
    frame_indices?: number[];
    text_sources?: string[];
  };
};
export default function RecordingSearch({
  api,
  onOpen,
}: {
  api: Client;
  onOpen: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const { run, busy, error } = useAction();
  return (
    <section className="panel insight-panel">
      <h2>Buscar en videos aprobados</h2>
      <p>Encuentra fragmentos del informe y consulta su grabación de origen.</p>
      <ErrorNotice error={error} />
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            setHits(null);
            const result = await api<{ results: Hit[] }>(
              "/recordings/search",
              json({ query: query.trim(), limit: 20 }),
            );
            setHits(result.results);
          });
        }}
      >
        <input
          aria-label="Buscar en grabaciones"
          value={query}
          maxLength={1200}
          required
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Describe el proceso que quieres encontrar"
        />
        <button className="primary" disabled={busy || !query.trim()}>
          Buscar videos
        </button>
      </form>
      <div className="search-results">
        {hits?.map((hit) => (
          <article key={hit.id}>
            <small>
              Revisión {hit.report_revision} · {hit.source.kind}
              {hit.source.step ? ` · Paso ${hit.source.step}` : ""}
            </small>
            <p>{hit.content}</p>
            <p>
              Fuentes: {hit.source.text_sources?.join(", ") || "Video"} ·
              Similitud: {Number(hit.score).toFixed(3)}
            </p>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void run(() => onOpen(hit.session_id))}
            >
              Abrir sesión y video de origen →
            </button>
          </article>
        ))}
      </div>
      {hits?.length === 0 && (
        <p>No hay coincidencias en los videos aprobados e indexados.</p>
      )}
      <small>
        La similitud ordena coincidencias; no representa certeza ni una
        respuesta del agente. Cuando un video nuevo actualiza el mismo
        procedimiento, la información desactualizada se retira sola de estos
        resultados.
      </small>
    </section>
  );
}
