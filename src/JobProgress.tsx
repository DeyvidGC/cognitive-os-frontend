import { useEffect, useState } from "react";
import type { Client } from "./api";
import type { Job } from "./recordings";
import { Badge } from "./ui";
export default function JobProgress({
  api,
  initial,
}: {
  api: Client;
  initial: Job;
}) {
  const [job, setJob] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await api<Job>(`/jobs/${initial.id}`);
        if (active) {
          setJob(next);
          setError("");
          if (["completed", "failed"].includes(next.status)) return;
        }
      } catch {
        if (active)
          setError("No se pudo consultar el trabajo; se reintentará.");
      }
      if (active) timer = setTimeout(load, 6000);
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, initial.id]);
  return (
    <div className="job-progress" role="status">
      <Badge status={job.status} />
      <span>
        {job.kind === "analyze_recording"
          ? "Análisis visual"
          : "Generación de procedimiento"}{" "}
        · Intentos: {job.attempts}
      </span>
      {job.version_id && (
        <span>Se generó un borrador. Puedes revisarlo en Procedimientos.</span>
      )}
      {error && <small>{error}</small>}
    </div>
  );
}
