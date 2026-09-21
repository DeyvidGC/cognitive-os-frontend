import { useEffect, useState } from "react";
import type { Client, Session } from "../../shared/api";
import { Empty, ErrorNotice, Icon } from "../../shared/ui";
import { date, nextStepLabel } from "../../shared/utils";
import type { HomeSummary, KnowledgeGap } from "./dashboard";
import { pendingSessions } from "./pendingSessions";
import HomeActivity from "./HomeActivity";
import "./Dashboard.css";

const states: Record<string, { label: string; detail: string }> = {
  ready: {
    label: "Requiere revisión",
    detail:
      "Revisar el aprendizaje y resolver las aclaraciones antes de aprobar.",
  },
  completed: {
    label: "Requiere revisión",
    detail: "Consultar el aprendizaje y comprobar qué falta por documentar.",
  },
  capturing: {
    label: "En captura",
    detail: "Terminar la captura y guardar el video antes de salir.",
  },
  uploading: {
    label: "Subida pendiente",
    detail: "Continuar la subida del video para poder analizarlo.",
  },
  uploaded: {
    label: "Video guardado",
    detail: "Abrir la sesión para consultar el estado del análisis.",
  },
  failed: {
    label: "Necesita atención",
    detail: "Revisar el error y volver a intentar el procesamiento.",
  },
};
export default function Home({
  api,
  sessions,
  reader,
  canWrite,
  onOpen,
  onTeach,
  onLibrary,
}: {
  api: Client;
  sessions: Session[];
  reader: boolean;
  canWrite: boolean;
  onOpen: (session: Session) => void;
  onTeach: (objective: string) => void;
  onLibrary: () => void;
}) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (reader) return;
    let active = true;
    Promise.all([
      api<HomeSummary>("/dashboard/home"),
      api<KnowledgeGap[]>("/chatbot/gaps"),
    ])
      .then(([home, items]) => {
        if (active) {
          setSummary(home);
          setGaps(items);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar la actividad.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, reader, attempt]);
  const pending = pendingSessions(sessions);
  const gap = [...gaps].sort((a, b) => b.asked_count - a.asked_count)[0];
  if (reader)
    return (
      <section className="panel reader-welcome">
        <h2>El conocimiento de tu equipo</h2>
        <p>
          Consulta los procedimientos disponibles y encuentra cómo hacer tu
          trabajo.
        </p>
        <button className="primary" onClick={onLibrary}>
          Explorar biblioteca <Icon name="arrow" size={16} />
        </button>
      </section>
    );
  return (
    <div className="home-work-grid">
      <section className="pending-work">
        <h2>Tu trabajo pendiente</h2>
        {pending.length ? (
          pending.map((session, index) => (
            <article
              className={`work-card work-${session.status}`}
              key={session.id}
            >
              <div className="work-meta">
                <span className="work-status">
                  {states[session.status].label}
                </span>
                <time dateTime={session.created_at}>
                  {date(session.created_at)}
                </time>
              </div>
              <h3>{session.objective}</h3>
              <p>Siguiente paso: {states[session.status].detail}</p>
              <button
                className={index === 0 ? "primary" : "secondary"}
                onClick={() => onOpen(session)}
              >
                {nextStepLabel(session.status)}
                <Icon name="arrow" size={15} />
              </button>
            </article>
          ))
        ) : (
          <div className="panel">
            <Empty title="Estás al día" icon="check">
              No tienes sesiones pendientes de acción. Puedes enseñar un nuevo
              proceso al equipo.
            </Empty>
          </div>
        )}
      </section>
      <aside className="home-context">
        <section className="learning-note">
          <h2>
            <Icon name="spark" size={15} /> Oportunidades para aprender
          </h2>
          <ErrorNotice error={error} />
          {error ? (
            <button
              className="text-button"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Reintentar carga
            </button>
          ) : !summary ? (
            <p role="status">Consultando las preguntas del equipo…</p>
          ) : gap ? (
            <>
              <p>
                El equipo preguntó sobre <strong>{gap.question}</strong> y
                todavía no hay respaldo publicado para responder.
              </p>
              <footer>
                <span>
                  {gap.asked_count}{" "}
                  {gap.asked_count === 1
                    ? "pregunta sin respaldo"
                    : "preguntas sin respaldo"}
                </span>
                {canWrite && (
                  <button
                    className="text-button"
                    onClick={() => onTeach(gap.question)}
                  >
                    Enseñar ese proceso <Icon name="arrow" size={14} />
                  </button>
                )}
              </footer>
            </>
          ) : (
            <p>
              No hay vacíos de conocimiento abiertos. Las nuevas preguntas sin
              respaldo aparecerán aquí.
            </p>
          )}
        </section>
        {summary && <HomeActivity summary={summary} />}
      </aside>
    </div>
  );
}
