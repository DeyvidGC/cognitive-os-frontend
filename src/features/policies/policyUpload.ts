import { json } from "../../shared/api";
import type { Client } from "../../shared/api";
import { transferVideo, videoHash } from "../recordings/recordings";
import type { Transfer } from "../recordings/recordings";

export type PolicyDocument = {
  id: string;
  title: string;
  source: "upload" | "sync";
  size_bytes: number;
  status: "uploading" | "queued" | "processing" | "ready" | "failed" | "retired";
  error_code: string | null;
  created_at: string;
  analyzed_at: string | null;
};
export type PolicyCitation = {
  policy_id: string;
  policy_title: string;
  label: string;
  score: number;
};
export type PolicyAnswer = {
  gap_detected: boolean;
  answer: string | null;
  citation: PolicyCitation | null;
  gap: { id: string } | null;
};

// Mirrors the recording upload contract: reserve, transfer the bytes to the
// signed URL, then confirm. Policies are a single PUT, no block manifest.
export async function uploadPolicy(
  api: Client,
  file: File,
  onProgress: (percent: number) => void,
  onStage: (stage: string) => void,
  signal: AbortSignal,
): Promise<PolicyDocument> {
  onStage("Verificando identidad del archivo");
  const hash = await videoHash(file);
  signal.throwIfAborted();
  const policy = await api<PolicyDocument>("/policies", {
    ...json({
      idempotency_key: crypto.randomUUID(),
      size_bytes: file.size,
      content_sha256: hash,
      title: file.name.replace(/\.pdf$/i, ""),
    }),
    signal,
  });
  onStage("Solicitando permiso de subida");
  const transfer = await api<Transfer>(`/policies/${policy.id}/upload-url`, {
    method: "POST",
    signal,
  });
  onStage("Subiendo documento");
  await transferVideo(transfer, file, onProgress, signal);
  onStage("Confirmando guardado");
  return api<PolicyDocument>(`/policies/${policy.id}/complete`, {
    method: "POST",
    signal,
  });
}
