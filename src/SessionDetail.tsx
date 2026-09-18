import { date, useAction } from "./utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { allPages, json } from "./api";
import type {
  Clarification,
  Client,
  Event,
  Evidence,
  Membership,
  Session,
} from "./api";
import { Badge, Empty, ErrorNotice, Icon, Modal } from "./ui";
import SessionMedia from "./SessionMedia";
import type { Recording, Job } from "./recordings";
import JobProgress from "./JobProgress";
export default function SessionDetail({
  api,
  session,
  membership,
  userId,
  onCaptureProtectedChange,
}: {
  api: Client;
  session: Session;
  membership: Membership;
  userId: string;
  onCaptureProtectedChange: (value: boolean) => void;
}) {
  const [current, setCurrent] = useState(session);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [questions, setQuestions] = useState<Clarification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [finish, setFinish] = useState(false);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [captureProtected, setCaptureProtected] = useState(false);
  /*
    Un solo campo de escritura para toda la sesión. Antes había cuatro
    formularios abiertos a la vez (nota, evidencia, pregunta nueva y
    respuesta); ahora el modo decide qué se guarda.
  */
  const [composerMode, setComposerMode] = useState<"note" | "question">("note");
  const captureProtectionChanged = useCallback(
    (value: boolean) => {
      setCaptureProtected(value);
      onCaptureProtectedChange(value);
    },
    [onCaptureProtectedChange],
  );
  const { busy, error, run } = useAction();
  const pendingEvent = useRef<{
    text: string;
    idempotency_key: string;
    sequence_number: number;
    offset_ms: number;
    event_type: string;
  } | null>(null);
  const path = `/learning-sessions/${session.id}`;
  const canWrite =
    current.status === "capturing" &&
    (membership.role === "owner" ||
      (membership.role === "author" && userId === session.author_id));
  const refresh = useCallback(async () => {
    try {
      const [s, e, files, q] = await Promise.all([
        api<Session>(path),
        allPages<Event>(api, `${path}/events`),
        api<Evidence[]>(`${path}/evidence`),
        api<Clarification[]>(`${path}/clarifications`),
      ]);
      setLoadError("");
      setCurrent(s);
      setEvents(e);
      setEvidence(files);
      setQuestions(q);
      setLoaded(true);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "No se pudo cargar la sesión.",
      );
      setLoaded(false);
    }
  }, [api, path]);
  useEffect(() => {
    // Synchronize this resource with the API; refresh only updates after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Selecciona una imagen de hasta 10 MB.");
    const form = new FormData();
    form.append("file", file);
    await api(`${path}/evidence`, { method: "POST", body: form });
    await refresh();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SESIÓN DE APRENDIZAJE</span>
          <h1 className="detail-title">{current.objective}</h1>
          <p>
            {current.application_name} · {date(current.created_at)}
          </p>
        </div>
        <Badge status={current.status} />
      </div>
      <ErrorNotice error={error || loadError} />
      {loadError && (
        <button className="secondary" onClick={() => void refresh()}>
          Reintentar
        </button>
      )}
      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {current.status === "processing" && (
        <div className="info">
          La sesión se está procesando. El estado del análisis se actualiza
          automáticamente.
        </div>
      )}
      {current.status === "failed" && (
        <div className="error">
          El procesamiento de la sesión falló. Revisa el estado del video y las
          opciones de reintento.
        </div>
      )}
      {current.status === "completed" && (
        <div className="success">
          Procesamiento completado. Revisa lo aprendido antes de aprobarlo.
        </div>
      )}
      {job && <JobProgress api={api} initial={job} />}
      {!loaded && !loadError && <p role="status">Cargando sesión…</p>}
      <SessionMedia
        api={api}
        session={current}
        writable={canWrite}
        canManage={
          membership.role === "owner" ||
          (membership.role === "author" && userId === session.author_id)
        }
        canReview={
          membership.role === "reviewer" ||
          membership.role === "owner" ||
          (membership.role === "author" && userId === session.author_id)
        }
        onProtectedChange={captureProtectionChanged}
        onRecordingsChange={setRecordings}
        onSessionChange={setCurrent}
        onContextChange={refresh}
      />
      <h2 className="studio-section-label">Notas y contexto del proceso</h2>
      {loaded && (
        <div className="detail-grid">
          <section className="panel detail-panel">
            <div className="section-heading">
              <div>
                <h2>Registro de la sesión</h2>
                <p>Explica el proceso, paso a paso.</p>
              </div>
              <Icon name="record" />
            </div>
            {events.length ? (
              <div className="timeline">
                {events.map((event, i) => (
                  <article key={event.id}>
                    <span className="step-number">{i + 1}</span>
                    <div>
                      <small>
                        Nota · {Math.floor(event.offset_ms / 60000)} min
                      </small>
                      <p>{event.payload.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="Dale contexto a tu proceso">
                Describe qué estás haciendo y por qué.
              </Empty>
            )}
            {canWrite && (
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const text = String(new FormData(form).get("text")).trim();
                  if (composerMode === "question") {
                    void run(async () => {
                      await api(
                        `${path}/clarifications`,
                        json({ question: text }),
                      );
                      form.reset();
                      await refresh();
                    });
                    return;
                  }
                  void run(async () => {
                    if (
                      !pendingEvent.current ||
                      pendingEvent.current.text !== text
                    ) {
                      const latestEvents = await allPages<Event>(
                        api,
                        `${path}/events`,
                      );
                      pendingEvent.current = {
                        text,
                        idempotency_key: crypto.randomUUID(),
                        sequence_number:
                          Math.max(
                            -1,
                            ...latestEvents.map((e) => e.sequence_number),
                          ) + 1,
                        offset_ms: Math.max(
                          0,
                          Date.now() - new Date(current.created_at).getTime(),
                        ),
                        event_type: "message",
                      };
                    }
                    await api(`${path}/events`, json(pendingEvent.current));
                    pendingEvent.current = null;
                    form.reset();
                    await refresh();
                  });
                }}
              >
                <div className="composer-modes" role="group" aria-label="Qué quieres guardar">
                  <button
                    type="button"
                    className={composerMode === "note" ? "on" : ""}
                    aria-pressed={composerMode === "note"}
                    onClick={() => setComposerMode("note")}
                  >
                    Nota
                  </button>
                  <button
                    type="button"
                    className={composerMode === "question" ? "on" : ""}
                    aria-pressed={composerMode === "question"}
                    onClick={() => setComposerMode("question")}
                  >
                    Pregunta
                  </button>
                </div>
                <textarea
                  name="text"
                  required
                  key={composerMode}
                  maxLength={composerMode === "question" ? 4000 : 20000}
                  aria-label={
                    composerMode === "question"
                      ? "Nueva pregunta"
                      : "Añadir una nota"
                  }
                  placeholder={
                    composerMode === "question"
                      ? "¿Qué se debe validar en este paso?"
                      : "Primero ingreso al portal y selecciono…"
                  }
                  disabled={busy}
                />
                <div className="composer-actions">
                  <label className="composer-attach">
                    <Icon name="upload" size={16} />
                    Adjuntar captura
                    <input
                      aria-label="Subir una captura"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void run(() => upload(file));
                      }}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    {composerMode === "question"
                      ? "Añadir pregunta"
                      : "Guardar nota"}
                  </button>
                </div>
              </form>
            )}
          </section>
          <div className="detail-aside">
            <section className="panel detail-panel">
              <div className="section-heading">
                <div>
                  <h2>Evidencias</h2>
                  <p>Capturas que respaldan el proceso.</p>
                </div>
                <span className="count">{evidence.length}</span>
              </div>
              {evidence.map((item, i) => (
                <button
                  className="evidence-row"
                  key={item.id}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const blob = await api<Blob>(`/evidence/${item.id}/file`);
                      setPreview(URL.createObjectURL(blob));
                    })
                  }
                >
                  <span className="row-icon">
                    <Icon name="record" />
                  </span>
                  <span>
                    Captura {i + 1}
                    <small>
                      {Math.ceil(item.size_bytes / 1024)} KB ·{" "}
                      {date(item.captured_at)}
                    </small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
              {!evidence.length && (
                <p className="muted inset">Aún no hay capturas.</p>
              )}
            </section>
            <section className="panel detail-panel">
              <div className="section-heading">
                <div>
                  <h2>Aclaraciones</h2>
                  <p>Resuelve las dudas antes de cerrar.</p>
                </div>
                <span className="count">
                  {questions.filter((q) => !q.answer).length}
                </span>
              </div>
              <div className="questions">
                {questions.map((q) => (
                  <article key={q.id}>
                    <h3>{q.question}</h3>
                    {q.answer ? (
                      <p>{q.answer}</p>
                    ) : canWrite ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await api(
                              `${path}/clarifications/${q.id}/answer`,
                              json({ answer: f.get("answer") }, "PUT"),
                            );
                            await refresh();
                          });
                        }}
                      >
                        <label>
                          Respuesta
                          <textarea
                            name="answer"
                            required
                            maxLength={10000}
                            disabled={busy}
                          />
                        </label>
                        <button className="secondary" disabled={busy}>
                          Guardar respuesta
                        </button>
                      </form>
                    ) : (
                      <Badge status="pending" />
                    )}
                  </article>
                ))}
                {!questions.length && (
                  <p className="muted">No hay preguntas pendientes.</p>
                )}
              </div>
            </section>
            {canWrite && (
              <button
                className="primary full"
                disabled={
                  busy ||
                  (!events.length &&
                    !evidence.length &&
                    !recordings.some((r) => r.status === "uploaded")) ||
                  recordings.some((r) => r.status === "uploading") ||
                  questions.some((q) => !q.answer)
                }
                onClick={() => setFinish(true)}
              >
                <Icon name="check" size={18} />
                Finalizar sesión
              </button>
            )}
          </div>
        </div>
      )}
      {finish && (
        <Modal
          title="Finalizar sesión"
          close={() => {
            if (!busy) setFinish(false);
          }}
        >
          <p className="form-intro">
            Se cerrará la captura y ya no podrás añadir notas, imágenes o
            respuestas. Se creará un trabajo de análisis que ejecutará el
            servicio de procesamiento.
          </p>
          {captureProtected && (
            <p className="info">
              Antes de finalizar, detén la grabación y descarga el video si
              quieres conservarlo. El video local no se guarda en el servidor y
              se perderá al cerrar esta sesión.
            </p>
          )}
          <button
            className="primary full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  captureProtected &&
                  !window.confirm(
                    "Finalizar detendrá la pantalla y eliminará el video local de esta vista. ¿Ya descargaste tu copia y quieres finalizar?",
                  )
                )
                  return;
                setJob(await api<Job>(`${path}/finish`, { method: "POST" }));
                setFinish(false);
                setMessage(
                  "Sesión finalizada. Tus notas y evidencias quedaron guardadas.",
                );
                await refresh();
              })
            }
          >
            {busy ? "Finalizando…" : "Confirmar y finalizar"}
          </button>
          <ErrorNotice error={error} />
        </Modal>
      )}
      {preview && (
        <Modal title="Evidencia de la sesión" close={() => setPreview("")}>
          <img
            className="evidence-preview"
            src={preview}
            alt="Captura guardada como evidencia de la sesión"
          />
        </Modal>
      )}
    </>
  );
}
