import { json } from "./api";
import type { Client } from "./api";
export type Recording = {
  id: string;
  session_id: string;
  media_type: string;
  size_bytes: number;
  status:
    "uploading" | "uploaded" | "queued" | "processing" | "ready" | "failed";
  created_at: string;
  uploaded_at: string | null;
  error_code: string | null;
};
export type RecordingCapabilities = {
  media_types: string[];
  max_bytes: number;
  max_seconds: number;
  frame_interval_seconds: number;
  storage_configured: boolean;
  analysis_mode: string;
  audio_supported: boolean;
  max_recordings_per_session: number;
};
export type Transfer = {
  url: string;
  method: "PUT" | "GET";
  expires_at: string;
  headers: Record<string, string>;
};
export type Job = {
  id: string;
  session_id: string;
  version_id: string | null;
  recording_id: string | null;
  status: string;
  attempts: number;
  kind: string;
};
export type ReportContent = {
  title: string;
  summary: string;
  report: string;
  instructions: {
    instruction: string;
    expected_result: string;
    frame_indices: number[];
  }[];
  uncertainties: string[];
};
export type RecordingReport = {
  recording_id: string;
  revision: number;
  review_status: string;
  feedback: string | null;
  content: ReportContent;
  sampling: {
    duration_ms?: number;
    frame_interval_seconds?: number;
    audio_analyzed?: boolean;
    frames: { index: number; timestamp_ms: number }[];
  };
};

export function validateVideo(
  blob: Blob,
  capabilities: RecordingCapabilities,
  duration?: number,
) {
  if (!blob.size)
    throw new Error("El video está vacío. Selecciona una grabación válida.");
  if (blob.size > capabilities.max_bytes)
    throw new Error(
      `El video supera el límite de ${Math.floor(capabilities.max_bytes / 1048576)} MB.`,
    );
  if (!capabilities.media_types.includes(blob.type.split(";")[0]))
    throw new Error("Formato no admitido. Usa WebM o MP4.");
  if (
    duration !== undefined &&
    (!Number.isFinite(duration) || duration > capabilities.max_seconds)
  )
    throw new Error(
      `El video supera ${capabilities.max_seconds} segundos o su duración no es válida.`,
    );
}
// The signed URL carries its own authorization. Never forward the application's bearer token.
export function transferVideo(
  transfer: Transfer,
  blob: Blob,
  progress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelado", "AbortError"));
      return;
    }
    if (transfer.method !== "PUT") {
      reject(
        new Error("La API no devolvió una autorización de subida válida."),
      );
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", transfer.url);
    xhr.timeout = 15 * 60 * 1000;
    Object.entries(transfer.headers).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error(
              "El almacenamiento rechazó la subida. Reintenta para renovar el permiso.",
            ),
      );
    xhr.onerror = () =>
      finish(
        new Error(
          "No se pudo subir el video. Revisa la conexión y la configuración CORS del almacenamiento.",
        ),
      );
    xhr.ontimeout = () =>
      finish(
        new Error(
          "La subida tardó demasiado. Puedes reintentar sin crear otra grabación.",
        ),
      );
    xhr.onabort = () =>
      finish(
        new DOMException("Subida cancelada; puedes reintentar.", "AbortError"),
      );
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  });
}
// Retains the reservation and idempotency key across retries, including ambiguous HTTP failures.
export class RecordingUpload {
  private api: Client;
  private sessionId: string;
  private blob: Blob;
  private key = crypto.randomUUID();
  private reservation: Recording | null = null;
  private transferred = false;
  constructor(
    api: Client,
    sessionId: string,
    blob: Blob,
    existing?: Recording,
  ) {
    this.api = api;
    this.sessionId = sessionId;
    this.blob = blob;
    this.reservation = existing || null;
  }
  async send(
    onProgress: (percent: number) => void,
    onStage: (stage: string) => void,
    signal: AbortSignal,
  ) {
    onStage("Reservando espacio");
    if (!this.reservation)
      this.reservation = await this.api<Recording>(
        `/learning-sessions/${this.sessionId}/recordings`,
        {
          ...json({
            idempotency_key: this.key,
            media_type: this.blob.type.split(";")[0],
            size_bytes: this.blob.size,
            consent: true,
          }),
          signal,
        },
      );
    const item = await this.api<Recording>(
      `/recordings/${this.reservation.id}`,
      { signal },
    );
    if (item.status !== "uploading") return item;
    if (
      item.size_bytes !== this.blob.size ||
      item.media_type !== this.blob.type.split(";")[0]
    )
      throw new Error(
        "Selecciona el mismo video con el que comenzaste la subida. El tamaño o el formato no coincide.",
      );
    if (!this.transferred) {
      onStage("Subiendo video");
      const signed = await this.api<Transfer>(
        `/recordings/${item.id}/upload-url`,
        { method: "POST", signal },
      );
      await transferVideo(signed, this.blob, onProgress, signal);
      this.transferred = true;
    }
    onStage("Verificando guardado");
    return this.api<Recording>(`/recordings/${item.id}/complete`, {
      method: "POST",
      signal,
    });
  }
}
