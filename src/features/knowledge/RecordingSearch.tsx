import { useState } from "react";
import { json } from "../../shared/api";
import type { Client, Procedure, Result } from "../../shared/api";
import { Empty, ErrorNotice, Icon } from "../../shared/ui";
import { useAction } from "../../shared/utils";

type VideoHit = {
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
type SearchItem = {
  key: string;
  type: "video" | "procedure";
  title: string;
  snippet: string;
  meta: string;
  open: () => Promise<void>;
};
const EXAMPLES = [
  "crear una cotización",
  "emitir una póliza",
  "actualizar datos del cliente",
  "cerrar una sesión de aprendizaje",
];
const RECENT_KEY = "cognitive-os:recent-searches";

export default function RecordingSearch({
  api,
  procedures,
  onOpenSession,
  onOpenProcedure,
}: {
  api: Client;
  procedures: Procedure[];
  onOpenSession: (id: string) => Promise<void>;
  onOpenProcedure: (procedureId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(stored) ? stored.slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const { run, busy, error } = useAction();
  function remember(text: string) {
    setRecent((prev) => {
      const next = [text, ...prev.filter((q) => q !== text)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible */
      }
      return next;
    });
  }
  async function search(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    await run(async () => {
      setItems(null);
      const [videos, procedureHits] = await Promise.all([
        api<{ results: VideoHit[] }>(
          "/recordings/search",
          json({ query: trimmed, limit: 12 }),
        ).catch(() => ({ results: [] as VideoHit[] })),
        api<Result[]>(
          `/knowledge/search?q=${encodeURIComponent(trimmed)}&limit=12`,
        ).catch(() => [] as Result[]),
      ]);
      const videoItems: SearchItem[] = videos.results.map((hit) => ({
        key: `video-${hit.id}`,
        type: "video",
        title:
          hit.source.step != null
            ? `Paso ${hit.source.step} de un procedimiento`
            : "Fragmento de una sesión analizada",
        snippet: hit.content,
        meta: `Revisión ${hit.report_revision} · similitud ${Number(hit.score).toFixed(2)}`,
        open: () => onOpenSession(hit.session_id),
      }));
      const procedureItems: SearchItem[] = procedureHits.map((r) => ({
        key: `procedure-${r.id}`,
        type: "procedure",
        title: `${procedures.find((p) => p.id === r.procedure_id)?.title || "Procedimiento publicado"} · v${r.version_number}`,
        snippet: r.content,
        meta: "Contenido publicado",
        open: () =>
          Promise.resolve(
            procedures.some((p) => p.id === r.procedure_id)
              ? onOpenProcedure(r.procedure_id)
              : undefined,
          ),
      }));
      setItems([...videoItems, ...procedureItems]);
      remember(trimmed);
    });
  }
  return (
    <section className="panel search-hub">
      <div className="search-hub-head">
        <span className="search-symbol">
          <Icon name="search" size={30} />
        </span>
        <h2>¿Qué quieres encontrar?</h2>
        <p>
          Busca por palabras clave en los videos analizados y en los
          procedimientos publicados de tu equipo, en un solo lugar.
        </p>
      </div>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <input
          aria-label="Buscar conocimiento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
          maxLength={500}
          placeholder="Por ejemplo: crear una cotización"
        />
        <button className="primary" disabled={busy || !query.trim()}>
          {busy ? "Buscando…" : "Buscar"}
          <Icon name="arrow" size={18} />
        </button>
      </form>
      <div className="search-chips">
        {EXAMPLES.map((example) => (
          <button
            type="button"
            key={example}
            className="chip"
            disabled={busy}
            onClick={() => void search(example)}
          >
            {example}
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="search-chips search-chips-recent">
          <span className="search-chips-label">Recientes</span>
          {recent.map((text) => (
            <button
              type="button"
              key={text}
              className="chip ghost"
              disabled={busy}
              onClick={() => void search(text)}
            >
              <Icon name="clock" size={12} />
              {text}
            </button>
          ))}
        </div>
      )}
      <ErrorNotice error={error} />
      {items && (
        <div className="search-results enriched">
          <small>{items.length} resultados</small>
          {items.map((item) => (
            <article key={item.key} className="search-result-card">
              <span className={`search-result-icon ${item.type}`}>
                <Icon name={item.type === "video" ? "video" : "book"} size={17} />
              </span>
              <div>
                <div className="search-result-meta">
                  <span className={`search-tag ${item.type}`}>
                    {item.type === "video" ? "Video analizado" : "Procedimiento"}
                  </span>
                  <span>{item.meta}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.snippet}</p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void run(item.open)}
                >
                  {item.type === "video" ? "Ver momento" : "Abrir procedimiento"}{" "}
                  →
                </button>
              </div>
            </article>
          ))}
          {!items.length && (
            <Empty title="Todavía no hay coincidencias">
              Prueba con otras palabras o publica un procedimiento para
              hacerlo consultable.
            </Empty>
          )}
        </div>
      )}
      <small className="search-hub-foot">
        La similitud ordena coincidencias; no representa certeza ni una
        respuesta del agente. Cuando un video nuevo actualiza el mismo
        procedimiento, la información desactualizada se retira sola de estos
        resultados.
      </small>
    </section>
  );
}
