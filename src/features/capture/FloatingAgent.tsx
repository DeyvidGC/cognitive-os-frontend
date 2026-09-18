import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CaptureState, ScreenCapture } from "./screenCapture";
import { formatDuration } from "./screenCapture";
import { Icon } from "../../shared/ui";
import "./FloatingAgent.css";

type PipWindow = Window & {
  documentPictureInPicture?: {
    requestWindow: (options: {
      width: number;
      height: number;
    }) => Promise<Window>;
  };
};

export default function FloatingAgent({
  capture,
  state,
  children,
}: {
  capture: ScreenCapture;
  state: CaptureState;
  children: ReactNode;
}) {
  const [floating, setFloating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState("");
  const [conversationHost] = useState(() => document.createElement("div"));
  const inlineHost = useRef<HTMLDivElement>(null);
  const miniHost = useRef<HTMLDivElement>(null);
  const ownedWindow = useRef<Window | null>(null);
  const alive = useRef(true);
  const active = !!state.stream;
  const { phase, microphone } = state;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ownedWindow.current?.close();
    };
  }, []);
  useEffect(() => {
    const target = floating ? miniHost.current : inlineHost.current;
    target?.append(conversationHost);
  }, [conversationHost, floating, pip]);

  const autoOpen = useEffectEvent(() => {
    void open(true);
  });
  const autoClose = useEffectEvent(() => {
    close();
  });
  useEffect(() => {
    let previous = capture.getSnapshot().stream;
    return capture.subscribe(() => {
      const next = capture.getSnapshot();
      if (next.stream && !previous) autoOpen();
      if (!next.stream && previous) autoClose();
      previous = next.stream;
    });
  }, [capture]);
  function toggleExpanded() {
    const next = !expanded;
    // Chrome permits PiP resizing only synchronously within a user gesture.
    try {
      if (pip && !pip.closed) pip.resizeTo(420, next ? 620 : 190);
    } catch {
      /* The content remains scrollable if the browser refuses resizing. */
    }
    setExpanded(next);
  }

  async function open(automatic = false) {
    setNotice("");
    setFloating(true);
    const api = (window as PipWindow).documentPictureInPicture;
    if (!api) {
      setNotice(
        "La miniatura está disponible dentro de esta página. Para verla sobre otras aplicaciones, usa un navegador con ventana flotante compatible.",
      );
      return;
    }
    if (ownedWindow.current && !ownedWindow.current.closed) {
      ownedWindow.current.focus();
      return;
    }
    setOpening(true);
    try {
      const next = await api.requestWindow({ width: 420, height: 190 });
      if (!alive.current || (automatic && !capture.getSnapshot().stream)) {
        next.close();
        return;
      }
      ownedWindow.current = next;
      next.document.title = "Cognitive · Tu agente";
      const base = next.document.createElement("base");
      base.href = document.baseURI;
      next.document.head.append(base);
      document
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((style) => {
          next.document.head.append(style.cloneNode(true));
        });
      next.document.body.className = "agent-pip-body";
      next.addEventListener(
        "pagehide",
        () => {
          if (ownedWindow.current !== next) return;
          // Preserve the mounted conversation and unsent text when its window closes.
          inlineHost.current?.append(conversationHost);
          ownedWindow.current = null;
          if (alive.current) {
            setPip(null);
            setFloating(!!capture.getSnapshot().stream);
          }
        },
        { once: true },
      );
      setPip(next);
    } catch {
      if (alive.current)
        setNotice(
          "No se pudo abrir la ventana externa. Puedes usar la miniatura aquí o volver a intentarlo.",
        );
    } finally {
      if (alive.current) setOpening(false);
    }
  }
  function close() {
    inlineHost.current?.append(conversationHost);
    ownedWindow.current?.close();
    setPip(null);
    setFloating(false);
  }
  const panel = (
    <section
      className={`floating-agent ${expanded ? "is-expanded" : "is-compact"} ${pip ? "is-external" : "is-docked"}`}
      aria-label="Miniatura del agente"
    >
      <header className="floating-agent-header">
        <span>COGNITIVE · HERRAMIENTAS</span>
        <div>
          <button
            type="button"
            title={expanded ? "Minimizar conversación" : "Abrir conversación"}
            aria-label={
              expanded ? "Minimizar conversación" : "Abrir conversación"
            }
            aria-expanded={expanded}
            onClick={toggleExpanded}
          >
            {expanded ? "−" : "+"}
          </button>
          <button
            type="button"
            title="Cerrar miniatura (la grabación continúa)"
            aria-label="Cerrar miniatura"
            onClick={close}
          >
            ×
          </button>
        </div>
      </header>
      <div className="floating-agent-identity">
        <svg
          className="model-avatar"
          viewBox="0 0 100 100"
          role="img"
          aria-label="Avatar del agente Cognitive"
        >
          <circle cx="50" cy="50" r="48" fill="#e3eee7" />
          <path
            d="M50 18v10M45 18h10"
            stroke="#39715d"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect x="20" y="30" width="60" height="47" rx="20" fill="#306452" />
          <rect x="28" y="38" width="44" height="29" rx="12" fill="#f3f8ef" />
          <path
            d="M37 49v6m26-6v6M43 60h14"
            stroke="#306452"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="50" cy="83" r="3" fill="#78a78b" />
        </svg>
        <h3>Cognitive</h3>
        <p>
          {phase === "recording"
            ? "Grabando tu proceso"
            : phase === "paused"
              ? "Grabación en pausa"
              : active
                ? "Pantalla compartida"
                : "Listo para acompañarte"}{" "}
          <span>· {formatDuration(state.seconds)}</span>
        </p>
      </div>
      <div className="floating-agent-controls">
        <button
          type="button"
          className={microphone === "on" ? "mic-active" : ""}
          disabled={
            !active ||
            microphone === "requesting" ||
            phase === "stopping" ||
            (microphone === "off" && phase !== "sharing")
          }
          aria-pressed={microphone === "on"}
          onClick={() =>
            microphone === "off"
              ? void capture.enableMicrophone()
              : capture.toggleMicrophone()
          }
        >
          <Icon name="mic" size={20} />
          {microphone === "on"
            ? "Silenciar"
            : microphone === "muted"
              ? "Activar voz"
              : microphone === "requesting"
                ? "Permiso…"
                : "Micrófono"}
        </button>
        {phase === "sharing" && (
          <button
            type="button"
            disabled={microphone === "requesting"}
            onClick={() => capture.record()}
          >
            <Icon name="record" />
            Grabar
          </button>
        )}
        {phase === "recording" && (
          <button type="button" onClick={() => capture.pause()}>
            <Icon name="pause" />
            Pausar
          </button>
        )}
        {phase === "paused" && (
          <button type="button" onClick={() => capture.resume()}>
            <Icon name="play" />
            Reanudar
          </button>
        )}
        {active && (
          <button
            type="button"
            disabled={phase === "stopping"}
            onClick={() => capture.stop()}
          >
            <Icon name="stop" />
            Detener
          </button>
        )}
      </div>
      <p hidden={!expanded} className="floating-agent-help">
        {microphone === "on"
          ? "Tu voz se incluye en el video."
          : "Activa el micrófono antes de empezar a grabar."}{" "}
        El micrófono se graba en el video; no es una llamada de voz con el
        agente.
      </p>
      {state.error && (
        <p role="alert" className="floating-agent-error">
          {state.error}
        </p>
      )}
      <button
        type="button"
        className="floating-chat-toggle"
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        {expanded ? "Ocultar conversación" : "Conversación y preguntas"}
        <span>{expanded ? "−" : "+"}</span>
      </button>
      <div
        ref={miniHost}
        hidden={!expanded}
        className="floating-conversation"
      />
    </section>
  );
  return (
    <div className="agent-floating-workspace">
      <button
        type="button"
        className="secondary floating-launch"
        disabled={opening}
        onClick={() => void open()}
      >
        <Icon name="share" size={17} />
        {opening
          ? "Abriendo…"
          : floating
            ? "Mostrar miniatura"
            : "Abrir agente en miniatura"}
      </button>

      {!floating && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setFloating(true);
            setNotice("");
          }}
        >
          Usar miniatura dentro de esta página
        </button>
      )}
      {notice && (
        <p role="status" className="floating-agent-help">
          {notice}
        </p>
      )}
      <div ref={inlineHost} hidden={floating} />
      {floating && (pip ? createPortal(panel, pip.document.body) : panel)}
      {createPortal(children, conversationHost)}
    </div>
  );
}
