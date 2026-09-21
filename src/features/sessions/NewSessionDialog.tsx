import { useState } from "react";
import type { Client, Procedure, Session } from "../../shared/api";
import { json } from "../../shared/api";
import { useAction } from "../../shared/utils";
import { ErrorNotice, Icon, Modal, Select } from "../../shared/ui";
import SessionFlow from "./SessionFlow";
import "./Sessions.css";

export default function NewSessionDialog({ api, procedures, organizationName, objective = "", procedureId = "", onCreated, close }: {
  api: Client; procedures: Procedure[]; organizationName: string; objective?: string; procedureId?: string;
  onCreated: (session: Session, source: "share" | "upload") => void; close: () => void;
}) {
  const [source, setSource] = useState<"share" | "upload">("share");
  const [procedure, setProcedure] = useState(procedureId);
  const { busy, error, run } = useAction();
  return <Modal title="¿Qué vas a enseñar?" eyebrow="PASO 1 DE 3" className="new-session-dialog" close={() => { if (!busy) close(); }}>
    <p className="form-intro">Descríbelo como se lo contarías a alguien que entra al equipo.</p>
    <ErrorNotice error={error} />
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void run(async () => {
        const objective = String(form.get("objective") || "").trim();
        const application = String(form.get("application_name") || "").trim();
        if (!objective || !application) throw new Error("Completa el objetivo y la aplicación para continuar.");
        const session = await api<Session>("/learning-sessions", json({ objective, application_name: application, procedure_id: form.get("procedure_id") || null, consent: form.get("consent") === "on" }));
        onCreated(session, source);
      });
    }}>
      <fieldset disabled={busy}>
        <label>Objetivo<input name="objective" defaultValue={objective} placeholder="Cómo crear y enviar una cotización" required maxLength={4000} autoFocus /></label>
        <div className="session-form-row"><label>Aplicación<input name="application_name" placeholder="Ej. BrokerUp" required maxLength={200} /></label>
          <label>¿Proceso nuevo o actualizas uno?<Select name="procedure_id" ariaLabel="¿Proceso nuevo o actualizas uno?" value={procedure} onChange={setProcedure} options={[{ value: "", label: "Es un proceso nuevo" }, ...procedures.map(p => ({ value: p.id, label: p.title }))]} /></label></div>
        <fieldset className="capture-choice"><legend>¿Cómo lo vas a capturar?</legend>
          {[{ id: "share" as const, title: "Compartir pantalla", text: "Grabas mientras explicas. El agente te acompaña.", icon: "monitor" }, { id: "upload" as const, title: "Subir un video", text: "Ya lo tienes grabado. Lo analizamos igual.", icon: "upload" }].map(option => <label className={`capture-option ${source === option.id ? "selected" : ""}`} key={option.id}>
            <Icon name={option.icon} size={20} /><span><strong>{option.title}</strong><small>{option.text}</small></span><input type="radio" name="source" value={option.id} checked={source === option.id} onChange={() => setSource(option.id)} />
          </label>)}
          <label className="capture-option unavailable"><Icon name="book" size={20} /><span><strong>Importar un documento</strong><small>Un manual o un instructivo. Aún no disponible.</small></span><input type="radio" name="source" disabled aria-label="Importar un documento, aún no disponible" /></label>
        </fieldset>
        <label className="session-consent"><input type="checkbox" name="consent" required /><span>Autorizo guardar el video, las notas y las capturas de esta sesión en <strong>{organizationName}</strong>. Solo tu equipo podrá verlas.</span></label>
        <footer className="session-form-footer"><SessionFlow stage={0} /><button className="primary" type="submit">{busy ? "Creando sesión…" : "Continuar"}<Icon name="arrow" size={16} /></button></footer>
      </fieldset>
    </form>
  </Modal>;
}
