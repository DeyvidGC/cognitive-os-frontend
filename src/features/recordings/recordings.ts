import { json } from "../../shared/api";
import type { Client } from "../../shared/api";
export type Recording = {
  id: string;
  session_id: string;
  media_type: string;
  title?: string;
  origin?: "screen_capture" | "upload";
  size_bytes: number;
  status:
    "uploading" | "uploaded" | "queued" | "processing" | "ready" | "failed";
  created_at: string;
  uploaded_at: string | null;
  error_code: string | null;
  content_sha256?: string | null;
  audio_consent?: boolean;
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
  stage?: string;
  progress_percent?: number;
  last_error?: string | null;
  available_at?: string;
  max_attempts?: number;
};
export type EvidenceStatement = {
  text: string;
  frame_indices: number[];
  text_sources: string[];
};
export type ReportContent = {
  title: string;
  summary: string;
  report: string;
  instructions: {
    instruction: string;
    expected_result: string;
    frame_indices: number[];
    text_sources?: string[];
    alternatives?: { condition: string; target_step: number | null }[];
  }[];
  uncertainties: string[];
  questions?: string[];
  prerequisites?: EvidenceStatement[];
  business_rules?: EvidenceStatement[];
  exceptions?: EvidenceStatement[];
};
export type RecordingReport = {
  recording_id: string;
  revision: number;
  review_status: string;
  feedback: string | null;
  version_id?: string | null;
  content: ReportContent;
  sampling: {
    duration_ms?: number;
    frame_interval_seconds?: number;
    audio_analyzed?: boolean;
    text_sources?: string[];
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
  private key: string = crypto.randomUUID();
  private reservation: Recording | null = null;
  private transferred = false;
  private audioConsent: boolean;
  private resumable: boolean;
  private hash = "";
  constructor(
    api: Client,
    sessionId: string,
    blob: Blob,
    existing?: Recording,
    audioConsent = false,
    resumable = false,
    private metadata: { title?: string; origin?: "screen_capture" | "upload" } = {},
  ) {
    this.audioConsent = audioConsent;
    this.resumable = resumable;
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
    if (this.resumable) {
      onStage("Comprobando identidad del archivo");
      if (!this.hash) this.hash = await videoHash(this.blob);
      signal.throwIfAborted();
      const storageKey = `cognitive-upload:${this.sessionId}:${this.hash}`;
      // Persist only the idempotency UUID, never credentials, video or signed URLs.
      try {
        const remembered = sessionStorage.getItem(storageKey);
        if (remembered) this.key = remembered;
        else sessionStorage.setItem(storageKey, this.key);
      } catch {
        /* Recovery also uses the server's session recording list. */
      }
      if (!this.reservation) {
        const records = await this.api<Recording[]>(
          `/learning-sessions/${this.sessionId}/recordings`,
          { signal },
        );
        this.reservation = records[0] || null;
      }
      if (
        this.reservation?.content_sha256 &&
        this.reservation.content_sha256 !== this.hash
      )
        throw new Error(
          "Este archivo no coincide con el video original. Selecciona el mismo archivo para reanudar.",
        );
    }
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
            audio_consent: this.audioConsent,
            ...this.metadata,
            ...(this.hash ? { content_sha256: this.hash } : {}),
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
    if (this.resumable && item.content_sha256) {
      if (item.content_sha256 !== this.hash)
        throw new Error("El hash del archivo no coincide con la reserva.");
      const status = await this.api<UploadStatus>(
        `/recordings/${item.id}/upload-status`,
        { signal },
      );
      if (status.complete)
        return this.api<Recording>(`/recordings/${item.id}`, { signal });
      if (status.content_sha256 !== this.hash)
        throw new Error(
          "No se pudo verificar la identidad del video reservado.",
        );
      const blocks = [...status.blocks].sort((a, b) => a.index - b.index);
      if (
        !blocks.length ||
        blocks.reduce((sum, b) => sum + b.size_bytes, 0) !== this.blob.size ||
        blocks.some(
          (b, i) =>
            b.index !== i ||
            b.size_bytes !==
              Math.min(
                status.block_size_bytes,
                this.blob.size - i * status.block_size_bytes,
              ),
        )
      )
        throw new Error("El manifiesto de subida no corresponde al archivo.");
      let completed = blocks
        .filter((b) => b.uploaded)
        .reduce((sum, b) => sum + b.size_bytes, 0);
      onProgress(Math.floor((completed / this.blob.size) * 100));
      for (const block of blocks) {
        if (block.uploaded) continue;
        signal.throwIfAborted();
        onStage(`Subiendo bloque ${block.index + 1} de ${blocks.length}`);
        // Renew authorization for each block so long uploads survive SAS expiry.
        const signed = await this.api<Transfer>(
          `/recordings/${item.id}/upload-url`,
          { method: "POST", signal },
        );
        const url = new URL(signed.url);
        url.searchParams.set("comp", "block");
        url.searchParams.set("blockid", block.id);
        const headers = Object.fromEntries(
          Object.entries(signed.headers).filter(
            ([key]) => key.toLowerCase() !== "x-ms-blob-type",
          ),
        );
        await transferVideo(
          { ...signed, url: url.href, headers },
          this.blob.slice(
            block.index * status.block_size_bytes,
            block.index * status.block_size_bytes + block.size_bytes,
          ),
          (percent) =>
            onProgress(
              Math.floor(
                ((completed + (block.size_bytes * percent) / 100) /
                  this.blob.size) *
                  100,
              ),
            ),
          signal,
        );
        completed += block.size_bytes;
      }
      onStage("Confirmando bloques y guardado");
      return this.api<Recording>(`/recordings/${item.id}/commit-blocks`, {
        method: "POST",
        signal,
      });
    }
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

export async function videoHash(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export type UploadStatus = {
  complete: boolean;
  block_size_bytes: number;
  content_sha256: string;
  blocks: {
    id: string;
    index: number;
    size_bytes: number;
    uploaded: boolean;
  }[];
};
