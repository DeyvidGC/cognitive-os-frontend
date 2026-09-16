import { useEffect, useState } from "react";
import type { Client } from "./api";
import { json } from "./api";
import type { RecordingReport as Report, ReportContent } from "./recordings";
import { formatDuration } from "./screenCapture";
import { Badge, ErrorNotice, Icon } from "./ui";
import { useAction } from "./utils";
export default function RecordingReport({
  api,
  recordingId,
  canReview,
  onSeek,
  onDirty,
}: {
  api: Client;
  recordingId: string;
  canReview: boolean;
  onSeek: (seconds: number) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [draft, setDraft] = useState<ReportContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState("");
  const { run, busy, error } = useAction();
  const path = `/recordings/${recordingId}/report`;
  const dirty =
    !!report &&
    !!draft &&
    JSON.stringify(report.content) !== JSON.stringify(draft);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  async function load() {
    const next = await api<Report>(path);
    setReport(next);
    setDraft(structuredClone(next.content));
    setEditing(false);
  }
  useEffect(() => {
    void run(load);
  }, [api, path]); // eslint-disable-line react-hooks/exhaustive-deps
  async function review(decision: string) {
    if (!report) return;
    const next = await api<Report>(
      `${path}/review`,
      json({ revision: report.revision, decision, feedback }),
    );
    setReport(next);
    setDraft(structuredClone(next.content));
    setMessage(
      decision === "approved"
        ? "Informe aprobado. Queda disponible para consulta."
        : "Informe rechazado. Puedes corregirlo antes de revisarlo de nuevo.",
    );
  }
  return (
    <section className="report-panel panel">
      <div className="section-heading">
        <div>
          <h2>Lo aprendido del video</h2>
          <p>
            Revisa las instrucciones y comprueba sus fuentes antes de aprobar.
          </p>
        </div>
        {report && <Badge status={report.review_status} />}
      </div>
      <div className="report-body">
        <ErrorNotice error={error} />
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        {error && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Se descartarán tus cambios locales para cargar la revisión actual. ¿Continuar?",
                )
              )
                void run(load);
            }}
          >
            Recargar último informe
          </button>
        )}
        {!draft || !report ? (
          <p role="status">
            {error ? "El informe no se pudo cargar." : "Cargando informe…"}
          </p>
        ) : (
          <>
            <div className="report-meta">
              <span>Revisión {report.revision}</span>
              <span>{report.sampling.frames.length} capturas analizadas</span>
              <span>
                Audio{" "}
                {report.sampling.audio_analyzed ? "analizado" : "no analizado"}
              </span>
            </div>
            {report.feedback && (
              <div className="info">
                Comentario de revisión: {report.feedback}
              </div>
            )}
            {canReview && report.review_status !== "approved" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Ver vista de lectura" : "Corregir informe"}
              </button>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const next = await api<Report>(
                    path,
                    json({ revision: report.revision, content: draft }, "PUT"),
                  );
                  setReport(next);
                  setDraft(structuredClone(next.content));
                  setMessage(
                    "Correcciones guardadas. El informe vuelve a estar pendiente de revisión.",
                  );
                  setEditing(false);
                });
              }}
            >
              <fieldset disabled={busy}>
                {editing ? (
                  <>
                    <label>
                      Título del informe
                      <input
                        value={draft.title}
                        required
                        maxLength={200}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Resumen
                      <textarea
                        value={draft.summary}
                        required
                        maxLength={4000}
                        onChange={(e) =>
                          setDraft({ ...draft, summary: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Informe
                      <textarea
                        value={draft.report}
                        required
                        maxLength={16000}
                        onChange={(e) =>
                          setDraft({ ...draft, report: e.target.value })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <h3>{draft.title}</h3>
                    <p>{draft.summary}</p>
                    <pre className="report-text">{draft.report}</pre>
                  </>
                )}
                <h3>Instrucciones y momentos del video</h3>
                <div className="report-instructions">
                  {draft.instructions.map((step, index) => (
                    <article key={index}>
                      <span className="step-number">{index + 1}</span>
                      <div>
                        {editing ? (
                          <>
                            <label>
                              Instrucción
                              <textarea
                                value={step.instruction}
                                required
                                maxLength={4000}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    instructions: draft.instructions.map(
                                      (s, i) =>
                                        i === index
                                          ? {
                                              ...s,
                                              instruction: e.target.value,
                                            }
                                          : s,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Resultado esperado
                              <textarea
                                value={step.expected_result}
                                required
                                maxLength={2000}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    instructions: draft.instructions.map(
                                      (s, i) =>
                                        i === index
                                          ? {
                                              ...s,
                                              expected_result: e.target.value,
                                            }
                                          : s,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <h4>{step.instruction}</h4>
                            <p>{step.expected_result}</p>
                          </>
                        )}
                        <div className="time-sources">
                          {step.frame_indices.map((frameIndex) => {
                            const frame = report.sampling.frames[frameIndex];
                            return frame ? (
                              <button
                                type="button"
                                className="time-source"
                                key={frameIndex}
                                onClick={() =>
                                  onSeek(frame.timestamp_ms / 1000)
                                }
                              >
                                <Icon name="play" size={12} />
                                {formatDuration(frame.timestamp_ms / 1000)}
                              </button>
                            ) : (
                              <span key={frameIndex}>Fuente no disponible</span>
                            );
                          })}
                        </div>
                        {editing && (
                          <fieldset className="source-selection">
                            <legend>
                              Momentos que respaldan este paso (al menos uno)
                            </legend>
                            {report.sampling.frames.map((frame, frameIndex) => (
                              <label className="checkbox" key={frameIndex}>
                                <input
                                  type="checkbox"
                                  checked={step.frame_indices.includes(
                                    frameIndex,
                                  )}
                                  onChange={(e) => {
                                    const indices = e.target.checked
                                      ? [...step.frame_indices, frameIndex]
                                      : step.frame_indices.filter(
                                          (i) => i !== frameIndex,
                                        );
                                    if (indices.length)
                                      setDraft({
                                        ...draft,
                                        instructions: draft.instructions.map(
                                          (s, i) =>
                                            i === index
                                              ? { ...s, frame_indices: indices }
                                              : s,
                                        ),
                                      });
                                  }}
                                />
                                {formatDuration(frame.timestamp_ms / 1000)}
                              </label>
                            ))}
                          </fieldset>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {editing ? (
                  <label>
                    Dudas o limitaciones (una por línea)
                    <textarea
                      value={draft.uncertainties.join("\n")}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          uncertainties: e.target.value
                            .split("\n")
                            .slice(0, 30),
                        })
                      }
                    />
                  </label>
                ) : (
                  draft.uncertainties.length > 0 && (
                    <div className="report-uncertainties">
                      <h4>Requiere aclaración</h4>
                      <ul>
                        {draft.uncertainties.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                      <small>
                        Son dudas del informe; todavía no se convierten
                        automáticamente en preguntas de la sesión.
                      </small>
                    </div>
                  )
                )}
                {editing && (
                  <button className="primary" disabled={!dirty}>
                    Guardar correcciones
                  </button>
                )}
              </fieldset>
            </form>
            {canReview && report.review_status !== "approved" && (
              <div className="report-review">
                <label>
                  Comentario de revisión
                  <textarea
                    value={feedback}
                    maxLength={4000}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Qué validaste o qué necesita corregirse"
                    disabled={busy}
                  />
                </label>
                {dirty && (
                  <p className="unsaved">
                    Guarda las correcciones antes de aprobar o rechazar.
                  </p>
                )}
                <div className="button-group">
                  <button
                    className="primary"
                    disabled={busy || dirty}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Un informe aprobado ya no puede editarse. ¿Confirmar aprobación?",
                        )
                      )
                        void run(() => review("approved"));
                    }}
                  >
                    Aprobar informe
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || dirty}
                    onClick={() => void run(() => review("rejected"))}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            )}
            <div className="connection-note">
              <Icon name="book" size={15} />
              La publicación como procedimiento es un paso separado. La API aún
              no convierte este informe en una versión publicable.
            </div>
          </>
        )}
      </div>
    </section>
  );
}
