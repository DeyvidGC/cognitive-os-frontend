import { useEffect, useRef, useState } from "react";
import { ApiError, json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { Icon } from "../../shared/ui";
import "../chatbot/Chatbot.css";
import "./FloatingAssistant.css";

export type AssistantContext =
  | { kind: "policy"; id: string; title: string }
  | { kind: "policies" }
  | { kind: "session"; id: string; title: string }
  | { kind: "procedure"; id: string; title: string }
  | { kind: "general" };

type Turn = {
  id: string;
  question: string;
  status: "pending" | "answered" | "gap" | "error";
  answer?: string;
  citation?: string;
  error?: string;
};
type Answer = {
  gap_detected: boolean;
  answer: string | null;
  citation: { label: string; policy_title?: string; session_objective?: string | null } | null;
};

function contextKey(context: AssistantContext) {
  return "id" in context ? `${context.kind}:${context.id}` : context.kind;
}
function contextLabel(context: AssistantContext) {
  switch (context.kind) {
    case "policy":
      return context.title;
    case "session":
      return context.title;
    case "procedure":
      return context.title;
    case "policies":
      return "Pólizas de la biblioteca";
    default:
      return "Lo que tu equipo enseñó";
  }
}
function contextHint(context: AssistantContext) {
  switch (context.kind) {
    case "policy":
      return "Responde solo sobre este documento.";
    case "session":
      return "Responde con procedimientos publicados; esta sesión aún no forma parte del conocimiento hasta que se publique.";
    case "procedure":
      return "Responde con lo publicado sobre este procedimiento.";
    case "policies":
      return "Responde sobre toda la biblioteca de pólizas analizada.";
    default:
      return "Responde con lo publicado. Nada fuera de eso.";
  }
}
function placeholderFor(context: AssistantContext) {
  switch (context.kind) {
    case "policy":
      return "Pregunta sobre esta póliza…";
    case "policies":
      return "Pregunta sobre una póliza…";
    case "session":
      return "Pregunta sobre este proceso…";
    case "procedure":
      return "Pregunta sobre este procedimiento…";
    default:
      return "Pregunta lo que necesites saber…";
  }
}

export default function FloatingAssistant({
  api,
  context,
  userInitials,
}: {
  api: Client;
  context: AssistantContext;
  userInitials: string;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = contextKey(context);
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setTurns([]);
    }
  }, [key]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, open]);
  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const id = crypto.randomUUID();
    setSending(true);
    setQuestion("");
    setTurns((t) => [...t, { id, question: trimmed, status: "pending" }]);
    try {
      const result =
        context.kind === "policy" || context.kind === "policies"
          ? await api<Answer>(
              "/policies/ask",
              json({
                question: trimmed,
                policy_id: context.kind === "policy" ? context.id : null,
              }),
            )
          : await api<Answer>("/chatbot/ask", json({ question: trimmed }));
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? result.gap_detected
              ? { ...turn, status: "gap" }
              : {
                  ...turn,
                  status: "answered",
                  answer: result.answer ?? "",
                  citation: result.citation
                    ? [result.citation.policy_title, result.citation.session_objective, result.citation.label]
                        .filter(Boolean)
                        .join(" · ")
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
                error: e instanceof ApiError ? e.message : "No se pudo enviar la pregunta.",
              }
            : turn,
        ),
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="floating-assistant">
      {open && (
        <section className="floating-assistant-panel" role="dialog" aria-label="Asistente">
          <header>
            <div>
              <span className="floating-assistant-eyebrow">Asistente · {contextLabel(context)}</span>
              <h2>Pregúntame lo que tengas delante</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Cerrar asistente" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <div className="chat-scroll floating-assistant-scroll" ref={scrollRef}>
            {turns.length === 0 && (
              <div className="chat-empty">
                <span className="empty-icon">
                  <Icon name="spark" size={22} />
                </span>
                <h3>{contextLabel(context)}</h3>
                <p>{contextHint(context)}</p>
              </div>
            )}
            {turns.map((t) => (
              <div key={t.id} className="chat-thread">
                <div className="chat-row user">
                  <div className="chat-bubble user">{t.question}</div>
                  <span className="chat-avatar">{userInitials}</span>
                </div>
                <div className="chat-row ai">
                  <span className="chat-avatar ai">
                    <Icon name="spark" size={13} />
                  </span>
                  {t.status === "pending" && <div className="chat-bubble ai pending">Pensando…</div>}
                  {t.status === "answered" && (
                    <div className="chat-bubble ai">
                      {t.answer}
                      {t.citation && (
                        <span className="chat-citation">
                          <Icon name="book" size={12} />
                          {t.citation}
                        </span>
                      )}
                    </div>
                  )}
                  {t.status === "gap" && (
                    <div className="chat-bubble ai gap">
                      <span className="gap-flag">VACÍO DETECTADO</span>
                      <p>No encontré respaldo publicado para esto. Quedó registrado como un vacío de conocimiento.</p>
                    </div>
                  )}
                  {t.status === "error" && <div className="chat-bubble ai error">{t.error}</div>}
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
              aria-label="Escribe tu pregunta"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={placeholderFor(context)}
              maxLength={1200}
              disabled={sending}
              autoFocus
            />
            <button className="primary" disabled={sending || !question.trim()} aria-label="Preguntar">
              <Icon name="arrow" size={16} />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="floating-assistant-launch"
        aria-expanded={open}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <span aria-hidden="true">×</span> : <Icon name="spark" size={21} />}
      </button>
    </div>
  );
}
