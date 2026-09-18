import VoiceInput from "../../shared/VoiceInput";
import { lazy, Suspense, useEffect, useState } from "react";
import { allPages, json } from "../../shared/api";
import type { Client, Clarification, Version } from "../../shared/api";
import type { RecordingReport, Job } from "./recordings";
import { Badge, ErrorNotice } from "../../shared/ui";
import { useAction } from "../../shared/utils";
import { formatDuration } from "../capture/screenCapture";
import { confirmAction } from "../../shared/confirmAction";
import ReportDocument from "./ReportDocument";
const BpmnDiagram = lazy(() => import("./BpmnDiagram"));

type FlowNode = {
  id: string;
  type: string;
  data: {
    label: string;
    expected_result?: string;
    text_sources?: string[];
    frames?: { timestamp_ms: number }[];
  };
};
type Flow = {
  title: string;
  revision: number;
  review_status: string;
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string; label?: string }[];
};
type History = {
  revision: number;
  created_at: string;
  snapshot: RecordingReport;
};
type Transcript = {
  text: string;
  analyzed: boolean;
  audio_present: boolean;
  exclusion_reason: string | null;
};

export default function RecordingInsights({
  api,
  report,
  sessionId,
  canManage,
  dirty,
  onSeek,
  onChanged,
  onOpenProcedure,
}: {
  api: Client;
  report: RecordingReport;
  sessionId: string;
  canManage: boolean;
  dirty: boolean;
  onSeek: (seconds: number) => void;
  onChanged: () => void;
  onOpenProcedure: (procedureId: string, versionId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("flow");
  const [questions, setQuestions] = useState<Clarification[]>([]);
  const [questionMode, setQuestionMode] = useState<"all" | "guided">("all");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [historical, setHistorical] = useState<number | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [selected, setSelected] = useState("");
  const [bpmnXml, setBpmnXml] = useState("");
  const [list, setList] = useState(false);
  const [index, setIndex] = useState<{
    indexed: boolean;
    chunks: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [version, setVersion] = useState<
    (Version & { procedure_id: string }) | null
  >(null);
  const { run, busy, error } = useAction();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const path = `/recordings/${report.recording_id}`;
  useEffect(() => {
    let active = true;
    // A changed query starts a remote request; expose its pending state immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    async function load() {
      if (tab === "questions") {
        const result = await api<Clarification[]>(
          `/learning-sessions/${sessionId}/clarifications`,
        );
        if (active) setQuestions(result);
      }
      if (tab === "transcript") {
        const result = await api<Transcript>(`${path}/transcript`);
        if (active) setTranscript(result);
      }
      if (tab === "history") {
        const result = await allPages<History>(api, `${path}/report/history`);
        if (active) setHistory(result);
      }
      if (tab === "flow") {
        const result = await api<Flow>(`${path}/flow`);
        const bpmn = result.nodes.length
          ? await api<{ xml: string; revision: number }>(`${path}/flow/bpmn`)
          : null;
        if (bpmn && bpmn.revision !== result.revision)
          throw new Error("El informe cambió. Actualiza el diagrama.");
        if (active) {
          setFlow(result);
          setBpmnXml(bpmn?.xml || "");
        }
      }
      if (tab === "publish") {
        const result = await api<{ indexed: boolean; chunks: number }>(
          `${path}/index`,
        );
        if (active) setIndex(result);
      }
    }
    void load()
      .catch((e) => {
        if (active)
          setLoadError(
            e instanceof Error ? e.message : "No se pudo cargar esta sección.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, path, sessionId, report.revision, tab, refresh]);
  const old = history.find((item) => item.revision === historical);
  const node = flow?.nodes.find((item) => item.id === selected);
  return (
    <section className="insight-panel">
      <h3>Revisar y utilizar lo aprendido</h3>
      <p>
        Explora el diagrama y selecciona un paso para consultar sus fuentes y el
        momento del video.
      </p>
      <div
        className="insight-tabs"
        role="tablist"
        aria-label="Detalles del informe"
      >
        {[
          ["flow", "Diagrama del proceso"],
          ["questions", "Aclaraciones"],
          ["transcript", "Transcripción"],
          ["history", "Revisiones"],
          ["document", "Word / PDF"],
          ["publish", "Procedimiento e índice"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />
      <ErrorNotice error={loadError} />
      {loading && <p role="status">Cargando sección…</p>}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <button
        type="button"
        className="text-button"
        disabled={busy || loading}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Actualizar esta sección
      </button>
      {tab === "questions" && (
        <div>
          <div
            className="button-group question-modes"
            aria-label="Forma de responder"
          >
            <button
              type="button"
              className="secondary"
              aria-pressed={questionMode === "all"}
              onClick={() => setQuestionMode("all")}
            >
              Encuesta completa
            </button>
            <button
              type="button"
              className="secondary"
              aria-pressed={questionMode === "guided"}
              onClick={() => {
                setQuestionMode("guided");
                setQuestionIndex(0);
              }}
            >
              Una pregunta a la vez
            </button>
          </div>
          {questionMode === "guided" && questions.length > 0 && (
            <div className="button-group">
              <button
                className="text-button"
                type="button"
                disabled={questionIndex === 0}
                onClick={() => setQuestionIndex((index) => index - 1)}
              >
                Anterior
              </button>
              <span>
                Pregunta {questionIndex + 1} de {questions.length}
              </span>
              <button
                className="text-button"
                type="button"
                disabled={questionIndex >= questions.length - 1}
                onClick={() => setQuestionIndex((index) => index + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
          {(questionMode === "guided"
            ? questions.slice(questionIndex, questionIndex + 1)
            : questions
          ).map((q) => (
            <form
              className="chat-question"
              key={q.id}
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const next = await api<Clarification>(
                    `/learning-sessions/${sessionId}/clarifications/${q.id}/answer`,
                    json({ answer: answers[q.id]?.trim() }, "PUT"),
                  );
                  setQuestions((items) =>
                    items.map((item) => (item.id === q.id ? next : item)),
                  );
                });
              }}
            >
              <h4>{q.question}</h4>
              {q.answer ? (
                <p>{q.answer}</p>
              ) : canManage && report.review_status !== "approved" ? (
                <>
                  <VoiceInput
                    question={q.question}
                    value={answers[q.id] || ""}
                    disabled={busy}
                    onChange={(value) =>
                      setAnswers((previous) => ({ ...previous, [q.id]: value }))
                    }
                  />
                  <button
                    className="secondary"
                    disabled={busy || !answers[q.id]?.trim()}
                  >
                    Guardar respuesta
                  </button>
                </>
              ) : (
                <p>Respuesta pendiente</p>
              )}
            </form>
          ))}
          {!questions.length && <p>No hay aclaraciones registradas.</p>}
          {!loading && !loadError && !questions.some((q) => !q.answer) && (
            <button
              type="button"
              className="secondary"
              disabled={dirty || busy}
              onClick={() => setTab("document")}
            >
              Preparar Word / PDF
            </button>
          )}
          {canManage && report.review_status !== "approved" && (
            <button
              type="button"
              className="primary"
              disabled={busy || dirty || questions.some((q) => !q.answer)}
              onClick={async () => {
                if (
                  !(await confirmAction(
                    "Se generará una nueva revisión con tus respuestas y notas. El informe actual quedará en el historial.",
                    "Regenerar informe",
                    "Regenerar",
                  ))
                )
                  return;
                void run(async () => {
                  await api<Job>(
                    `${path}/report/regenerate`,
                    json({ revision: report.revision }),
                  );
                  setMessage(
                    "Regeneración en cola. Puedes consultar su progreso en los trabajos de la sesión.",
                  );
                  onChanged();
                });
              }}
            >
              Regenerar con las respuestas
            </button>
          )}
        </div>
      )}
      {tab === "transcript" && transcript && (
        <div>
          <p>
            {transcript.analyzed
              ? "Audio analizado"
              : !transcript.audio_present
                ? "El video no contiene audio"
                : "El audio no fue analizado"}
          </p>
          {transcript.exclusion_reason && (
            <p>Motivo: {transcript.exclusion_reason}</p>
          )}
          <pre>{transcript.text || "No hay transcripción disponible."}</pre>
        </div>
      )}
      {tab === "history" && (
        <>
          <label>
            Comparar con revisión anterior
            <select
              value={historical ?? ""}
              onChange={(e) =>
                setHistorical(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Selecciona una revisión</option>
              {history.map((item) => (
                <option key={item.revision} value={item.revision}>
                  Revisión {item.revision} ·{" "}
                  {new Date(item.created_at).toLocaleString("es")}
                </option>
              ))}
            </select>
          </label>
          {!history.length && <p>No hay revisiones archivadas.</p>}
          {old && (
            <div className="revision-comparison">
              {[
                { revision: old.revision, content: old.snapshot.content },
                report,
              ].map((item) => (
                <article key={item.revision}>
                  <h4>Revisión {item.revision}</h4>
                  <h3>{item.content.title}</h3>
                  <p>{item.content.summary}</p>
                  <pre>{item.content.report}</pre>
                  <ol>
                    {item.content.instructions.map((step, i) => (
                      <li key={i}>
                        <strong>{step.instruction}</strong>
                        <p>{step.expected_result}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "flow" && flow && (
        <>
          {flow.nodes.length === 0 && (
            <p>El informe todavía no tiene pasos para construir el diagrama.</p>
          )}
          <div className="button-group">
            <Badge status={flow.review_status} />
            <span>Revisión {flow.revision}</span>
            <button
              type="button"
              className="secondary"
              onClick={() => setList(!list)}
            >
              {list ? "Ver grafo" : "Ver lista accesible"}
            </button>
          </div>
          {!list && bpmnXml && (
            <Suspense fallback={<p role="status">Cargando diagrama...</p>}>
              <BpmnDiagram
                xml={bpmnXml}
                filename={`proceso-${report.recording_id}-r${flow.revision}.bpmn`}
                onSelect={setSelected}
              />
            </Suspense>
          )}
          {list && (
            <div className="flow-viewport">
              <ol className="flow-list">
                {flow.nodes.map((item) => (
                  <li key={item.id} className={`node-${item.type}`}>
                    <button
                      type="button"
                      aria-pressed={selected === item.id}
                      onClick={() => setSelected(item.id)}
                    >
                      {item.data.label}
                    </button>
                    {flow.edges
                      .filter((edge) => edge.source === item.id)
                      .map((edge) => (
                        <span
                          className={
                            edge.label
                              ? "flow-arrow flow-condition"
                              : "flow-arrow"
                          }
                          key={edge.id}
                          aria-label={`Siguiente: ${flow.nodes.find((target) => target.id === edge.target)?.data.label || edge.target}`}
                        >
                          {edge.label
                            ? `${edge.label} → ${edge.target === "end" ? "Fin" : edge.target.replace("step-", "Paso ")}`
                            : "↓"}
                        </span>
                      ))}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {node && (
            <article className="flow-detail">
              <h4>{node.data.label}</h4>
              <p>{node.data.expected_result}</p>
              <p>
                Fuentes:{" "}
                {node.data.text_sources
                  ?.map(
                    (source) =>
                      ({
                        notes: "Notas",
                        transcript: "Transcripción",
                        clarifications: "Aclaraciones",
                      })[source] || source,
                  )
                  .join(", ") || "Video"}
              </p>
              <div className="time-sources">
                {node.data.frames?.map((frame, i) => (
                  <button
                    key={i}
                    type="button"
                    className="time-source"
                    onClick={() => onSeek(frame.timestamp_ms / 1000)}
                  >
                    {formatDuration(frame.timestamp_ms / 1000)}
                  </button>
                ))}
              </div>
            </article>
          )}
        </>
      )}
      {tab === "publish" && (
        <>
          <p>
            {index?.indexed
              ? `Disponible en búsqueda · ${index.chunks} fragmentos`
              : "El índice aún no está listo. Consulta el trabajo de indexación para distinguir espera y error."}
          </p>
          {canManage && report.review_status === "approved" && (
            <div className="button-group">
              <button
                type="button"
                className="primary"
                disabled={busy || dirty}
                onClick={() =>
                  void run(async () => {
                    const created = await api<
                      Version & { procedure_id: string }
                    >(`${path}/procedure`, { method: "POST" });
                    setVersion(created);
                    setMessage(
                      "Borrador creado. Revisa la versión antes de enviarla al circuito editorial.",
                    );
                  })
                }
              >
                Crear / recuperar procedimiento borrador
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || index?.indexed}
                onClick={() =>
                  void run(async () => {
                    await api<Job>(`${path}/index`, { method: "POST" });
                    setMessage("Indexación solicitada.");
                    onChanged();
                    setRefresh((n) => n + 1);
                  })
                }
              >
                Indexar / reintentar índice
              </button>
            </div>
          )}
          {version && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  onOpenProcedure(version.procedure_id, version.id),
                )
              }
            >
              Abrir versión {version.version_number}
            </button>
          )}
          <p className="connection-note">
            La publicación se realiza desde el procedimiento: enviar a revisión,
            aprobar y publicar con el rol correspondiente.
          </p>
        </>
      )}
      {tab === "document" && (
        <ReportDocument
          key={`${report.recording_id}-${report.revision}`}
          api={api}
          report={report}
          dirty={dirty}
        />
      )}
    </section>
  );
}
