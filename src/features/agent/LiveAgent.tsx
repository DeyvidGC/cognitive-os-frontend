import { useEffect, useRef, useState } from "react";
import { allPages, ApiError } from "../../shared/api";
import type { Client } from "../../shared/api";
import type { CaptureState } from "../capture/screenCapture";
import { ErrorNotice } from "../../shared/ui";
import VoiceInput from "../../shared/VoiceInput";

type Reply = { observation: string; answer: string; questions: string[] };
type Turn = {
  message_id: string;
  text: string;
  reply: Reply | null;
  status: string;
};
type Input = {
  type: "message" | "observe";
  message_id: string;
  text: string;
  image_base64?: string;
};

export default function LiveAgent({
  api,
  sessionId,
  allowed,
  capture,
  onReply,
}: {
  api: Client;
  sessionId: string;
  allowed: boolean;
  capture?: CaptureState;
  onReply: () => Promise<void>;
}) {
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("Desconectado");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [retry, setRetry] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [readQuestions, setReadQuestions] = useState(false);
  const readQuestionsRef = useRef(false);
  const [interruption, setInterruption] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<Input | null>(null);
  const minInterval = useRef(3000);
  const lastSent = useRef(0);
  const cooling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const canSend =
    allowed &&
    !!capture?.stream &&
    capture.phase !== "paused" &&
    capture.phase !== "stopping";

  useEffect(() => {
    let active = true;
    allPages<Turn>(api, `/learning-sessions/${sessionId}/agent/messages`)
      .then((items) => {
        if (active) setTurns(items);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo recuperar la conversación.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, sessionId, historyKey]);
  useEffect(
    () => () => {
      generation.current++;
      if (socket.current) {
        socket.current.onclose = null;
        socket.current.onmessage = null;
        socket.current.onerror = null;
        socket.current.close();
      }
      clearTimeout(cooling.current);
      clearTimeout(timeout.current);
      pending.current = null;
      window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!canSend || (capture && !capture.stream)) {
      generation.current++;
      socket.current?.close();
      window.speechSynthesis?.cancel();
    }
  }, [canSend, capture?.stream, capture]);

  function disconnect() {
    window.speechSynthesis?.cancel();
    generation.current++;
    socket.current?.close();
    setConnected(false);
    setBusy(false);
    clearTimeout(timeout.current);
    setStatus("Desconectado");
  }
  function connect() {
    if (!consent || !canSend) return;
    disconnect();
    setError("");
    setStatus("Conectando…");
    const ws = api.agentSocket(sessionId);
    socket.current = ws;
    timeout.current = setTimeout(() => {
      if (socket.current === ws) {
        ws.close();
        setError("La conexión tardó demasiado. Puedes volver a conectar.");
      }
    }, 20000);
    ws.onmessage = (event) => {
      if (socket.current !== ws) return;
      try {
        const result = JSON.parse(event.data);
        if (result.type === "ready") {
          clearTimeout(timeout.current);
          minInterval.current = Math.max(
            1000,
            Number(result.min_interval_seconds || 3) * 1000,
          );
          setConnected(true);
          setStatus("Agente conectado");
        } else if (result.type === "processing") {
          setStatus("El agente está analizando…");
        } else if (result.type === "reply") {
          clearTimeout(timeout.current);
          const input = pending.current;
          const question = result.reply?.questions?.join(" ");
          if (question) {
            setInterruption(question);
            if (readQuestionsRef.current && window.speechSynthesis) {
              window.speechSynthesis.cancel();
              const speech = new SpeechSynthesisUtterance(question);
              speech.lang = "es-CO";
              window.speechSynthesis.speak(speech);
            }
          }
          setTurns((items) => [
            ...items.filter((item) => item.message_id !== result.message_id),
            {
              message_id: result.message_id,
              text: input?.text || "Captura puntual",
              status: "completed",
              reply: result.reply,
            },
          ]);
          pending.current = null;
          setRetry(false);
          setBusy(false);
          setText("");
          setStatus("Agente conectado");
          void onReply().catch(() =>
            setError(
              "Respuesta recibida; actualiza el contexto para sincronizar las preguntas.",
            ),
          );
        } else if (result.type === "error") {
          clearTimeout(timeout.current);
          setBusy(false);
          setRetry(!!pending.current);
          setError(
            `${result.detail || "No se pudo completar el turno"} (${result.status}). ${result.status === 429 ? "Espera antes de reintentar." : result.status === 409 ? "Actualiza el historial; reintenta el mismo turno si sigue pendiente." : result.status === 503 ? "Revisa la disponibilidad del servicio y vuelve a intentar." : ""}`,
          );
          setStatus("Turno interrumpido");
          if ([401, 403].includes(result.status)) {
            pending.current = null;
            setRetry(false);
            ws.close();
            setConsent(false);
          }
        }
      } catch {
        setError("La respuesta del agente no se pudo interpretar.");
        ws.close();
      }
    };
    ws.onclose = () => {
      if (socket.current !== ws) return;
      clearTimeout(timeout.current);
      setConnected(false);
      setBusy(false);
      setRetry(!!pending.current);
      setStatus("Desconectado · puedes reconectar");
    };
    ws.onerror = () => {
      if (socket.current === ws)
        setError(
          "No se pudo conectar al agente. Revisa la API, tus permisos y la conexión.",
        );
    };
  }
  async function send(withImage: boolean, repeat = false) {
    if (
      !canSend ||
      !connected ||
      busy ||
      Date.now() - lastSent.current < minInterval.current
    )
      return;
    setBusy(true);
    setError("");
    const currentGeneration = generation.current;
    try {
      let input = repeat ? pending.current : null;
      if (!input) {
        input = {
          type: withImage ? "observe" : "message",
          message_id: crypto.randomUUID(),
          text: text.trim(),
        };
        if (withImage) {
          if (!capture?.stream)
            throw new Error("Comparte una pantalla para enviar una captura.");
          input.image_base64 = await snapshot(capture.stream);
        }
        if (!input.text && !input.image_base64)
          throw new Error("Escribe un mensaje o envía una captura.");
      }
      if (
        generation.current !== currentGeneration ||
        socket.current?.readyState !== WebSocket.OPEN ||
        capture?.stream?.getVideoTracks()[0]?.readyState === "ended"
      )
        throw new Error(
          "La captura o la conexión se cerró. Vuelve a conectar.",
        );
      pending.current = input;
      socket.current.send(JSON.stringify(input));
      setRetry(false);
      setStatus("Enviando al agente…");
      lastSent.current = Date.now();
      setCooldown(true);
      clearTimeout(cooling.current);
      cooling.current = setTimeout(
        () => setCooldown(false),
        minInterval.current,
      );
      timeout.current = setTimeout(() => {
        socket.current?.close();
        setError(
          "La respuesta se está demorando. Recupera el historial y reintenta el mismo turno si es necesario.",
        );
      }, 125000);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "No se pudo enviar el turno.");
    }
  }
  return (
    <section className="live-agent">
      <h4>Agente en vivo</h4>
      <p role="status">{status}</p>
      <p className="connection-note">
        Envía texto o una captura puntual. La voz se analiza con el video
        guardado.
      </p>
      <ErrorNotice error={error} />
      {interruption && (
        <aside className="agent-question-alert" role="status">
          <strong>El agente tiene una pregunta</strong>
          <p>{interruption}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setInterruption("");
              window.speechSynthesis?.cancel();
            }}
          >
            Cerrar aviso
          </button>
        </aside>
      )}
      {allowed && (
        <>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={readQuestions}
              disabled={!("speechSynthesis" in window)}
              onChange={(event) => {
                setReadQuestions(event.target.checked);
                readQuestionsRef.current = event.target.checked;
                if (!event.target.checked) window.speechSynthesis?.cancel();
              }}
            />{" "}
            Leer en voz alta las preguntas recibidas
          </label>
          <small>
            El agente pregunta al recibir un mensaje o una captura. La
            observación continua y las interrupciones autónomas aún requieren
            soporte del servidor.
          </small>
          {!capture?.stream && (
            <p className="connection-note">
              Comparte una pantalla para conectar al agente.
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (!e.target.checked) {
                  disconnect();
                  pending.current = null;
                  setRetry(false);
                }
              }}
            />
            Autorizo enviar mis mensajes y las capturas que seleccione al
            agente.
          </label>
          <div className="button-group">
            <button
              type="button"
              className="secondary"
              disabled={!connected && (!consent || !canSend)}
              onClick={connected ? disconnect : connect}
            >
              {connected ? "Desconectar agente" : "Conectar agente"}
            </button>
          </div>
        </>
      )}
      <div className="live-history">
        {turns.map((turn) => (
          <article key={turn.message_id}>
            <small>Tú</small>
            <p>{turn.text || "Captura puntual"}</p>
            {turn.reply ? (
              <>
                <h4>Observación</h4>
                <p>{turn.reply.observation}</p>
                <h4>Respuesta</h4>
                <p>{turn.reply.answer}</p>
                {turn.reply.questions?.length > 0 && (
                  <>
                    <h4>Preguntas del agente</h4>
                    <ul>
                      {turn.reply.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p>
                {turn.status === "pending"
                  ? "Turno pendiente de respuesta"
                  : "El turno no pudo completarse"}
              </p>
            )}
          </article>
        ))}
      </div>
      {allowed && (
        <>
          <VoiceInput
            value={text}
            onChange={(value) => setText(value.slice(0, 5000))}
            disabled={busy || retry || !canSend}
            question={interruption || undefined}
          />
          <div className="button-group">
            <button
              className="primary"
              type="button"
              disabled={
                !connected ||
                !canSend ||
                busy ||
                cooldown ||
                retry ||
                !text.trim()
              }
              onClick={() => void send(false)}
            >
              Enviar mensaje
            </button>
            <button
              className="secondary"
              type="button"
              disabled={
                !connected ||
                !canSend ||
                busy ||
                cooldown ||
                retry ||
                !capture?.stream
              }
              onClick={() => void send(true)}
            >
              Mostrar pantalla actual
            </button>
            {retry && (
              <>
                <button
                  className="secondary"
                  type="button"
                  disabled={!connected || !canSend || busy || cooldown}
                  onClick={() => void send(false, true)}
                >
                  Reintentar mismo turno
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    pending.current = null;
                    setRetry(false);
                  }}
                >
                  Descartar reintento
                </button>
              </>
            )}
          </div>
        </>
      )}
      <button
        className="text-button"
        type="button"
        onClick={() => setHistoryKey((value) => value + 1)}
      >
        Recuperar historial
      </button>
    </section>
  );
}

async function snapshot(stream: MediaStream): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth || !video.videoHeight)
      throw new ApiError(0, "La pantalla aún no está lista.");
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo capturar la pantalla.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
    if (result.length * 0.75 > 512 * 1024)
      throw new Error(
        "La captura supera el tamaño admitido. Reduce la ventana y vuelve a intentar.",
      );
    return result;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
