import { useAction } from "./utils";
import { useCallback, useEffect, useState } from "react";
import { allPages, ApiError, json } from "./api";
import type {
  Client,
  Evidence,
  Membership,
  Procedure,
  Session,
  Step,
  Version,
} from "./api";
import { Badge, Empty, ErrorNotice, Icon, Modal } from "./ui";
export default function ProcedureDetail({
  api,
  procedure,
  membership,
  sessions,
}: {
  api: Client;
  procedure: Procedure;
  membership: Membership;
  sessions: Session[];
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useAction();
  const canWrite = membership.role === "owner" || membership.role === "author";
  const load = useCallback(async () => {
    const items = await allPages<Version>(
      api,
      `/procedures/${procedure.id}/versions`,
    );
    setVersions(items);
    setSelected((id) => id || items[0]?.id || "");
    setLoading(false);
  }, [api, procedure.id]);
  useEffect(() => {
    void run(load);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const version = versions.find((v) => v.id === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BIBLIOTECA DE PROCEDIMIENTOS</span>
          <h1 className="detail-title">{procedure.title}</h1>
          <p>{procedure.scope}</p>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            Nueva versión
          </button>
        )}
      </div>
      <ErrorNotice error={error} />
      {error && loading && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run(load)}
        >
          Reintentar
        </button>
      )}
      {loading ? (
        <p role="status">Cargando versiones…</p>
      ) : versions.length ? (
        <>
          <div className="version-bar">
            <label>
              Versión
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Versión {v.version_number}
                  </option>
                ))}
              </select>
            </label>
            {version && <Badge status={version.status} />}
          </div>
          {version && (
            <VersionEditor
              key={version.id}
              api={api}
              version={version}
              membership={membership}
              sessions={sessions}
              onChange={load}
            />
          )}
        </>
      ) : (
        <Empty title="Este procedimiento está listo para tomar forma">
          Crea una versión para documentar los pasos y preparar su tutorial.
        </Empty>
      )}
      {creating && (
        <Modal
          title="Nueva versión"
          close={() => {
            if (!busy) setCreating(false);
          }}
        >
          <ErrorNotice error={error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const v = await api<Version>(
                  `/procedures/${procedure.id}/versions`,
                  json({
                    summary: f.get("summary"),
                    source_session_id: f.get("source") || null,
                  }),
                );
                setCreating(false);
                setSelected(v.id);
                await load();
              });
            }}
          >
            <fieldset disabled={busy}>
              <p className="form-intro">
                Cada versión comienza con sus propios pasos y tutorial.
              </p>
              <label>
                Resumen
                <textarea name="summary" maxLength={10000} />
              </label>
              <label>
                Sesión de origen
                <select name="source">
                  <option value="">Sin sesión vinculada</option>
                  {sessions.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.objective}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary full">
                {busy ? "Creando…" : "Crear borrador"}
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
function VersionEditor({
  api,
  version,
  membership,
  onChange,
  sessions,
}: {
  api: Client;
  version: Version;
  membership: Membership;
  onChange: () => Promise<void>;
  sessions: Session[];
}) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [tutorial, setTutorial] = useState("");
  const [savedTutorial, setSavedTutorial] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceSession, setEvidenceSession] = useState(
    version.source_session_id || "",
  );
  const [editing, setEditing] = useState<Step | "new" | null>(null);
  const [linking, setLinking] = useState<Step | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { busy, error, run } = useAction();
  const path = `/procedure-versions/${version.id}`;
  const canWrite = membership.role === "owner" || membership.role === "author";
  const reviewer =
    membership.role === "owner" || membership.role === "reviewer";
  const editable = version.status === "draft" && canWrite;
  const load = useCallback(async () => {
    const [s, t, e] = await Promise.all([
      api<Step[]>(`${path}/steps`),
      api<{ content: string }>(`${path}/tutorial`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return { content: "" };
        throw e;
      }),
      version.source_session_id && membership.role !== "reader"
        ? api<Evidence[]>(
            `/learning-sessions/${version.source_session_id}/evidence`,
          )
        : Promise.resolve([]),
    ]);
    setSteps(s);
    setTutorial(t.content || "");
    setSavedTutorial(t.content || "");
    setEvidence(e);
    setLoaded(true);
  }, [api, path, version.source_session_id, membership.role]);
  useEffect(() => {
    void run(load);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  async function transition(action: string) {
    await api(`${path}/${action}`, { method: "POST" });
    await onChange();
    setMessage("Estado de la versión actualizado.");
  }
  const ready =
    steps.length > 0 &&
    steps.every((s) => s.validation_status === "confirmed") &&
    !!savedTutorial &&
    tutorial === savedTutorial;
  return (
    <>
      <ErrorNotice error={error} />
      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {!loaded ? (
        <>
          <p role="status">Cargando contenido…</p>
          {error && (
            <button className="secondary" onClick={() => void run(load)}>
              Reintentar
            </button>
          )}
        </>
      ) : (
        <>
          <div className="editor-actions">
            <p>
              {version.summary ||
                "Documenta los pasos, confirma su contenido y prepara el tutorial."}
            </p>
            <div className="button-group">
              {version.status === "draft" && canWrite && (
                <button
                  className="primary"
                  disabled={busy || !ready}
                  onClick={() => void run(() => transition("submit"))}
                >
                  Enviar a revisión
                </button>
              )}
              {version.status === "in_review" && reviewer && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => transition("return"))}
                  >
                    Devolver a borrador
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => transition("approve"))}
                  >
                    Aprobar versión
                  </button>
                </>
              )}
              {version.status === "approved" && reviewer && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void run(() => transition("publish"))}
                >
                  Publicar conocimiento
                </button>
              )}
              {version.status === "published" && reviewer && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setRetiring(true)}
                >
                  Retirar publicación
                </button>
              )}
            </div>
          </div>
          <div className="detail-grid">
            <section className="panel detail-panel">
              <div className="section-heading">
                <div>
                  <h2>Pasos del procedimiento</h2>
                  <p>La secuencia que hace posible el resultado.</p>
                </div>
                {editable && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setEditing("new")}
                  >
                    <Icon name="plus" size={17} />
                    Añadir paso
                  </button>
                )}
              </div>
              {steps.length ? (
                <div className="steps">
                  {steps.map((step) => (
                    <article key={step.id}>
                      <span className="step-number">{step.position}</span>
                      <div>
                        <Badge status={step.validation_status} />
                        <h3>{step.instruction}</h3>
                        <p>{step.expected_result}</p>
                        <small>
                          Origen:{" "}
                          {
                            {
                              observed: "Observado",
                              inferred: "Inferido",
                              user_explained: "Explicado por el usuario",
                            }[step.origin]
                          }
                        </small>
                        {editable && (
                          <div className="button-group">
                            <button
                              className="text-button"
                              onClick={() => setEditing(step)}
                              disabled={busy}
                            >
                              Editar paso
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setLinking(step)}
                              disabled={busy}
                            >
                              Vincular evidencia
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="Un buen proceso empieza con un primer paso">
                  Añade una instrucción y el resultado esperado.
                </Empty>
              )}
            </section>
            <section className="panel detail-panel tutorial-panel">
              <div className="section-heading">
                <div>
                  <h2>Tutorial</h2>
                  <p>La guía que acompañará al procedimiento.</p>
                </div>
                <Icon name="book" />
              </div>
              <div className="tutorial-body">
                {editable ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api(
                          `${path}/tutorial`,
                          json({ content: tutorial }, "PUT"),
                        );
                        setSavedTutorial(tutorial);
                        setMessage("Tutorial guardado.");
                      });
                    }}
                  >
                    <label>
                      Contenido en Markdown
                      <textarea
                        className="markdown-editor"
                        value={tutorial}
                        onChange={(e) => setTutorial(e.target.value)}
                        required
                        maxLength={100000}
                        placeholder={
                          "# Cómo realizar este proceso\n\n## Antes de empezar\n\n## Paso a paso"
                        }
                        disabled={busy}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={
                        busy || !tutorial.trim() || tutorial === savedTutorial
                      }
                    >
                      Guardar tutorial
                    </button>
                    {tutorial !== savedTutorial && (
                      <small className="unsaved">Cambios sin guardar</small>
                    )}
                  </form>
                ) : (
                  <pre className="tutorial-content">
                    {tutorial || "No hay tutorial disponible."}
                  </pre>
                )}
                <p className="editor-hint">
                  Para enviar a revisión, todos los pasos deben estar
                  confirmados y el tutorial guardado. Los pasos observados o
                  inferidos requieren evidencia.
                </p>
              </div>
            </section>
          </div>
        </>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Añadir paso" : "Editar paso"}
          close={() => {
            if (!busy) setEditing(null);
          }}
        >
          <ErrorNotice error={error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api(
                  `${path}/steps${editing === "new" ? "" : `/${editing.id}`}`,
                  json(
                    {
                      position: Number(f.get("position")),
                      instruction: f.get("instruction"),
                      expected_result: f.get("expected_result"),
                      origin: f.get("origin"),
                      validation_status: f.get("validation_status"),
                    },
                    editing === "new" ? "POST" : "PUT",
                  ),
                );
                setEditing(null);
                setSteps(await api<Step[]>(`${path}/steps`));
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Posición
                <input
                  name="position"
                  type="number"
                  min={1}
                  max={10000}
                  required
                  defaultValue={
                    editing === "new"
                      ? Math.max(0, ...steps.map((s) => s.position)) + 1
                      : editing.position
                  }
                />
              </label>
              <label>
                Instrucción
                <textarea
                  name="instruction"
                  maxLength={10000}
                  required
                  defaultValue={editing === "new" ? "" : editing.instruction}
                />
              </label>
              <label>
                Resultado esperado
                <textarea
                  name="expected_result"
                  maxLength={10000}
                  required
                  defaultValue={
                    editing === "new" ? "" : editing.expected_result
                  }
                />
              </label>
              <label>
                Origen
                <select
                  name="origin"
                  defaultValue={
                    editing === "new" ? "user_explained" : editing.origin
                  }
                >
                  <option value="user_explained">
                    Explicado por el usuario
                  </option>
                  <option value="observed">Observado</option>
                  <option value="inferred">Inferido</option>
                </select>
              </label>
              <label>
                Validación
                <select
                  name="validation_status"
                  defaultValue={
                    editing === "new" ? "pending" : editing.validation_status
                  }
                >
                  <option value="pending">Pendiente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="rejected">Rechazado</option>
                </select>
              </label>
              <button className="primary full">Guardar paso</button>
            </fieldset>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal
          title="Vincular evidencia"
          close={() => {
            if (!busy) setLinking(null);
          }}
        >
          <ErrorNotice error={error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api(
                  `${path}/steps/${linking.id}/evidence`,
                  json(
                    {
                      evidence_id: f.get("evidence_id"),
                      explanation: f.get("explanation"),
                    },
                    "PUT",
                  ),
                );
                setLinking(null);
                setMessage("Evidencia vinculada al paso.");
              });
            }}
          >
            <fieldset disabled={busy}>
              {!version.source_session_id && (
                <label>
                  Sesión con evidencias
                  <select
                    value={evidenceSession}
                    onChange={(e) => {
                      const id = e.target.value;
                      setEvidenceSession(id);
                      setEvidence([]);
                      if (id)
                        void run(async () =>
                          setEvidence(
                            await api<Evidence[]>(
                              `/learning-sessions/${id}/evidence`,
                            ),
                          ),
                        );
                    }}
                  >
                    <option value="">Selecciona una sesión</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.objective}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Evidencia de respaldo
                <select name="evidence_id" required>
                  <option value="">Seleccionar captura</option>
                  {evidence.map((e, i) => (
                    <option value={e.id} key={e.id}>
                      Captura {i + 1} · {Math.ceil(e.size_bytes / 1024)} KB
                    </option>
                  ))}
                </select>
              </label>
              {evidenceSession && !evidence.length && (
                <p className="form-intro">
                  La sesión vinculada no tiene capturas.
                </p>
              )}
              <label>
                ¿Qué demuestra?
                <textarea name="explanation" required maxLength={4000} />
              </label>
              <button className="primary full" disabled={!evidence.length}>
                Vincular evidencia
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
      {retiring && (
        <Modal
          title="Retirar publicación"
          close={() => {
            if (!busy) setRetiring(false);
          }}
        >
          <p className="form-intro">
            Esta versión dejará de aparecer en la búsqueda y ya no estará
            disponible para los lectores.
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await transition("retire");
                setRetiring(false);
              })
            }
          >
            Confirmar retiro
          </button>
          <ErrorNotice error={error} />
        </Modal>
      )}
    </>
  );
}
