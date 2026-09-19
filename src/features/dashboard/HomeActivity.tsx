import { useEffect, useState } from "react";
import type { Client } from "../../shared/api";
import type { HomeSummary } from "./dashboard";
import "./Dashboard.css";

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
function actorBadge(name: string) {
  return name === "Cognitive IA" ? "IA" : name.slice(0, 2).toUpperCase();
}
export default function HomeActivity({
  api,
  organizationName,
}: {
  api: Client;
  organizationName: string;
}) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  useEffect(() => {
    let active = true;
    api<HomeSummary>("/dashboard/home")
      .then((s) => active && setSummary(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);
  if (!summary || !summary.recent_activity.length) return null;
  return (
    <section className="panel activity-panel">
      <div className="section-heading">
        <div>
          <h2>Actividad reciente en {organizationName}</h2>
          <p>Lo último que aprendió o dejó pendiente Cognitive.</p>
        </div>
      </div>
      <ul className="activity-list">
        {summary.recent_activity.map((entry) => (
          <li key={entry.id} className="activity-row">
            <span
              className={
                entry.actor_name === "Cognitive IA"
                  ? "activity-avatar ai"
                  : "activity-avatar"
              }
            >
              {actorBadge(entry.actor_name)}
            </span>
            <p>
              <strong>{entry.actor_name}</strong> {entry.label}.
            </p>
            {entry.action === "chatbot.gap_detected" ? (
              <span className="activity-flag">vacío detectado</span>
            ) : (
              <small>{relativeTime(entry.created_at)}</small>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
