import { useCallback, useEffect, useRef, useState } from "react";
import type { Client } from "../../shared/api";
import { useAction } from "../../shared/utils";
import { Empty, ErrorNotice } from "../../shared/ui";
import type { KnowledgeGap, UsageSummary } from "./dashboard";
import "./Dashboard.css";

const weekday = new Intl.DateTimeFormat("es-CO", { weekday: "short" });

export default function UsageDashboard({
  api,
  canResolveGaps,
}: {
  api: Client;
  canResolveGaps: boolean;
}) {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useAction();
  // Split so the days filter only ever re-fetches the summary: the gap list
  // doesn't take a `days` param and shouldn't be re-requested on every change.
  const loadSummary = useCallback(
    async () => setSummary(await api<UsageSummary>(`/usage/summary?days=${days}`)),
    [api, days],
  );
  const loadGaps = useCallback(
    async () => setGaps(await api<KnowledgeGap[]>("/chatbot/gaps")),
    [api],
  );
  const load = useCallback(async () => {
    await Promise.all([loadSummary(), loadGaps()]);
    setLoading(false);
  }, [loadSummary, loadGaps]);
  useEffect(() => {
    void run(load);
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstRange = useRef(true);
  useEffect(() => {
    if (firstRange.current) {
      firstRange.current = false;
      return;
    }
    // A range change should show its own loading state, not the stale summary.
    setLoading(true);
    void run(async () => {
      await loadSummary();
      setLoading(false);
    });
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxTop =
    Math.max(0, ...(summary?.top_questions.map((q) => q.total) ?? [0])) || 1;
  const maxDay =
    Math.max(0, ...(summary?.per_day.map((d) => d.total) ?? [0])) || 1;
  return (
    <>
      <ErrorNotice error={error} />
      {error && loading && (
        <button className="secondary" onClick={() => void run(load)}>
          Reintentar carga
        </button>
      )}
      {loading ? (
        <div className="loading" role="status">
          Cargando el dashboard…
        </div>
      ) : (
        summary && (
          <>
            <section className="stats">
              <article className="stat">
                <p>Preguntas ({days} días)</p>
                <strong>{summary.questions}</strong>
                <small>{summary.answered} con respuesta directa</small>
              </article>
              <article className="stat">
                <p>Con respuesta directa</p>
                <strong>
                  {summary.coverage === null
                    ? "—"
                    : `${Math.round(summary.coverage * 100)}%`}
                </strong>
                <small>Del total de preguntas del rango</small>
              </article>
              <article className={summary.open_gaps > 0 ? "stat attention" : "stat"}>
                <p>Vacíos activos</p>
                <strong>{summary.open_gaps}</strong>
                <small>Sin respaldo publicado</small>
              </article>
              <article className="stat">
                <p>Respondidas hoy</p>
                <strong>{summary.answered_today}</strong>
                <small>Desde la medianoche</small>
              </article>
            </section>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Lo más preguntado</h2>
                    <p>Temas con respuesta directa, agrupados por procedimiento.</p>
                  </div>
                  <select
                    className="filter"
                    aria-label="Rango de días"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>Últimos 7 días</option>
                    <option value={14}>Últimos 14 días</option>
                    <option value={30}>Últimos 30 días</option>
                  </select>
                </div>
                <div className="dashboard-bars">
                  {summary.top_questions.length ? (
                    summary.top_questions.map((q) => (
                      <div className="dashboard-bar-row" key={q.topic}>
                        <div className="dashboard-bar-label">
                          <span>{q.topic}</span>
                          <strong>{q.total}</strong>
                        </div>
                        <div className="dashboard-bar-track">
                          <span style={{ width: `${(q.total / maxTop) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="Todavía no hay preguntas respondidas" icon="chart">
                      En cuanto el chatbot o el analizador de pólizas respondan
                      algo, aparecerá aquí.
                    </Empty>
                  )}
                </div>
                {summary.per_day.length > 0 && (
                  <div className="dashboard-daily">
                    <h3>Preguntas por día</h3>
                    <div className="dashboard-daily-chart">
                      {summary.per_day.map((d) => (
                        <div className="dashboard-daily-col" key={d.day}>
                          <span
                            className="dashboard-daily-fill"
                            style={{
                              height: `${Math.max(4, (d.total / maxDay) * 100)}%`,
                            }}
                          />
                          <small>{weekday.format(new Date(`${d.day}T00:00:00`))}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Vacíos de conocimiento</h2>
                    <p>Preguntas que nadie ha enseñado todavía.</p>
                  </div>
                </div>
                <div className="dashboard-gaps">
                  {gaps.length ? (
                    gaps.map((g) => (
                      <article className="dashboard-gap" key={g.id}>
                        <h3>{g.question}</h3>
                        <p>
                          Preguntado {g.asked_count}{" "}
                          {g.asked_count === 1 ? "vez" : "veces"} · sin respaldo
                          publicado
                        </p>
                        {canResolveGaps && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await api(`/chatbot/gaps/${g.id}/resolve`, {
                                  method: "POST",
                                });
                                await load();
                              })
                            }
                          >
                            Marcar como enseñado
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <Empty title="Sin vacíos abiertos" icon="check">
                      Cada pregunta sin respaldo publicado aparecerá aquí.
                    </Empty>
                  )}
                </div>
              </section>
            </div>
          </>
        )
      )}
    </>
  );
}
