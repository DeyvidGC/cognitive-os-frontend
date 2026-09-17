import { useEffect, useState } from "react";
import { allPages, ApiError } from "./api";
import type { Client } from "./api";
import type { Job } from "./recordings";
import { Badge, ErrorNotice } from "./ui";
export default function SessionJobs({ api, sessionId, refreshKey, processing }: { api: Client; sessionId: string; refreshKey: number; processing: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let again = processing;
      try {
        const next = await allPages<Job>(api, `/learning-sessions/${sessionId}/jobs`);
        if (!active) return;
        setJobs(next); setError(""); failures = 0;
        again = next.some((job) => ["pending", "running"].includes(job.status)) || (processing && !next.length);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "No se pudieron recuperar los trabajos.");
        again = !(e instanceof ApiError && [401, 403, 404].includes(e.status)); failures++;
      }
      if (active && again) timer = setTimeout(load, Math.min(30000, 4000 * 2 ** failures));
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [api, sessionId, refreshKey, processing, retry]);
  return <section className="panel insight-panel"><h3>Procesamiento de la sesión</h3><ErrorNotice error={error} />
    {jobs.length ? jobs.map((job) => <div className="job-progress" key={job.id}><strong>{job.kind === "analyze_recording" ? "Análisis del video" : job.kind === "index_recording" ? "Índice de búsqueda" : "Procedimiento textual"}</strong><Badge status={job.status} /><span>Intentos: {job.attempts}</span></div>) : <p>No hay trabajos registrados.</p>}
    <button className="text-button" onClick={() => setRetry((value) => value + 1)}>Actualizar trabajos</button>
  </section>;
}
