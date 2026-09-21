import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { confirmAction } from "../../shared/confirmAction";
import { date, useAction } from "../../shared/utils";
import { Badge, Empty, ErrorNotice, Icon } from "../../shared/ui";
import { uploadPolicy } from "./policyUpload";
import type { PolicyAnswer, PolicyDocument } from "./policyUpload";
import type { Transfer } from "../recordings/recordings";
import "../chatbot/Chatbot.css";
import "./Policies.css";

const SUGGESTED_QUESTIONS = [
  "¿Qué cubre esta póliza?",
  "¿Cuál es la vigencia?",
  "¿Qué exclusiones tiene?",
];
function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
type Turn = {
  id: string;
  question: string;
  status: "pending" | "answered" | "gap" | "error";
  answer?: string;
  citationLabel?: string;
  error?: string;
};
export default function Policies({
  api,
  canManage,
  onFocusChange,
}: {
  api: Client;
  canManage: boolean;
  onFocusChange?: (focus: { id: string; title: string } | null) => void;
}) {
  const [items, setItems] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"documents" | "ask">("documents");
  const [upload, setUpload] = useState<{
    name: string;
    stage: string;
    percent: number;
  } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();
  const load = useCallback(async () => {
    const list = await api<PolicyDocument[]>("/policies");
    setItems(list);
    setLoading(false);
  }, [api]);
  useEffect(() => {
    void run(load);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = items.filter((p) =>
    (p.title || "documento sin título")
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const selected = items.find((p) => p.id === selectedId) || null;
  useEffect(() => {
    onFocusChange?.(
      selected ? { id: selected.id, title: selected.title || "Documento sin título" } : null,
    );
    return () => onFocusChange?.(null);
  }, [selected, onFocusChange]);
  useEffect(() => {
    setViewerUrl("");
    if (!selected || selected.status !== "ready") return;
    let cancelled = false;
    setViewerLoading(true);
    api<Transfer>(`/policies/${selected.id}/view`)
      .then((transfer) => {
        if (!cancelled) setViewerUrl(transfer.url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setViewerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);
  async function pickFile(file: File) {
    const controller = new AbortController();
    setUpload({ name: file.name, stage: "Preparando", percent: 0 });
    try {
      const saved = await uploadPolicy(
        api,
        file,
        (percent) => setUpload((u) => (u ? { ...u, percent } : u)),
        (stage) => setUpload((u) => (u ? { ...u, stage } : u)),
        controller.signal,
      );
      setItems((list) => [saved, ...list.filter((p) => p.id !== saved.id)]);
      setUpload(null);
    } catch (e) {
      setUpload(null);
      window.alert(
        e instanceof ApiError ? e.message : "No se pudo subir el documento.",
      );
    }
  }
  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    const id = crypto.randomUUID();
    setAsking(true);
    setQuestion("");
    setTurns((t) => [...t, { id, question: trimmed, status: "pending" }]);
    try {
      const result = await api<PolicyAnswer>(
        "/policies/ask",
        json({ question: trimmed, policy_id: selectedId || null }),
      );
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? result.gap_detected
              ? { ...turn, status: "gap" }
              : {
                  ...turn,
                  status: "answered",
                  answer: result.answer ?? "",
                  citationLabel: result.citation
                    ? `${result.citation.policy_title} · ${result.citation.label}`
                    : undefined,
                }
            : turn,
        ),
      );
    } catch (e) {
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                status: "error",
                error:
                  e instanceof ApiError
                    ? e.message
                    : "No se pudo enviar la pregunta.",
              }
            : turn,
        ),
      );
    } finally {
      setAsking(false);
    }
  }
  const documentsTab = (
    <div className="policies-list">
      <div className="policies-toolbar">
        <input
          className="filter"
          aria-label="Buscar por título"
          placeholder="Buscar por título…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {canManage && (
          <div className="policies-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{ discovered: number }>(
                    "/policies/sync",
                    { method: "POST" },
                  );
                  await load();
                  window.alert(
                    result.discovered
                      ? `Se encontraron ${result.discovered} documento(s) nuevos en el almacenamiento.`
                      : "No hay documentos nuevos en el almacenamiento.",
                  );
                })
              }
            >
              <Icon name="upload" size={15} />
              Sincronizar carpeta
            </button>
            <button
              className="primary"
              disabled={!!upload}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="plus" size={16} />
              Subir póliza
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void pickFile(file);
              }}
            />
          </div>
        )}
      </div>
      {upload && (
        <div className="policies-upload-progress">
          <p>
            {upload.name} · {upload.stage}
          </p>
          <div className="policies-progress-track">
            <span style={{ width: `${upload.percent}%` }} />
          </div>
        </div>
      )}
      <ErrorNotice error={error} />
      {error && loading && (
        <button className="secondary" onClick={() => void run(load)}>
          Reintentar carga
        </button>
      )}
      {loading ? (
        <div className="loading" role="status">
          Cargando documentos…
        </div>
      ) : (
        <div className="policies-items">
          <button
            className={!selectedId ? "policy-item active" : "policy-item"}
            onClick={() => {
              setSelectedId("");
              setTab("ask");
            }}
          >
            <div>
              <h3>Todos los documentos</h3>
              <p>{items.length} en total</p>
            </div>
          </button>
          {visible.map((p) => (
            <button
              key={p.id}
              className={
                selectedId === p.id ? "policy-item active" : "policy-item"
              }
              onClick={() => {
                setSelectedId(p.id);
                setTab("ask");
              }}
            >
              <div>
                <h3>{p.title || "Documento sin título"}</h3>
                <p>
                  {formatSize(p.size_bytes)} · {date(p.created_at)}
                  {p.status === "failed" && p.error_code
                    ? ` · ${p.error_code}`
                    : ""}
                </p>
              </div>
              <Badge status={p.status} />
            </button>
          ))}
          {!visible.length && (
            <Empty
              title={filter ? "Sin coincidencias" : "Todavía no hay documentos"}
              icon="shield"
            >
              {filter
                ? "Prueba con otro título."
                : "Sube una póliza o sincroniza tu carpeta de almacenamiento."}
            </Empty>
          )}
        </div>
      )}
    </div>
  );
  return (
    <div className="policies-layout">
      <section className="policies-viewer">
        {selected ? (
          <>
            <div className="policy-detail-head">
              <div>
                <h2>{selected.title || "Documento sin título"}</h2>
                <p>
                  {formatSize(selected.size_bytes)} ·{" "}
                  {date(selected.created_at)}
                </p>
              </div>
              <div className="policy-detail-actions">
                {viewerUrl && (
                  <button
                    className="secondary"
                    onClick={() =>
                      window.open(viewerUrl, "_blank", "noopener")
                    }
                  >
                    Abrir en pestaña nueva
                  </button>
                )}
                {canManage && selected.status === "failed" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const updated = await api<PolicyDocument>(
                          `/policies/${selected.id}/retry`,
                          { method: "POST" },
                        );
                        setItems((list) =>
                          list.map((p) => (p.id === updated.id ? updated : p)),
                        );
                      })
                    }
                  >
                    Reintentar
                  </button>
                )}
                {canManage &&
                  (selected.status === "ready" ||
                    selected.status === "failed") && (
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (
                            !(await confirmAction(
                              "El documento dejará de responder preguntas del analizador. Puedes seguir viéndolo, pero no reintentarlo.",
                              "Retirar documento",
                              "Retirar",
                            ))
                          )
                            return;
                          const updated = await api<PolicyDocument>(
                            `/policies/${selected.id}/retire`,
                            { method: "POST" },
                          );
                          setItems((list) =>
                            list.map((p) => (p.id === updated.id ? updated : p)),
                          );
                        })
                      }
                    >
                      Retirar
                    </button>
                  )}
              </div>
            </div>
            <div className="policy-viewer-body">
              {viewerLoading ? (
                <p className="muted inset">Cargando documento…</p>
              ) : viewerUrl ? (
                <iframe
                  className="policy-viewer-frame"
                  src={viewerUrl}
                  title={selected.title || "Visor de póliza"}
                />
              ) : (
                <Empty
                  title={
                    selected.status === "failed"
                      ? "No se pudo leer este documento"
                      : selected.status === "uploading"
                        ? "El documento se está subiendo"
                        : "El documento se está analizando"
                  }
                  icon="shield"
                >
                  {selected.status === "failed"
                    ? "Reintenta el análisis o retira el documento."
                    : "El visor estará disponible cuando termine el análisis."}
                </Empty>
              )}
            </div>
          </>
        ) : (
          <Empty title="Selecciona un documento" icon="shield">
            Elige una póliza de la lista para verla aquí y preguntarle al
            panel de IA.
          </Empty>
        )}
      </section>
      <section className="policies-side">
        <div className="policies-tabs" role="tablist" aria-label="Panel de pólizas">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "documents"}
            onClick={() => setTab("documents")}
          >
            <Icon name="shield" size={14} />
            Documentos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ask"}
            onClick={() => setTab("ask")}
          >
            <Icon name="message" size={14} />
            Preguntar
          </button>
        </div>
        {tab === "documents" ? (
          documentsTab
        ) : (
          <div className="policies-detail">
            <div className="policies-detail-head">
              <h2>Panel IA</h2>
              <p className="muted">
                {selected
                  ? "Responde sobre el documento seleccionado."
                  : "Responde sobre toda la biblioteca analizada."}
              </p>
            </div>
            <div className="chat-scroll policies-ask-scroll">
          {turns.length === 0 && (
            <div className="chat-empty">
              <span className="empty-icon">
                <Icon name="shield" size={26} />
              </span>
              <h3>Pregunta sobre esta póliza</h3>
              <p>
                O deja "Todos los documentos" para buscar en toda la
                biblioteca analizada.
              </p>
              <div className="search-chips">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    type="button"
                    key={q}
                    className="chip"
                    disabled={asking}
                    onClick={() => void ask(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className="chat-thread">
              <div className="chat-row user">
                <div className="chat-bubble user">{t.question}</div>
              </div>
              <div className="chat-row ai">
                <span className="chat-avatar ai">IA</span>
                {t.status === "pending" && (
                  <div className="chat-bubble ai pending">Pensando…</div>
                )}
                {t.status === "answered" && (
                  <div className="chat-bubble ai">
                    {t.answer}
                    {t.citationLabel && (
                      <span className="chat-citation">
                        <Icon name="book" size={12} />
                        {t.citationLabel}
                      </span>
                    )}
                  </div>
                )}
                {t.status === "gap" && (
                  <div className="chat-bubble ai gap">
                    <span className="gap-flag">VACÍO DETECTADO</span>
                    <p>
                      No encontré una cláusula que respalde esta respuesta. La
                      dejé en el tablero de vacíos de conocimiento.
                    </p>
                  </div>
                )}
                {t.status === "error" && (
                  <div className="chat-bubble ai error">{t.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            aria-label="Pregunta sobre esta póliza"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pregunta sobre esta póliza, o arrastra un PDF para analizarlo…"
            maxLength={1200}
            disabled={asking}
          />
              <button className="primary" disabled={asking || !question.trim()}>
                {asking ? "Enviando…" : "Preguntar"}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
