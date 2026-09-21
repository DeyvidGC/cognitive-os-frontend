import { useCallback, useEffect, useState } from "react";
import { ApiError, json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { useAction } from "../../shared/utils";
import { Empty, ErrorNotice } from "../../shared/ui";
import type { MasterAnswerEntry, MasterUsageEntry } from "./types";
import "./Master.css";

export default function Master({ api }: { api: Client }) {
  const [usage, setUsage] = useState<MasterUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState("");
  const [mode, setMode] = useState<"chatbot" | "policies">("chatbot");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<MasterAnswerEntry[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const { error, run } = useAction();
  const load = useCallback(async () => {
    const list = await api<MasterUsageEntry[]>("/master/usage?days=7");
    setUsage(list);
    setLoading(false);
  }, [api]);
  useEffect(() => {
    void run(load);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAskError("");
    setAnswers(null);
    try {
      const path =
        mode === "chatbot" ? "/master/chatbot/ask" : "/master/policies/ask";
      const result = await api<MasterAnswerEntry[]>(
        path,
        json({ question: trimmed }),
      );
      setAnswers(result);
    } catch (e) {
      setAskError(
        e instanceof ApiError ? e.message : "No se pudo comparar la respuesta.",
      );
    } finally {
      setAsking(false);
    }
  }
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
          Cargando comparativa…
        </div>
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Comparativa entre clientes</h2>
                <p>Últimos 7 días · qué sabe la IA de cada cliente.</p>
              </div>
              {usage.length > 1 && (
                <input
                  className="filter"
                  aria-label="Filtrar por cliente"
                  placeholder="Filtrar por cliente…"
                  value={orgFilter}
                  onChange={(e) => setOrgFilter(e.target.value)}
                />
              )}
            </div>
            <div className="master-org-grid">
              {usage.length ? (
                usage
                  .filter((u) =>
                    u.organization_name
                      .toLowerCase()
                      .includes(orgFilter.toLowerCase()),
                  )
                  .map((u) => (
                    <article className="master-org-card" key={u.organization_id}>
                      <h3>{u.organization_name}</h3>
                      <p>
                        <strong>{u.questions}</strong> preguntas ·{" "}
                        {u.coverage === null
                          ? "—"
                          : `${Math.round(u.coverage * 100)}%`}{" "}
                        cobertura · {u.open_gaps} vacíos
                      </p>
                    </article>
                  ))
              ) : (
                <Empty title="Todavía no hay organizaciones con actividad" icon="chart">
                  En cuanto un cliente empiece a preguntar, aparecerá aquí.
                </Empty>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Modo maestro</h2>
                <p>Compara cómo respondería cada cliente la misma pregunta.</p>
              </div>
              <div className="master-mode-toggle">
                <button
                  className={mode === "chatbot" ? "chip active" : "chip"}
                  onClick={() => setMode("chatbot")}
                  type="button"
                >
                  Chatbot
                </button>
                <button
                  className={mode === "policies" ? "chip active" : "chip"}
                  onClick={() => setMode("policies")}
                  type="button"
                >
                  Pólizas
                </button>
              </div>
            </div>
            <form
              className="master-ask-form"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <input
                aria-label="Pregunta a comparar"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder='Ej. "¿Cómo maneja cada cliente la renovación automática?"'
                maxLength={1200}
                disabled={asking}
              />
              <button className="primary" disabled={asking || !question.trim()}>
                {asking ? "Comparando…" : "Comparar"}
              </button>
            </form>
            <ErrorNotice error={askError} />
            {answers && (
              <div className="master-answers">
                {answers.length ? (
                  answers.map((a) => (
                    <article className="master-answer" key={a.organization_id}>
                      <h3>{a.organization_name}</h3>
                      <p>{a.answer || "Sin respaldo publicado para esto."}</p>
                    </article>
                  ))
                ) : (
                  <Empty title="Todavía no hay organizaciones para comparar" />
                )}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
