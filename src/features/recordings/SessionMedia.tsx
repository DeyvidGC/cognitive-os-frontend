import { confirmAction } from "../../shared/confirmAction";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api";
import type { Client, Session } from "../../shared/api";
import type {
  Job,
  Recording,
  RecordingCapabilities,
  Transfer,
} from "./recordings";
import { validateVideo } from "./recordings";
import ScreenStudio from "../capture/ScreenStudio";
import AgentConversation from "../agent/AgentConversation";
import RecordingReport from "./RecordingReport";
import RecordingUploadPanel from "./RecordingUploadPanel";
import { Badge, ErrorNotice, Icon } from "../../shared/ui";
import { date, useAction } from "../../shared/utils";
import "./SessionMedia.css";
import SessionJobs from "../sessions/SessionJobs";
export default function SessionMedia({
  api,
  onOpenProcedure,
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
  onOpenProcedure: (procedureId: string, versionId: string) => Promise<void>;
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
  const [selectedRecording, setSelectedRecording] = useState("");
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
  const playbackExpiry = useRef(0);
  const playbackPosition = useRef(0);
  const [codecError, setCodecError] = useState(false);
  const mounted = useRef(true);
  const { run, error, busy } = useAction();
  const item =
    recordings.find((recording) => recording.id === selectedRecording) ||
    recordings[0];
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
    let poll = true;
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
          poll =
            !["completed", "failed"].includes(updated.status) ||
            list.some((r) =>
              ["uploading", "uploaded", "queued", "processing"].includes(
                r.status,
              ),
            );
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
        if (e instanceof ApiError && [401, 403, 404].includes(e.status))
          poll = false;
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
        if (active && poll)
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
    seek.current = seconds ?? playbackPosition.current;
    const signed = await api<Transfer>(`/recordings/${item.id}/playback`);
    if (signed.method !== "GET" || Object.keys(signed.headers).length)
      throw new Error(
        "El enlace de reproducción requiere un método o cabeceras no compatibles.",
      );
    if (mounted.current) {
      setPlaybackError(false);
      setCodecError(false);
      playbackExpiry.current = new Date(signed.expires_at).getTime();
      setPlayback(signed.url);
    }
  }
  function seekVideo(seconds: number) {
    if (
      player.current &&
      playback &&
      player.current.readyState > 0 &&
      Date.now() < playbackExpiry.current
    ) {
      player.current.currentTime = seconds;
      player.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else void run(() => getPlayback(seconds));
  }
  return (
    <div className="session-media">
      <div className={`connection-bar ${connection}`} role="status">
        <span>
          <i />
          {connection === "online"
            ? "API conectada"
            : connection === "loading"
              ? "Conectando con tu espacio…"
              : connection === "missing"
                ? "Grabaciones no disponibles en esta API"
                : "Conexión interrumpida"}
        </span>
        <small>
          {lastSync
            ? `Última sincronización: ${lastSync}`
            : "Comprobando disponibilidad"}
        </small>
        <button
          className="text-button"
          onClick={() => setRefresh((key) => key + 1)}
        >
          Reconectar / actualizar
        </button>
      </div>
      {connectionError && (
        <div className="info">
          {connectionError}{" "}
          {connection === "offline" &&
            "La grabación local continúa. Los datos se consultarán de nuevo automáticamente."}
        </div>
      )}
      {capabilities && (
        <div className="capabilities-note">
          <span>
            <Icon name="clock" size={14} />
            {Math.floor(capabilities.max_seconds / 60)} min por video
          </span>
          <span>{Math.floor(capabilities.max_bytes / 1048576)} MB máximo</span>
          <span>
            {capabilities.max_recordings_per_session} video por sesión
          </span>
          <span>
            Análisis posterior · audio{" "}
            {capabilities.audio_supported ? "compatible" : "no analizado"}
          </span>
        </div>
      )}
      {capabilities && writable && (!item || item.status === "uploading") && (
        <section className="panel import-video">
          <h3>
            {item
              ? "Continuar una subida anterior"
              : "Subir un video para analizar"}
          </h3>
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
            <div>
              <video
                className="saved-player"
                src={externalClip}
                controls
                playsInline
                preload="metadata"
                aria-label="Vista previa del video seleccionado"
              />
              <button
                className="text-button"
                type="button"
                disabled={uploadBusy}
                onClick={() => setExternalClip("")}
              >
                Quitar video seleccionado
              </button>
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
            </div>
          )}
        </section>
      )}
      {writable && !externalClip && (!item || item.status === "uploading") ? (
        <ScreenStudio
          api={api}
          sessionId={session.id}
          onProtectedChange={setCaptureProtected}
          capabilities={capabilities}
          existing={item}
          onSaved={saved}
          onBusy={setUploadBusy}
          agentPanel={(capture) => (
            <AgentConversation
              capture={capture}
              canAnswer={canManage && session.status !== "processing"}
              api={api}
              session={session}
              writable={writable}
              onContextChange={onContextChange}
            />
          )}
        />
      ) : (
        <details className="session-conversation-only panel">
          <summary>Conversación y contexto de la sesión</summary>
          <AgentConversation
            canAnswer={canManage && session.status !== "processing"}
            api={api}
            session={session}
            writable={writable}
            onContextChange={onContextChange}
          />
        </details>
      )}
      <ErrorNotice error={error} />
      {recordings.length > 1 && (
        <label className="recording-picker">
          Videos de esta sesión
          <select
            value={item?.id || ""}
            onChange={async (event) => {
              const id = event.target.value;
              if (
                protectedState &&
                !(await confirmAction(
                  "Hay cambios pendientes. ¿Cambiar de video y descartar los cambios locales?",
                ))
              )
                return;
              setSelectedRecording(id);
              setPlayback("");
              setPlaybackError(false);
              setCodecError(false);
              playbackPosition.current = 0;
              seek.current = null;
            }}
          >
            {recordings.map((recording, index) => (
              <option key={recording.id} value={recording.id}>
                Video {index + 1} · {date(recording.created_at)}
              </option>
            ))}
          </select>
        </label>
      )}
      <SessionJobs
        api={api}
        sessionId={session.id}
        refreshKey={refresh}
        processing={session.status === "processing"}
      />
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
                      onClick={async () => {
                        if (
                          await confirmAction(
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
                    onTimeUpdate={() => {
                      if (player.current)
                        playbackPosition.current = player.current.currentTime;
                    }}
                    onError={() => {
                      setPlaybackError(true);
                      setCodecError(
                        [3, 4].includes(player.current?.error?.code || 0),
                      );
                    }}
                  />
                )}
                <p className={playbackError ? "error" : "connection-note"}>
                  {codecError &&
                    "El navegador no pudo decodificar este formato. Prueba otro navegador o descarga el archivo. "}
                  {playbackError && "No se pudo reproducir el video. "}Si el
                  enlace caduca o la reproducción falla, pulsa «Renovar enlace
                  de reproducción».
                </p>
                {playback && (
                  <a
                    className="text-button"
                    href={playback}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    Abrir / descargar video original
                  </a>
                )}
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
      {item?.status === "ready" && (
        <RecordingReport
          key={item.id}
          onOpenProcedure={onOpenProcedure}
          sessionId={session.id}
          canManage={canManage}
          onChanged={() => setRefresh((n) => n + 1)}
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
