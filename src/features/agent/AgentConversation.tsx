import VoiceInput from "../../shared/VoiceInput";
import { useEffect, useRef, useState } from "react";
import { allPages, ApiError, json } from "../../shared/api";
import type { Client, Clarification, Event, Session } from "../../shared/api";
import { ErrorNotice, Icon } from "../../shared/ui";
import { useAction } from "../../shared/utils";
import LiveAgent from "./LiveAgent";
import type { CaptureState } from "../capture/screenCapture";
export default function AgentConversation({
  api,
  session,
  writable,
  onContextChange,
  capture,
  canAnswer = writable,
}: {
  api: Client;
  session: Session;
  writable: boolean;
  onContextChange: () => Promise<void>;
  capture?: CaptureState;
  canAnswer?: boolean;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [questions, setQuestions] = useState<Clarification[]>([]);
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"conversation" | "questions">("conversation");
  const [connection, setConnection] = useState("Cargando contexto…");
  const [refreshKey, setRefreshKey] = useState(0);
  const { run, busy, error } = useAction();
  const pending = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let stopped = false;
    async function load() {
      try {
        const [messages, qs] = await Promise.all([
          allPages<Event>(api, `/learning-sessions/${session.id}/events`),
          api<Clarification[]>(
            `/learning-sessions/${session.id}/clarifications`,
          ),
        ]);
        if (active) {
          setEvents(messages);
          setQuestions(qs);
          setConnection("Contexto sincronizado");
          failures = 0;
        }
      } catch (e) {
        failures++;
        stopped = e instanceof ApiError && [401, 403, 404].includes(e.status);
        if (active) setConnection("Sin sincronizar · Reintenta");
      } finally {
        if (active && !stopped && session.status === "capturing")
          timer = setTimeout(load, Math.min(30000, 8000 * 2 ** failures));
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, session.id, session.status, refreshKey]);
  const unresolved = questions.filter((q) => !q.answer);
  return (
    <aside className="agent-companion conversation-panel">
      <div className="agent-heading">
        <span className="agent-symbol">
          <Icon name="spark" size={24} />
        </span>
        <div>
          <h3>Agente de aprendizaje</h3>
          <span>Contexto y preguntas de la sesión</span>
        </div>
      </div>
      <span className="agent-status">
        <i />
        Conversación en vivo y contexto del aprendizaje
      </span>
      <LiveAgent
        api={api}
        sessionId={session.id}
        allowed={writable}
        capture={capture}
        onReply={onContextChange}
      />
      <div
        className="conversation-tabs"
        role="tablist"
        aria-label="Contexto del agente"
      >
        <button
          role="tab"
          aria-selected={tab === "conversation"}
          onClick={() => setTab("conversation")}
        >
          Conversación
        </button>
        <button
          role="tab"
          aria-selected={tab === "questions"}
          onClick={() => setTab("questions")}
        >
          Preguntas <span>{unresolved.length}</span>
        </button>
      </div>
      <div
        className="conversation-history"
        role="tabpanel"
        aria-label={tab === "conversation" ? "Conversación" : "Preguntas"}
      >
        {tab === "conversation" ? (
          events.length ? (
            events.map((e) => (
              <article className="chat-note" key={e.id}>
                <small>Contexto guardado</small>
                <p>{e.payload.text}</p>
              </article>
            ))
          ) : (
            <div className="chat-empty">
              <Icon name="spark" size={26} />
              <p>
                Explica qué estás haciendo y por qué. Aquí aparecerá el contexto
                que guardes.
              </p>
            </div>
          )
        ) : questions.length ? (
          questions.map((q) => (
            <article className="chat-question" key={q.id}>
              <small>{q.answer ? "Resuelta" : "Respuesta pendiente"}</small>
              <h4>{q.question}</h4>
              {q.answer ? (
                <p>{q.answer}</p>
              ) : canAnswer ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const answer = new FormData(e.currentTarget).get("answer");
                    void run(async () => {
                      const updated = await api<Clarification>(
                        `/learning-sessions/${session.id}/clarifications/${q.id}/answer`,
                        json({ answer }, "PUT"),
                      );
                      setQuestions((items) =>
                        items.map((item) =>
                          item.id === updated.id ? updated : item,
                        ),
                      );
                      setRefreshKey((key) => key + 1);
                      await onContextChange();
                    });
                  }}
                >
                  <VoiceInput
                    question={q.question}
                    name="answer"
                    value={answers[q.id] || ""}
                    disabled={busy}
                    onChange={(value) =>
                      setAnswers((previous) => ({ ...previous, [q.id]: value }))
                    }
                  />
                  <button className="secondary" disabled={busy}>
                    Responder
                  </button>
                </form>
              ) : (
                <p>
                  La sesión está cerrada o no tienes permiso para responder.
                </p>
              )}
            </article>
          ))
        ) : (
          <div className="chat-empty">
            <Icon name="check" size={25} />
            <p>No hay preguntas pendientes.</p>
          </div>
        )}
      </div>
      <ErrorNotice error={error} />
      {tab === "conversation" && (
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!pending.current || pending.current.text !== text.trim()) {
                const latest = await allPages<Event>(
                  api,
                  `/learning-sessions/${session.id}/events`,
                );
                pending.current = {
                  text: text.trim(),
                  event_type: "message",
                  sequence_number:
                    Math.max(
                      -1,
                      ...latest.map((item) => item.sequence_number),
                    ) + 1,
                  offset_ms: Math.max(
                    0,
                    Date.now() - new Date(session.created_at).getTime(),
                  ),
                  idempotency_key: crypto.randomUUID(),
                };
              }
              const saved = await api<Event>(
                `/learning-sessions/${session.id}/events`,
                json(pending.current),
              );
              pending.current = null;
              setEvents((items) =>
                items.some((e) => e.id === saved.id)
                  ? items
                  : [...items, saved],
              );
              setText("");
              setRefreshKey((key) => key + 1);
              await onContextChange();
            });
          }}
        >
          <label>
            Mensaje de contexto
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!writable || busy}
              maxLength={20000}
              placeholder={
                writable
                  ? "Describe el paso o deja una observación…"
                  : "Conversación de solo lectura"
              }
              required
            />
          </label>
          <button
            className="primary"
            disabled={!writable || busy || !text.trim()}
          >
            <Icon name="arrow" size={15} />
            {busy ? "Guardando…" : "Guardar mensaje"}
          </button>
        </form>
      )}
      <div className="chat-sync">
        <span>{connection}</span>
        <button
          className="text-button"
          onClick={() => setRefreshKey((key) => key + 1)}
          aria-label="Sincronizar conversación"
        >
          Actualizar
        </button>
      </div>
    </aside>
  );
}
