import { useEffect, useState } from "react";
import type { Client } from "../../shared/api";
import { Empty, ErrorNotice, Icon, Select } from "../../shared/ui";
import type { KnowledgeGap, UsageSummary } from "./dashboard";
import "./Dashboard.css";

export default function UsageDashboard({
  api,
  canTeach,
  onTeach,
}: {
  api: Client;
  canTeach: boolean;
  onTeach: (objective: string) => void;
}) {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gapError, setGapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [table, setTable] = useState(false);
  const [topic, setTopic] = useState("");
  useEffect(() => {
    let active = true;
    api<UsageSummary>(`/usage/summary?days=${days}`)
      .then((data) => {
        if (active) {
          setSummary(data);
          setLoading(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el panel.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, days, attempt]);
  useEffect(() => {
    let active = true;
    api<KnowledgeGap[]>("/chatbot/gaps")
      .then((data) => {
        if (active) {
          setGaps(data);
          setGapError("");
        }
      })
      .catch((e) => {
        if (active)
          setGapError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los vacíos.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, attempt]);
  const questions = (summary?.top_questions ?? []).filter(
    (q) => !topic || q.topic === topic,
  );
  const max = Math.max(1, ...questions.map((q) => q.total));
  const retry = () => {
    setLoading(true);
    setAttempt((a) => a + 1);
  };
  return (
    <div className="usage-view">
      <div className="usage-toolbar">
        <label className="topic-filter">
          <Icon name="book" size={15} />
          <Select
            ariaLabel="Filtrar temas respondidos"
            value={topic}
            onChange={setTopic}
            options={[
              { value: "", label: "Todos los temas respondidos" },
              ...(summary?.top_questions.map((q) => ({
                value: q.topic,
                label: q.topic,
              })) ?? []),
            ]}
          />
        </label>
        <div className="range-switch" aria-label="Periodo de uso">
          {[7, 14, 30].map((range) => (
            <button
              key={range}
              aria-pressed={days === range}
              onClick={() => {
                if (range !== days) {
                  setLoading(true);
                  setDays(range);
                  setTopic("");
                }
              }}
            >
              {range} días
            </button>
          ))}
        </div>
      </div>
      <ErrorNotice error={error} />
      {error && (
        <button className="secondary" onClick={retry}>
          Reintentar carga
        </button>
      )}
      {loading ? (
        <div className="loading" role="status">
          Cargando el panel de uso…
        </div>
      ) : (
        !error &&
        summary && (
          <>
            <section className="usage-metrics" aria-label="Resumen del periodo">
              <article>
                <strong>{summary.questions}</strong>
                <p>preguntas en {days} días</p>
                <small>{summary.answered} con respuesta directa</small>
              </article>
              <article>
                <strong>
                  {Math.max(0, summary.questions - summary.answered)}
                </strong>
                <p>sin respuesta directa</p>
                <small>
                  {summary.coverage === null
                    ? "Sin datos de cobertura"
                    : `${Math.round(summary.coverage * 100)} % de cobertura en el periodo`}
                </small>
              </article>
              <article>
                <strong>{summary.open_gaps}</strong>
                <p>vacíos por resolver</p>
                <small>Pendientes actuales, de todos los periodos</small>
              </article>
            </section>
            <div className="usage-columns">
              <section className="panel usage-topics">
                <header className="section-heading">
                  <div>
                    <h2>Lo más preguntado</h2>
                    <p>
                      Preguntas con respuesta directa en los últimos {days}{" "}
                      días, por tema.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTable(!table)}
                  >
                    {table ? "Ver gráfico" : "Ver tabla"}
                  </button>
                </header>
                <div className="chart-legend">
                  <span />
                  Con respuesta directa
                </div>
                {questions.length ? (
                  table ? (
                    <div className="table-wrap">
                      <table>
                        <caption className="sr-only">
                          Preguntas respondidas por tema
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Tema</th>
                            <th scope="col">Preguntas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questions.map((q) => (
                            <tr key={q.topic}>
                              <td>{q.topic}</td>
                              <td>{q.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="dashboard-bars">
                      {questions.map((q) => (
                        <div className="dashboard-bar-row" key={q.topic}>
                          <div className="dashboard-bar-label">
                            <span>{q.topic}</span>
                            <strong>{q.total}</strong>
                          </div>
                          <div className="dashboard-bar-track">
                            <span
                              style={{ width: `${(q.total / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <Empty
                    title="Todavía no hay preguntas respondidas"
                    icon="chart"
                  >
                    Los temas aparecerán cuando el equipo consulte al asistente.
                  </Empty>
                )}
                <p className="usage-chart-note">
                  Los vacíos de conocimiento muestran qué necesita aprender el
                  equipo. Enseña un proceso y publica su procedimiento para que
                  pueda consultarse.
                </p>
              </section>
              <section className="panel usage-gaps">
                <header className="section-heading">
                  <div>
                    <h2>Vacíos de conocimiento</h2>
                    <p>Lo que nadie ha enseñado todavía.</p>
                  </div>
                </header>
                <ErrorNotice error={gapError} />
                {gapError ? (
                  <button className="secondary" onClick={retry}>
                    Reintentar carga
                  </button>
                ) : (
                  <div className="dashboard-gaps">
                    {gaps.length ? (
                      [...gaps]
                        .sort((a, b) => b.asked_count - a.asked_count)
                        .map((g) => (
                          <article className="dashboard-gap" key={g.id}>
                            <h3>{g.question}</h3>
                            <p>
                              {g.asked_count}{" "}
                              {g.asked_count === 1 ? "pregunta" : "preguntas"} ·
                              sin respaldo publicado
                            </p>
                            {canTeach && (
                              <button
                                className="secondary"
                                onClick={() => onTeach(g.question)}
                              >
                                <Icon name="record" size={15} />
                                Enseñar este proceso
                              </button>
                            )}
                          </article>
                        ))
                    ) : (
                      <Empty title="Sin vacíos abiertos" icon="check">
                        Las preguntas sin respaldo aparecerán aquí.
                      </Empty>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
