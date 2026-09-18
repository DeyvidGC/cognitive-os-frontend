import { useRef, useState } from "react";
export const labels: Record<string, string> = {
  capturing: "En captura",
  processing: "Analizando",
  uploading: "Subida pendiente",
  uploaded: "Video guardado",
  queued: "En cola",
  ready: "Análisis completado",
  completed: "Completado",
  failed: "Error",
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  published: "Publicado",
  retired: "Retirado",
  pending: "Pendiente",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  owner: "Propietario",
  author: "Autor",
  reviewer: "Revisor",
  reader: "Lector",
};
/*
  Los tres estados del conocimiento salen de dos campos que la API ya entrega:
  `origin` dice de dónde vino y `validation_status` si alguien lo aprobó. La
  validación humana manda sobre el origen, porque es la que da confianza.
*/
export function knowledgeState(origin: string, validation: string) {
  if (validation === "confirmed") return { key: "validado", label: "Validado" };
  if (validation === "rejected") return { key: "rechazado", label: "Rechazado" };
  if (origin === "inferred") return { key: "inferido", label: "Inferido" };
  return { key: "observado", label: "Observado" };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error inesperado.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function date(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
