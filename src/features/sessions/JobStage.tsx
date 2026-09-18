import type { Job } from "../recordings/recordings";

const stages: Record<string, string> = {
  queued: "En cola", starting: "Iniciando", downloading: "Recuperando video",
  extracting: "Extrayendo imágenes y audio", transcribing: "Transcribiendo audio",
  analyzing: "Analizando lo enseñado", validating: "Validando fuentes",
  saving: "Guardando informe", embedding: "Creando índice de búsqueda",
  retry_wait: "Esperando reintento", completed: "Completado", failed: "No se pudo completar",
};
const errors: Record<string, string> = {
  ai_authentication_failed: "La clave de IA no es válida. Revisa la configuración del backend.",
  ai_model_access_denied: "La cuenta no tiene acceso al modelo configurado.",
  ai_quota_exhausted: "La cuenta de IA no tiene cuota disponible.",
  ai_rate_limited: "Se alcanzó el límite temporal del proveedor de IA.",
  ai_request_rejected: "El proveedor rechazó la solicitud de análisis. Revisa el backend.",
  ai_service_unavailable: "El servicio de IA no está disponible temporalmente.",
  ai_connection_failed: "No se pudo conectar con el proveedor de IA.",
  video_decode_failed: "No se pudo interpretar el video. Revisa su formato y duración.",
  storage_unavailable: "No se pudo recuperar el video del almacenamiento.",
  recording_integrity_failed: "El video guardado no coincide con su tamaño o huella digital.",
  analysis_validation_failed: "El análisis no pasó la validación de estructura o fuentes.",
};

export default function JobStage({ job }: { job: Job }) {
  return <>
    {job.stage && <span>{stages[job.stage] || "Procesando"}</span>}
    {job.progress_percent !== undefined && <progress
      aria-label="Avance por etapas del trabajo" value={job.progress_percent} max={100}
      style={{ width: 150, maxWidth: "100%" }} />}
    {job.status === "pending" && job.attempts === 0 &&
      <small>Esperando al worker del backend.</small>}
    {job.stage === "retry_wait" && job.available_at &&
      <small>Próximo intento: {new Date(job.available_at).toLocaleTimeString()}</small>}
    {job.last_error && <small role="alert">
      {errors[job.last_error] || "El trabajo falló. Puedes consultar el backend y reintentar."}
    </small>}
  </>;
}
