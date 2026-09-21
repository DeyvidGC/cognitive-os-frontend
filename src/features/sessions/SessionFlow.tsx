import { Icon } from "../../shared/ui";

export default function SessionFlow({ stage }: { stage: number }) {
  return <ol className="session-flow" aria-label="Progreso de la sesión">
    {["Configurar", "Capturar", "Revisar", "Publicar"].map((label, i) => <li key={label} className={i === stage ? "current" : i < stage ? "done" : ""} aria-current={i === stage ? "step" : undefined}>
      {i < stage && <Icon name="check" size={13} />}<span>{label}</span>
    </li>)}
  </ol>;
}
