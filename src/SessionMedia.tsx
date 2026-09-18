import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import type { Client, Session } from "./api";
import type {
  Job,
  Recording,
  RecordingCapabilities,
  Transfer,
} from "./recordings";
import { validateVideo } from "./recordings";
import ScreenStudio from "./ScreenStudio";
import AgentConversation from "./AgentConversation";
import RecordingReport from "./RecordingReport";
import RecordingUploadPanel from "./RecordingUploadPanel";
import { Badge, ErrorNotice, Icon } from "./ui";
import { date, useAction } from "./utils";
import "./SessionMedia.css";
export default function SessionMedia({
  api,
  session,
  writable,
  canManage,
  canReview,
  onProtectedChange,
  onRecordingsChange,
  onSessionChange,
  onContextChange,
}: {
  api: Client;
  session: Session;
  writable: boolean;
  canManage: boolean;
  canReview: boolean;
  onProtectedChange: (value: boolean) => void;
  onRecordingsChange: (items: Recording[]) => void;
  onSessionChange: (session: Session) => void;
  onContextChange: () => Promise<void>;
}) {
  const [capabilities, setCapabilities] =
    useState<RecordingCapabilities | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [connection, setConnection] = useState<
    "loading" | "online" | "offline" | "missing"
  >("loading");
  const [connectionError, setConnectionError] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [playback, setPlayback] = useState("");
  const [playbackError, setPlaybackError] = useState(false);
  const [externalClip, setExternalClip] = useState("");
  const [captureProtected, setCaptureProtected] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const seek = useRef<number | null>(null);
  const mounted = useRef(true);
  const { run, error, busy } = useAction();
  const item = recordings[0];
  // Permission for processing/retry persists after capture closes, unlike message-writing permission.
  const editableRecording = canManage && session.status !== "completed";
  const protectedState =
    captureProtected || reportDirty || !!externalClip || uploadBusy;
  useEffect(() => {
    onProtectedChange(protectedState);
    return () => onProtectedChange(false);
  }, [protectedState, onProtectedChange]);
  useEffect(() => {
    if (!protectedState) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [protectedState]);
  useEffect(
    () => () => {
      if (externalClip) URL.revokeObjectURL(externalClip);
    },
    [externalClip],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const abort = new AbortController();
    async function load() {
      try {
        const caps = await api<RecordingCapabilities>(
          "/recordings/capabilities",
          { signal: abort.signal },
        );
        const [list, updated] = await Promise.all([
          api<Recording[]>(`/learning-sessions/${session.id}/recordings`, {
            signal: abort.signal,
          }),
          api<Session>(`/learning-sessions/${session.id}`, {
            signal: abort.signal,
          }),
        ]);
        if (active) {
          failures = 0;
          setCapabilities(caps);
          setRecordings(list);
          onRecordingsChange(list);
          onSessionChange(updated);
          setConnection("online");
          setConnectionError("");
          setLastSync(new Date().toLocaleTimeString("es-CO"));
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) {
          setConnection("missing");
          setConnectionError(
            "La versión de la API conectada aún no incluye grabaciones. Puedes trabajar con la captura local.",
          );
          return;
        }
        failures++;
        setConnection("offline");
        setConnectionError(
          e instanceof Error ? e.message : "No fue posible sincronizar.",
        );
      } finally {
        if (active)
          timer = setTimeout(load, Math.min(30000, 6000 * 2 ** failures));
      }
    }
    void load();
    const online = () => setRefresh((key) => key + 1);
    window.addEventListener("online", online);
    return () => {
      active = false;
      abort.abort();
      clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [api, session.id, refresh, onRecordingsChange, onSessionChange]);
  const saved = useCallback(
    (recording: Recording) => {
      setRecordings([recording]);
      onRecordingsChange([recording]);
      setExternalClip("");
      setRefresh((key) => key + 1);
    },
    [onRecordingsChange],
  );
  async function getPlayback(seconds?: number) {
    if (!item) return;
    if (seconds !== undefined) seek.current = seconds;
    const signed = await api<Transfer>(`/recordings/${item.id}/playback`);
    if (signed.method !== "GET" || Object.keys(signed.headers).length)
      throw new Error(
        "El enlace de reproducción requiere un método o cabeceras no compatibles.",
      );
    if (mounted.current) {
      setPlaybackError(false);
      setPlayback(signed.url);
    }
  }
  function seekVideo(seconds: number) {
    if (player.current && playback && player.current.readyState > 0) {
      player.current.currentTime = seconds;
      player.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else void run(() => getPlayback(seconds));
  }
  return (
    <div className="session-media">
      {/*
        Estado y límites en una sola línea. El detalle técnico (sincronización,
        tamaños, formato) vive dentro del desplegable: hace falta al depurar,
        no mientras alguien enseña un proceso.
      */}
      <details className={`session-status ${connection}`}>
        <summary>
          <i />
          <span>
            {connection === "online"
              ? "API conectada"
              : connection === "loading"
                ? "Conectando con tu espacio…"
                : connection === "missing"
                  ? "Grabaciones no disponibles en esta API"
                  : "Conexión interrumpida"}
          </span>
          <small>Ver detalles</small>
        </summary>
        <div className="session-status-body">
          <p>
            {lastSync
              ? `Última sincronización: ${lastSync}`
              : "Comprobando disponibilidad"}
          </p>
          {capabilities && (
            <ul>
              <li>
                {Math.floor(capabilities.max_seconds / 60)} min por video
              </li>
              <li>{Math.floor(capabilities.max_bytes / 1048576)} MB máximo</li>
              <li>
                {capabilities.max_recordings_per_session} video por sesión
              </li>
              <li>
                Análisis posterior · audio{" "}
                {capabilities.audio_supported ? "compatible" : "no analizado"}
              </li>
            </ul>
          )}
          <button
            className="text-button"
            onClick={() => setRefresh((key) => key + 1)}
          >
            Reconectar / actualizar
          </button>
        </div>
      </details>
      {connectionError && (
        <div className="info">
          {connectionError}{" "}
          {connection === "offline" &&
            "La grabación local continúa. Los datos se consultarán de nuevo automáticamente."}
        </div>
      )}
      {writable && (!item || item.status === "uploading") ? (
        <ScreenStudio
          api={api}
          sessionId={session.id}
          onProtectedChange={setCaptureProtected}
          capabilities={capabilities}
          existing={item}
          onSaved={saved}
          onBusy={setUploadBusy}
          agentPanel={
            <AgentConversation
              api={api}
              session={session}
              writable={writable}
              onContextChange={onContextChange}
            />
          }
        />
      ) : (
        <div className="session-review-layout">
          <section className="panel media-summary">
            <div className="section-heading">
              <div>
                <h2>Video de la sesión</h2>
                <p>
                  {item
                    ? "Tu registro visual, disponible en este espacio."
                    : "Esta sesión no tiene un video guardado."}
                </p>
              </div>
              <Icon name="video" />
            </div>
            <p>
              {item
                ? "Reproduce el video y utiliza las marcas de tiempo del informe para verificar cada instrucción."
                : "Las sesiones basadas en notas conservan su contexto y aclaraciones."}
            </p>
          </section>
          <AgentConversation
            api={api}
            session={session}
            writable={writable}
            onContextChange={onContextChange}
          />
        </div>
      )}
      <ErrorNotice error={error} />
      {item && (
        <section className="panel saved-recording">
          <div className="section-heading">
            <div>
              <h2>Grabación guardada</h2>
              <p>
                {date(item.created_at)} ·{" "}
                {(item.size_bytes / 1048576).toFixed(1)} MB · {item.media_type}
              </p>
            </div>
            <Badge status={item.status} />
          </div>
          <div className="saved-recording-body">
            {item.status === "uploading" ? (
              <div className="info">
                Hay una reserva de video pendiente. Reintenta desde la captura
                local o selecciona el mismo archivo original abajo. La API
                admite una sola grabación por sesión.
              </div>
            ) : (
              <>
                <div className="button-group">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => getPlayback())}
                  >
                    <Icon name="play" size={15} />
                    {playback
                      ? "Renovar enlace de reproducción"
                      : "Reproducir video guardado"}
                  </button>
                  {item.status === "uploaded" && writable && (
                    <button
                      className="primary"
                      disabled={busy || protectedState}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Se cerrará la captura y se iniciará el análisis del video. Resuelve las preguntas pendientes antes de continuar. ¿Iniciar análisis?",
                          )
                        )
                          void run(async () => {
                            await api<Job>(`/recordings/${item.id}/process`, {
                              method: "POST",
                            });
                            setRefresh((key) => key + 1);
                          });
                      }}
                    >
                      Finalizar y analizar video
                    </button>
                  )}
                  {item.status === "failed" && editableRecording && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api<Job>(`/recordings/${item.id}/retry`, {
                            method: "POST",
                          });
                          setRefresh((key) => key + 1);
                        })
                      }
                    >
                      Reintentar análisis
                    </button>
                  )}
                </div>
                {playback && (
                  <video
                    ref={player}
                    className="saved-player"
                    src={playback}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label="Video guardado de la sesión"
                    onLoadedMetadata={() => {
                      if (seek.current !== null && player.current) {
                        player.current.currentTime = seek.current;
                        seek.current = null;
                        player.current.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }
                    }}
                    onError={() => setPlaybackError(true)}
                  />
                )}
                <p className={playbackError ? "error" : "connection-note"}>
                  {playbackError && "No se pudo reproducir el video. "}Si el
                  enlace caduca o la reproducción falla, pulsa «Renovar enlace
                  de reproducción».
                </p>
              </>
            )}
            {["queued", "processing", "failed"].includes(item.status) && (
              <div className={`analysis-status ${item.status}`} role="status">
                <Icon
                  name={item.status === "failed" ? "record" : "spark"}
                  size={22}
                />
                <div>
                  <strong>
                    {item.status === "queued"
                      ? "En cola de análisis"
                      : item.status === "processing"
                        ? "Analizando el video"
                        : "El análisis no pudo completarse"}
                  </strong>
                  <p>
                    {item.status === "failed"
                      ? "El video sigue guardado. Puedes reintentar el análisis."
                      : item.error_code === "recording_analysis_retrying"
                        ? "El servicio está reintentando el análisis automáticamente."
                        : "El estado se actualiza automáticamente. Puedes volver más tarde."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {capabilities && writable && (!item || item.status === "uploading") && (
        <details className="panel import-video">
          <summary>
            {item
              ? "Continuar una subida anterior"
              : "¿Ya tienes el video grabado?"}
          </summary>
          <p>
            {item
              ? "Selecciona el mismo archivo. Un video diferente no debe usarse para recuperar esta reserva."
              : "También puedes subir un WebM o MP4 desde tu equipo."}
          </p>
          <label>
            Seleccionar video
            <input
              type="file"
              accept="video/webm,video/mp4,.webm,.mp4"
              disabled={uploadBusy || captureProtected}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void run(async () => {
                  const blob = file.type
                    ? file
                    : new Blob([file], {
                        type: file.name.toLowerCase().endsWith(".mp4")
                          ? "video/mp4"
                          : "video/webm",
                      });
                  validateVideo(blob, capabilities);
                  if (
                    item &&
                    (item.size_bytes !== blob.size ||
                      item.media_type !== blob.type.split(";")[0])
                  )
                    throw new Error(
                      "El archivo no coincide con el tamaño y formato de la reserva pendiente.",
                    );
                  setExternalClip(URL.createObjectURL(blob));
                });
              }}
            />
          </label>
          {externalClip && (
            <RecordingUploadPanel
              key={externalClip}
              api={api}
              sessionId={session.id}
              clip={externalClip}
              capabilities={capabilities}
              existing={item}
              onSaved={saved}
              onBusy={setUploadBusy}
            />
          )}
        </details>
      )}
      {item?.status === "ready" && (
        <RecordingReport
          api={api}
          recordingId={item.id}
          canReview={canReview}
          onSeek={seekVideo}
          onDirty={setReportDirty}
        />
      )}
    </div>
  );
}
