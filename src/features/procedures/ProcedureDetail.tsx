import { useAction } from "../../shared/utils";
import { useCallback, useEffect, useState } from "react";
import { allPages, ApiError, json } from "../../shared/api";
import type {
  Client,
  Evidence,
  Membership,
  Procedure,
  Session,
  Step,
  Version,
} from "../../shared/api";
import {
  Badge,
  Empty,
  ErrorNotice,
  Icon,
  KnowledgeChip,
  Modal,
  Select,
  StateBar,
} from "../../shared/ui";
export default function ProcedureDetail({
  api,
  procedure,
  membership,
  sessions,
  initialVersion = "",
}: {
  api: Client;
  procedure: Procedure;
  membership: Membership;
  sessions: Session[];
  initialVersion?: string;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState(initialVersion);
  const [creating, setCreating] = useState(false);
  const [newVersionSource, setNewVersionSource] = useState("");
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useAction();
  const canWrite = membership.role === "owner" || membership.role === "author";
  const load = useCallback(async () => {
    const items = await allPages<Version>(
      api,
      `/procedures/${procedure.id}/versions`,
    );
    setVersions(items);
    setSelected((id) =>
      items.some((item) => item.id === id) ? id : items[0]?.id || "",
    );
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
          <button
            className="primary"
            onClick={() => {
              setNewVersionSource("");
              setCreating(true);
            }}
          >
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
              <Select
                ariaLabel="Versión"
                value={selected}
                onChange={setSelected}
                options={versions.map((v) => ({
                  value: v.id,
                  label: `Versión ${v.version_number}`,
                }))}
              />
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
                    source_session_id: newVersionSource || null,
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
                <Select
                  ariaLabel="Sesión de origen"
                  value={newVersionSource}
                  onChange={setNewVersionSource}
                  options={[
                    { value: "", label: "Sin sesión vinculada" },
                    ...sessions.map((s) => ({ value: s.id, label: s.objective })),
                  ]}
                />
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
  const [stepView, setStepView] = useState<"carousel" | "list">("carousel");
  const [stepIndex, setStepIndex] = useState(0);
  const [tutorial, setTutorial] = useState("");
  const [savedTutorial, setSavedTutorial] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceSession, setEvidenceSession] = useState(
    version.source_session_id || "",
  );
  const [editing, setEditing] = useState<Step | "new" | null>(null);
  // Reset the pickers during render (not an effect) whenever a different
  // step opens for editing, matching React's guidance for state that mirrors
  // a changed identity: https://react.dev/learn/you-might-not-need-an-effect
  const [editingFor, setEditingFor] = useState<Step | "new" | null>(null);
  const [stepOrigin, setStepOrigin] = useState("user_explained");
  const [stepValidation, setStepValidation] = useState("pending");
  if (editing !== editingFor) {
    setEditingFor(editing);
    setStepOrigin(
      editing === "new" || !editing ? "user_explained" : editing.origin,
    );
    setStepValidation(
      editing === "new" || !editing ? "pending" : editing.validation_status,
    );
  }
  const [linking, setLinking] = useState<Step | null>(null);
  const [evidencePickerFor, setEvidencePickerFor] = useState<{
    linking: Step | null;
    evidenceSession: string;
  } | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState("");
  if (
    !evidencePickerFor ||
    evidencePickerFor.linking !== linking ||
    evidencePickerFor.evidenceSession !== evidenceSession
  ) {
    setEvidencePickerFor({ linking, evidenceSession });
    setSelectedEvidence("");
  }
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
    setStepIndex((i) => Math.max(0, Math.min(i, s.length - 1)));
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
  const orderedSteps = [...steps].sort((a, b) => a.position - b.position);
  const activeStep = orderedSteps[Math.min(stepIndex, orderedSteps.length - 1)];
  const originLabel = (origin: string) =>
    ({
      observed: "Observado durante la captura",
      inferred: "Deducido por el análisis",
      user_explained: "Explicado por el autor",
    })[origin];
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
                  <StateBar steps={steps} />
                </div>
                <div className="button-group">
                  {steps.length > 0 && (
                    <div className="mode-switch" role="group" aria-label="Vista de pasos">
                      <button
                        type="button"
                        aria-selected={stepView === "carousel"}
                        onClick={() => setStepView("carousel")}
                      >
                        Carrusel
                      </button>
                      <button
                        type="button"
                        aria-selected={stepView === "list"}
                        onClick={() => setStepView("list")}
                      >
                        Ver lista completa
                      </button>
                    </div>
                  )}
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
              </div>
              {steps.length ? (
                stepView === "carousel" ? (
                  <div className="step-carousel">
                    <div className="step-carousel-head">
                      <button
                        type="button"
                        className="step-nav"
                        aria-label="Paso anterior"
                        disabled={stepIndex === 0}
                        onClick={() => setStepIndex((i) => i - 1)}
                      >
                        <Icon name="arrow" size={16} />
                      </button>
                      <div
                        className="step-dots"
                        role="tablist"
                        aria-label="Pasos del procedimiento"
                      >
                        {orderedSteps.map((s, i) => (
                          <button
                            type="button"
                            key={s.id}
                            role="tab"
                            aria-selected={i === stepIndex}
                            className={
                              i === stepIndex
                                ? "step-dot active"
                                : s.validation_status !== "confirmed"
                                  ? "step-dot pending"
                                  : "step-dot"
                            }
                            onClick={() => setStepIndex(i)}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="step-nav next"
                        aria-label="Paso siguiente"
                        disabled={stepIndex >= orderedSteps.length - 1}
                        onClick={() => setStepIndex((i) => i + 1)}
                      >
                        <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    <p className="step-count">
                      Paso {stepIndex + 1} de {orderedSteps.length}
                    </p>
                    {activeStep && (
                      <article className="step-card">
                        <span className="step-number">{activeStep.position}</span>
                        <div>
                          <KnowledgeChip
                            origin={activeStep.origin}
                            validation={activeStep.validation_status}
                          />
                          <h4>{activeStep.instruction}</h4>
                          <p>{activeStep.expected_result}</p>
                          <small>{originLabel(activeStep.origin)}</small>
                          {editable && (
                            <div className="button-group">
                              <button
                                className="text-button"
                                onClick={() => setEditing(activeStep)}
                                disabled={busy}
                              >
                                Editar paso
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setLinking(activeStep)}
                                disabled={busy}
                              >
                                Vincular evidencia
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    )}
                  </div>
                ) : (
                  <div className="steps">
                    {orderedSteps.map((step) => (
                      <article key={step.id}>
                        <span className="step-number">{step.position}</span>
                        <div>
                          <KnowledgeChip
                            origin={step.origin}
                            validation={step.validation_status}
                          />
                          <h3>{step.instruction}</h3>
                          <p>{step.expected_result}</p>
                          <small>{originLabel(step.origin)}</small>
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
                )
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
                <Select
                  name="origin"
                  ariaLabel="Origen"
                  value={stepOrigin}
                  onChange={setStepOrigin}
                  options={[
                    { value: "user_explained", label: "Explicado por el usuario" },
                    { value: "observed", label: "Observado" },
                    { value: "inferred", label: "Inferido" },
                  ]}
                />
              </label>
              <label>
                Validación
                <Select
                  name="validation_status"
                  ariaLabel="Validación"
                  value={stepValidation}
                  onChange={setStepValidation}
                  options={[
                    { value: "pending", label: "Pendiente" },
                    { value: "confirmed", label: "Confirmado" },
                    { value: "rejected", label: "Rechazado" },
                  ]}
                />
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
                if (!selectedEvidence)
                  throw new Error("Selecciona una captura de evidencia.");
                await api(
                  `${path}/steps/${linking.id}/evidence`,
                  json(
                    {
                      evidence_id: selectedEvidence,
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
                  <Select
                    ariaLabel="Sesión con evidencias"
                    value={evidenceSession}
                    onChange={(id) => {
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
                    options={[
                      { value: "", label: "Selecciona una sesión" },
                      ...sessions.map((s) => ({ value: s.id, label: s.objective })),
                    ]}
                  />
                </label>
              )}
              <label>
                Evidencia de respaldo
                <Select
                  name="evidence_id"
                  ariaLabel="Evidencia de respaldo"
                  value={selectedEvidence}
                  onChange={setSelectedEvidence}
                  options={[
                    { value: "", label: "Seleccionar captura" },
                    ...evidence.map((e, i) => ({
                      value: e.id,
                      label: `Captura ${i + 1} · ${Math.ceil(e.size_bytes / 1024)} KB`,
                    })),
                  ]}
                />
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
