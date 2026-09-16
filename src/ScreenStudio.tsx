import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Client } from "./api";
import type { Recording, RecordingCapabilities } from "./recordings";
import RecordingUploadPanel from "./RecordingUploadPanel";
import FloatingAgent from "./FloatingAgent";
import { ScreenCapture, formatDuration } from "./screenCapture";
import { ErrorNotice, Icon } from "./ui";
import "./ScreenStudio.css";

export default function ScreenStudio({
  sessionId,
  onProtectedChange,
  api,
  capabilities,
  existing,
  onSaved,
  onBusy,
  agentPanel,
}: {
  sessionId: string;
  api: Client;
  capabilities: RecordingCapabilities | null;
  existing?: Recording;
  onSaved: (recording: Recording) => void;
  onBusy: (value: boolean) => void;
  agentPanel: ReactNode;
  onProtectedChange: (value: boolean) => void;
}) {
  const [capture] = useState(() => new ScreenCapture());
  const state = useSyncExternalStore(capture.subscribe, capture.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  const { phase, stream, clip } = state;
  const protectedState = phase !== "idle";
  useEffect(() => () => capture.dispose(), [capture]);
  useEffect(() => {
    onProtectedChange(protectedState);
    return () => onProtectedChange(false);
  }, [onProtectedChange, protectedState]);
  useEffect(() => {
    if (!protectedState) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [protectedState]);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const status = {
    idle: "Sin pantalla compartida",
    selecting: "Seleccionando pantalla",
    sharing: "Vista previa en vivo",
    recording: "Grabando localmente",
    paused: "Grabación pausada",
    stopping: "Preparando video",
    recorded: "Grabación disponible",
  }[phase];
  const hasCapture = !!stream;
  useEffect(() => {
    if (capabilities)
      capture.setLimits(capabilities.max_bytes, capabilities.max_seconds);
  }, [capture, capabilities]);
  return (
    <section
      className="screen-studio"
      aria-label="Pantalla y agente de aprendizaje"
    >
      <div className="studio-heading">
        <div>
          <span className="eyebrow">APRENDER VIENDO CÓMO LO HACES</span>
          <h2>Tu pantalla, el punto de partida.</h2>
          <p>Comparte un proceso y documenta cada paso de tu experiencia.</p>
        </div>
        <span className="studio-phase">
          <i className={phase === "recording" ? "recording-dot" : ""} />
          {status}
        </span>
      </div>
      <div className="studio-grid">
        <div className="studio-screen">
          <div className="screen-chrome">
            <span>
              <Icon name="monitor" size={16} />
              {stream?.getVideoTracks()[0]?.label ||
                (clip ? "Video de la sesión" : "Pantalla de la sesión")}
            </span>
            <span className="screen-timer">
              <Icon name="clock" size={13} />
              {formatDuration(state.seconds)}
            </span>
          </div>
          <div
            className={`screen-stage ${hasCapture || clip ? "has-video" : ""}`}
          >
            {stream ? (
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                aria-label="Vista previa de la pantalla compartida"
              />
            ) : clip ? (
              <video
                src={clip}
                controls
                playsInline
                aria-label="Reproducir grabación local"
              />
            ) : (
              <div className="screen-placeholder">
                <div className="screen-illustration">
                  <Icon name="monitor" size={46} />
                  <span>
                    <Icon name="spark" size={18} />
                  </span>
                </div>
                <h3>Muéstranos cómo se hace</h3>
                <p>
                  Elige una pestaña, una ventana o tu pantalla.
                  <br />
                  Tú decides qué compartir y cuándo detenerte.
                </p>
                <button
                  className="primary"
                  type="button"
                  disabled={phase === "selecting"}
                  onClick={() => void capture.share()}
                >
                  <Icon name="share" size={17} />
                  {phase === "selecting"
                    ? "Elige en el navegador…"
                    : "Compartir pantalla"}
                </button>
                <small>
                  Solo se captura la superficie que elijas. Puedes añadir tu
                  micrófono antes de grabar.
                </small>
              </div>
            )}
            {(phase === "recording" || phase === "paused") && (
              <span
                className={`recording-overlay ${phase === "paused" ? "is-paused" : ""}`}
              >
                <i />
                {phase === "paused" ? "EN PAUSA" : "REC"}
                <span>{formatDuration(state.seconds)}</span>
              </span>
            )}
          </div>
          {hasCapture && (
            <div className="microphone-controls">
              <button
                type="button"
                className={
                  state.microphone === "on"
                    ? "mic-toggle enabled"
                    : "mic-toggle"
                }
                disabled={
                  state.microphone === "requesting" ||
                  (phase !== "sharing" && state.microphone === "off") ||
                  phase === "stopping"
                }
                onClick={() =>
                  state.microphone === "off"
                    ? void capture.enableMicrophone()
                    : capture.toggleMicrophone()
                }
              >
                <Icon name="mic" size={16} />
                {state.microphone === "requesting"
                  ? "Solicitando permiso…"
                  : state.microphone === "on"
                    ? "Silenciar micrófono"
                    : state.microphone === "muted"
                      ? "Activar voz"
                      : "Añadir micrófono"}
              </button>
              <small>
                {state.microphone === "on"
                  ? "Tu voz se incluirá en el video."
                  : "Micrófono opcional · actívalo antes de grabar."}{" "}
                {capabilities?.audio_supported === false &&
                  "El análisis actual no escucha el audio."}
              </small>
            </div>
          )}
          <div className="screen-toolbar">
            <div className="capture-controls">
              {phase === "sharing" && (
                <button
                  className="primary"
                  type="button"
                  disabled={state.microphone === "requesting"}
                  onClick={() => capture.record()}
                >
                  <Icon name="record" size={16} />
                  Iniciar grabación
                </button>
              )}
              {phase === "recording" && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => capture.pause()}
                >
                  <Icon name="pause" size={16} />
                  Pausar
                </button>
              )}
              {phase === "paused" && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => capture.resume()}
                >
                  <Icon name="play" size={16} />
                  Reanudar
                </button>
              )}
              {hasCapture && (
                <button
                  className="stop-capture"
                  type="button"
                  disabled={phase === "stopping"}
                  onClick={() => capture.stop()}
                >
                  <Icon name="stop" size={15} />
                  {phase === "sharing"
                    ? "Dejar de compartir"
                    : "Detener grabación"}
                </button>
              )}
              {clip && (
                <>
                  <a
                    className="primary"
                    href={clip}
                    download={`sesion-${sessionId}.${state.mimeType.includes("mp4") ? "mp4" : "webm"}`}
                  >
                    <Icon name="download" size={16} />
                    Descargar video
                  </a>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "La grabación actual se eliminará de esta vista. Descarga el video antes de continuar. ¿Preparar otra grabación?",
                        )
                      )
                        capture.reset();
                    }}
                  >
                    Nueva grabación
                  </button>
                </>
              )}
              {phase === "idle" && (
                <span className="toolbar-hint">
                  <Icon name="record" size={15} />
                  La grabación empieza cuando tú la inicies.
                </span>
              )}
              {phase === "stopping" && (
                <span role="status">Preparando tu video…</span>
              )}
            </div>
            <span className="local-only">
              {clip
                ? `${(state.bytes / 1024 / 1024).toFixed(1)} MB · Video local`
                : "Captura de pantalla"}
            </span>
          </div>
        </div>
        <FloatingAgent capture={capture} state={state}>{agentPanel}</FloatingAgent>
      </div>
      <ErrorNotice error={state.error} />
      {clip && capabilities ? (
        <RecordingUploadPanel
          key={clip}
          api={api}
          sessionId={sessionId}
          clip={clip}
          duration={state.seconds}
          capabilities={capabilities}
          existing={existing}
          onSaved={onSaved}
          onBusy={onBusy}
        />
      ) : (
        <div className="recording-storage">
          <Icon name="video" size={22} />
          <div>
            <strong>Video de la sesión</strong>
            <p>
              {clip
                ? "Descarga tu copia local. Conecta una API con soporte de grabaciones para guardarla."
                : "Graba el proceso, guarda el video y luego inicia su análisis."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
