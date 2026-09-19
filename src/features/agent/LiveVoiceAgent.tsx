import { useEffect, useRef, useState } from "react";
import type { Client, Clarification } from "../../shared/api";
import type { CaptureState } from "../capture/screenCapture";
import { VoiceAudio } from "./voiceAudio";
import { snapshot } from "./snapshot";
import VoiceInput from "../../shared/VoiceInput";

const endings: Record<string, string> = {
  max_duration: "La llamada alcanzó su duración máxima.",
  session_status_changed: "La sesión terminó o cambió tu autorización.",
  client_disconnect: "Llamada finalizada.",
  error: "El servicio de voz interrumpió la llamada.",
};
export default function LiveVoiceAgent({
  api,
  sessionId,
  allowed,
  capture,
  onChanged,
}: {
  api: Client;
  sessionId: string;
  allowed: boolean;
  capture?: CaptureState;
  onChanged: () => Promise<void>;
}) {
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [status, setStatus] = useState("Llamada desconectada");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState<Clarification | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(15);
  const socket = useRef<WebSocket | null>(null);
  const audio = useRef<VoiceAudio | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const answerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const generation = useRef(0);
  const mounted = useRef(true);
  const canCall =
    allowed &&
    !!capture?.stream &&
    !["paused", "stopping"].includes(capture.phase);
  const effectiveMute = muted || dictating || capture?.microphone === "muted";

  function stop(message: string, notify = true) {
    generation.current++;
    clearTimeout(frameTimer.current);
    clearTimeout(deadline.current);
    clearTimeout(inputTimer.current);
    clearTimeout(answerTimer.current);
    const ws = socket.current;
    socket.current = null;
    if (ws) {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (notify && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "end" }));
      ws.close();
    }
    audio.current?.stop();
    audio.current = null;
    if (mounted.current) {
      setActive(false);
      setReady(false);
      setListening(false);
      setSpeaking(false);
      setSaving(false);
      setStatus(message);
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop("", true);
    };
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && audio.current)
        stop(
          "La llamada terminó al ocultar la pestaña. Vuelve a conectar para continuar.",
        );
    };
    const leaving = () => stop("Llamada finalizada.");
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  useEffect(() => {
    if (!canCall && audio.current)
      stop("La llamada terminó al pausar o detener la captura.");
  }, [canCall]);
  useEffect(() => {
    audio.current?.setMuted(effectiveMute);
  }, [effectiveMute]);
  useEffect(() => {
    let valid = true;
    void api<Clarification[]>(`/learning-sessions/${sessionId}/clarifications`)
      .then((items) => {
        if (valid) setQuestion(items.find((item) => !item.answer) || null);
      })
      .catch(() => {});
    return () => {
      valid = false;
    };
  }, [api, sessionId]);

  async function connect() {
    if (!consent || !canCall || active || audio.current || document.hidden)
      return;
    const stream = capture!.stream!;
    const turn = ++generation.current;
    setError("");
    setActive(true);
    setStatus("Conectando llamada…");
    try {
      const device = new VoiceAudio((value) => {
        if (mounted.current) setSpeaking(value);
      });
      audio.current = device;
      await device.unlock(); // Resume from the button gesture; microphone is opened only after ready.
      if (turn !== generation.current || document.hidden) {
        device.stop();
        return;
      }
      device.setMuted(effectiveMute);
      const ws = api.agentSocket(sessionId, "live-voice");
      socket.current = ws;
      ws.binaryType = "arraybuffer";
      deadline.current = setTimeout(() => {
        setError("El servidor no respondió a tiempo.");
        stop("No se pudo conectar.");
      }, 20000);
      let initialized = false;
      let lastInput = 0;
      ws.onmessage = (event) => {
        if (socket.current !== ws) return;
        void (async () => {
          if (event.data instanceof ArrayBuffer) {
            if (initialized) device.play(event.data);
            return;
          }
          const message = JSON.parse(event.data);
          if (message.type === "ready" && !initialized) {
            if (
              message.protocol_version !== 1 ||
              !message.audio_input ||
              !message.audio_output
            )
              throw new Error(
                "La versión de voz del servidor no es compatible.",
              );
            initialized = true;
            clearTimeout(deadline.current);
            const interval = Number(message.observation_interval_seconds);
            const maxSeconds = Number(message.session_max_seconds);
            if (
              !Number.isFinite(interval) ||
              interval < 5 ||
              interval > 60 ||
              !Number.isFinite(maxSeconds) ||
              maxSeconds <= 0 ||
              maxSeconds > 3600
            )
              throw new Error("El servidor devolvió límites de voz inválidos.");
            setIntervalSeconds(interval);
            setStatus("Autoriza el micrófono para comenzar");
            deadline.current = setTimeout(
              () => stop(endings.max_duration),
              maxSeconds * 1000,
            );
            await device.start((data) => {
              if (
                socket.current !== ws ||
                ws.readyState !== WebSocket.OPEN ||
                document.hidden
              )
                return;
              if (ws.bufferedAmount > 128000) {
                setError(
                  "La conexión no alcanza a enviar el audio. Vuelve a conectar.",
                );
                stop("Llamada interrumpida por la red.");
                return;
              }
              ws.send(data);
              if (Date.now() - lastInput > 250) {
                lastInput = Date.now();
                setListening(true);
                clearTimeout(inputTimer.current);
                inputTimer.current = setTimeout(() => setListening(false), 600);
              }
            });
            if (socket.current !== ws || turn !== generation.current) return;
            setReady(true);
            setStatus("Conectado · el agente puede hacerte preguntas");
            async function frame() {
              try {
                const image = await snapshot(stream);
                if (
                  socket.current !== ws ||
                  ws.readyState !== WebSocket.OPEN ||
                  document.hidden
                )
                  return;
                if (ws.bufferedAmount > 128000)
                  throw new Error(
                    "La conexión está saturada. Vuelve a conectar.",
                  );
                ws.send(JSON.stringify({ type: "frame", image_base64: image }));
                frameTimer.current = setTimeout(
                  () => void frame(),
                  interval * 1000,
                );
              } catch (e) {
                if (socket.current === ws) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No se pudo compartir la pantalla con el agente.",
                  );
                  stop("Se detuvo la llamada.");
                }
              }
            }
            void frame();
          } else if (message.type === "clarification.created") {
            if (
              typeof message.clarification_id !== "string" ||
              typeof message.question !== "string"
            )
              throw new Error("La pregunta recibida no es válida.");
            setQuestion((current) =>
              current?.id === message.clarification_id
                ? current
                : {
                    id: message.clarification_id,
                    question: message.question,
                    answer: null,
                  },
            );
            window.dispatchEvent(new Event("cognitive-agent-question"));
            void onChanged().catch(() =>
              setError(
                "Pregunta recibida; actualiza el contexto para sincronizar.",
              ),
            );
          } else if (message.type === "session.ending") {
            stop(
              endings[message.reason] || "El servidor finalizó la llamada.",
              false,
            );
            void onChanged().catch(() => {});
          } else if (message.type === "error") {
            setError(
              message.status === 409
                ? "Ya hay otra llamada activa para esta sesión. Ciérrala antes de volver a conectar."
                : message.status === 401 || message.status === 403
                  ? "Tu acceso a la llamada expiró o ya no está permitido."
                  : message.detail || "Falló el servicio de voz.",
            );
            if ([401, 403].includes(message.status)) setConsent(false);
            stop("La llamada se cerró.", false);
          }
        })().catch((e) => {
          if (socket.current === ws) {
            setError(
              e instanceof Error ? e.message : "Error al iniciar el audio.",
            );
            stop("La llamada se detuvo.");
          }
        });
      };
      ws.onclose = () => {
        if (socket.current === ws)
          stop(
            "Conexión cerrada. Puedes volver a conectar manualmente.",
            false,
          );
      };
      ws.onerror = () => {
        if (socket.current === ws) {
          setError(
            "No se pudo conectar al servicio de voz. Comprueba que la API lo tenga habilitado.",
          );
          stop("Conexión interrumpida.", false);
        }
      };
    } catch (e) {
      if (turn === generation.current) {
        setError(
          e instanceof Error ? e.message : "No se pudo iniciar la llamada.",
        );
        stop("Llamada desconectada.");
      }
    }
  }
  async function answerQuestion() {
    const ws = socket.current;
    if (
      !question ||
      !answer.trim() ||
      saving ||
      !ready ||
      ws?.readyState !== WebSocket.OPEN
    )
      return;
    const id = question.id,
      text = answer.trim(),
      turn = generation.current;
    setSaving(true);
    setError("");
    ws.send(
      JSON.stringify({
        type: "clarification_answer",
        clarification_id: id,
        text,
      }),
    );
    let attempts = 0;
    async function confirm() {
      if (turn !== generation.current) return;
      try {
        const list = await api<Clarification[]>(
          `/learning-sessions/${sessionId}/clarifications`,
        );
        if (turn !== generation.current) return;
        if (list.find((item) => item.id === id)?.answer === text) {
          setQuestion(list.find((item) => !item.answer) || null);
          setAnswer("");
          setSaving(false);
          setStatus("Respuesta guardada · la llamada continúa");
          await onChanged();
          return;
        }
        if (++attempts >= 5)
          throw new Error(
            "No se confirmó el guardado. Tu respuesta se conserva; revisa las aclaraciones antes de reintentar.",
          );
        answerTimer.current = setTimeout(() => void confirm(), 1000);
      } catch (e) {
        if (turn === generation.current) {
          setSaving(false);
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo verificar la respuesta.",
          );
        }
      }
    }
    void confirm();
  }
  return (
    <section className="live-agent live-voice">
      <h4>Llamada en vivo con el agente</h4>
      <p role="status">
        {speaking
          ? "El agente está hablando"
          : listening && !effectiveMute
            ? "Escuchando tu micrófono"
            : status}
      </p>
      <p>
        Habla mientras compartes. El agente observa capturas periódicas y puede
        preguntarte cuando necesite una aclaración.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={consent}
          disabled={!allowed}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked)
              stop("Consentimiento retirado. Llamada finalizada.");
          }}
        />{" "}
        Autorizo enviar mi voz y capturas periódicas al agente y guardar la
        transcripción.
      </label>
      <div className="button-group">
        {!active ? (
          <button
            className="primary"
            type="button"
            disabled={!consent || !canCall}
            onClick={() => void connect()}
          >
            Iniciar llamada
          </button>
        ) : (
          <button
            className="stop-capture"
            type="button"
            onClick={() => {
              stop("Llamada finalizada.");
              void onChanged().catch(() => {});
            }}
          >
            Colgar
          </button>
        )}
        {active && (
          <button
            type="button"
            className="secondary"
            onClick={() => setMuted(!muted)}
          >
            {muted ? "Activar micrófono de llamada" : "Silenciar llamada"}
          </button>
        )}
        {speaking && (
          <button
            type="button"
            className="secondary"
            onClick={() => audio.current?.silence()}
          >
            Detener audio actual
          </button>
        )}
      </div>
      {!canCall && (
        <p className="connection-note">
          Comparte pantalla y mantén la sesión en captura para llamar.
        </p>
      )}
      {ready && (
        <small>
          Pantalla enviada cada {intervalSeconds} segundos.{" "}
          {effectiveMute ? "Micrófono de llamada silenciado. " : ""}La llamada
          termina al ocultar esta pestaña.
        </small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {question && (
        <aside className="agent-question-alert" role="status">
          <strong>El agente necesita una aclaración</strong>
          <p>{question.question}</p>
          <p>
            Puedes hablar con el agente. Para cerrar esta aclaración, confirma
            también su respuesta aquí.
          </p>
          <VoiceInput
            maxLength={5000}
            value={answer}
            onChange={setAnswer}
            disabled={saving}
            onListeningChange={setDictating}
          />
          <button
            type="button"
            className="primary"
            disabled={!ready || saving || dictating || !answer.trim()}
            onClick={() => void answerQuestion()}
          >
            {saving ? "Comprobando guardado…" : "Confirmar respuesta"}
          </button>
          {!ready && (
            <small>
              La pregunta queda pendiente en Aclaraciones; también puedes
              responderla allí.
            </small>
          )}
        </aside>
      )}
    </section>
  );
}
