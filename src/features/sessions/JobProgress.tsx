import { useEffect, useState } from "react";
import type { Client } from "../../shared/api";
import { ApiError } from "../../shared/api";
import type { Job } from "../recordings/recordings";
import { Badge } from "../../shared/ui";
import JobStage from "./JobStage";
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
    let failures = 0;
    async function load() {
      try {
        const next = await api<Job>(`/jobs/${initial.id}`);
        if (active) {
          setJob(next);
          setError("");
          failures = 0;
          if (["completed", "failed"].includes(next.status)) return;
        }
      } catch (e) {
        failures++;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          if (active) setError(e.message);
          return;
        }
        if (active)
          setError("No se pudo consultar el trabajo; se reintentará.");
      }
      if (active)
        timer = setTimeout(load, Math.min(30000, 6000 * 2 ** failures));
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
      <JobStage job={job} />
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
