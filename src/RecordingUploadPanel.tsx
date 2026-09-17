import { useEffect, useRef, useState } from "react";
import type { Client } from "./api";
import { RecordingUpload, validateVideo } from "./recordings";
import type { Recording, RecordingCapabilities } from "./recordings";
import { ErrorNotice, Icon } from "./ui";
export default function RecordingUploadPanel({
  api,
  sessionId,
  clip,
  capabilities,
  existing,
  duration,
  onSaved,
  onBusy,
}: {
  api: Client;
  sessionId: string;
  clip: string;
  capabilities: RecordingCapabilities;
  existing?: Recording;
  duration?: number;
  onSaved: (recording: Recording) => void;
  onBusy: (busy: boolean) => void;
}) {
  const task = useRef<RecordingUpload | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [reservationStarted, setReservationStarted] = useState(false);
  const [audioConsent, setAudioConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  async function send() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      if (!task.current) {
        const blob = await (await fetch(clip, { signal: abort.signal })).blob();
        validateVideo(blob, capabilities, duration);
        setReservationStarted(true);
        task.current = new RecordingUpload(api, sessionId, blob, existing, audioConsent, true);
      }
      const recording = await task.current.send(
        setProgress,
        setStage,
        abort.signal,
      );
      if (!abort.signal.aborted) {
        setSaved(true);
        onSaved(recording);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el video.");
    } finally {
      controller.current = null;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="upload-video-card" aria-label="Guardar grabación">
      <div className="upload-title">
        <Icon name="video" />
        <div>
          <h3>
            {saved
              ? "Video guardado en tu organización"
              : existing
                ? "Recuperar subida pendiente"
                : "Guarda el video de esta sesión"}
          </h3>
          <p>
            {saved
              ? "Ya puedes volver a abrirlo desde esta sesión."
              : "El video se conserva localmente mientras se completa la subida."}
          </p>
        </div>
      </div>
      <ErrorNotice error={error} />
      {!saved && (
        <>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
            />
            Autorizo guardar y analizar el video en mi organización.
          </label>
          {capabilities.audio_supported && <label className="checkbox">
            <input type="checkbox" checked={audioConsent} disabled={busy || reservationStarted || !!existing} onChange={(event) => setAudioConsent(event.target.checked)} />
            Autorizo transcribir y analizar la voz incluida en este video.
          </label>}
          {busy && (
            <div role="status">
              <div className="upload-progress-label">
                <span>{stage}</span>
                <strong>{progress}%</strong>
              </div>
              <progress
                value={progress}
                max={100}
                aria-label="Progreso de subida"
              />
              <small>
                El 100% transferido requiere confirmación de guardado de la API.
              </small>
            </div>
          )}
          <div className="button-group">
            <button
              type="button"
              className="primary"
              disabled={!consent || busy || !capabilities.storage_configured}
              onClick={() => void send()}
            >
              <Icon name="upload" size={16} />
              {error ? "Reintentar guardado" : "Guardar video"}
            </button>
            {busy && (
              <button
                type="button"
                className="secondary"
                onClick={() => controller.current?.abort()}
              >
                Cancelar subida
              </button>
            )}
          </div>
          {!capabilities.storage_configured && (
            <p className="connection-note">
              El almacenamiento aún no está configurado. Descarga tu copia
              local.
            </p>
          )}
        </>
      )}
      {saved && (
        <span className="badge confirmed">
          <Icon name="check" size={13} />
          Guardado confirmado
        </span>
      )}
    </section>
  );
}
