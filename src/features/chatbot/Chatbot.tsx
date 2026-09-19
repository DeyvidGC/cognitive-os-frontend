import { useEffect, useRef, useState } from "react";
import { ApiError, json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { Icon } from "../../shared/ui";
import type { ChatAnswer, ChatHistoryEntry, ChatTurn } from "./types";
import "./Chatbot.css";

export default function Chatbot({
  api,
  userInitials,
}: {
  api: Client;
  userInitials: string;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<ChatHistoryEntry[]>("/chatbot/history?limit=20")
      .then(setHistory)
      .catch(() => {});
  }, [api]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);
  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const id = crypto.randomUUID();
    setSending(true);
    setQuestion("");
    setTurns((t) => [...t, { id, question: trimmed, status: "pending" }]);
    try {
      const result = await api<ChatAnswer>(
        "/chatbot/ask",
        json({ question: trimmed }),
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
                  citation: result.citation ?? undefined,
                }
            : turn,
        ),
      );
      setHistory((h) => [
        {
          id,
          question: trimmed,
          answered: !result.gap_detected,
          session_objective: result.citation?.session_objective ?? null,
          recording_id: result.citation?.recording_id ?? null,
          policy_id: null,
          created_at: new Date().toISOString(),
        },
        ...h,
      ]);
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
      setSending(false);
    }
  }
  return (
    <div className="chat-layout">
      <section className="chat-panel">
        <div className="chat-scroll" ref={scrollRef}>
          {turns.length === 0 && (
            <div className="chat-empty">
              <span className="empty-icon">
                <Icon name="message" size={26} />
              </span>
              <h3>Pregunta lo que necesites saber</h3>
              <p>
                Responde con lo aprendido en sesiones y procedimientos
                publicados, citando siempre su fuente.
              </p>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className="chat-thread">
              <div className="chat-row user">
                <div className="chat-bubble user">{t.question}</div>
                <span className="chat-avatar">{userInitials}</span>
              </div>
              <div className="chat-row ai">
                <span className="chat-avatar ai">IA</span>
                {t.status === "pending" && (
                  <div className="chat-bubble ai pending">Pensando…</div>
                )}
                {t.status === "answered" && (
                  <div className="chat-bubble ai">
                    {t.answer}
                    {t.citation && (
                      <span className="chat-citation">
                        <Icon name="book" size={12} />
                        {t.citation.session_objective ||
                          "Procedimiento publicado"}{" "}
                        · {t.citation.label}
                      </span>
                    )}
                  </div>
                )}
                {t.status === "gap" && (
                  <div className="chat-bubble ai gap">
                    <span className="gap-flag">VACÍO DETECTADO</span>
                    <p>
                      No encontré una regla enseñada para ese caso. Lo dejé en
                      el tablero de vacíos de conocimiento para que alguien lo
                      enseñe en la próxima sesión.
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
            aria-label="Escribe tu pregunta"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escribe tu pregunta sobre procesos o procedimientos…"
            maxLength={1200}
            disabled={sending}
          />
          <button className="primary" disabled={sending || !question.trim()}>
            {sending ? "Enviando…" : "Preguntar"}
          </button>
        </form>
        <small className="chat-hint">
          El chatbot solo usa conocimiento publicado y vigente. Si no hay
          respaldo, lo dice y lo registra como vacío.
        </small>
      </section>
      <aside className="chat-sidebar">
        <h2>Preguntas recientes</h2>
        <p className="muted">De tu equipo, en esta organización.</p>
        {history.length ? (
          <ul className="chat-history-list">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  className="chat-history-item"
                  onClick={() => void ask(h.question)}
                  disabled={sending}
                >
                  <span className={h.answered ? "chat-dot ok" : "chat-dot gap"} />
                  {h.question}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no se ha hecho ninguna pregunta.</p>
        )}
      </aside>
    </div>
  );
}
