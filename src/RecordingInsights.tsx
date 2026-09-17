import { useEffect, useState } from "react";
import { allPages, json } from "./api";
import type { Client, Clarification, Version } from "./api";
import type { RecordingReport, Job } from "./recordings";
import { Badge, ErrorNotice } from "./ui";
import { useAction } from "./utils";
import { formatDuration } from "./screenCapture";
import { confirmAction } from "./confirmAction";

type FlowNode = { id: string; type: string; data: { label: string; expected_result?: string; text_sources?: string[]; frames?: { timestamp_ms: number }[] } };
type Flow = { title: string; revision: number; review_status: string; nodes: FlowNode[]; edges: { id: string; source: string; target: string }[] };
type History = { revision: number; created_at: string; snapshot: RecordingReport };
type Transcript = { text: string; analyzed: boolean; audio_present: boolean; exclusion_reason: string | null };

export default function RecordingInsights({ api, report, sessionId, canManage, dirty, onSeek, onChanged, onOpenProcedure }: {
  api: Client; report: RecordingReport; sessionId: string; canManage: boolean; dirty: boolean;
  onSeek: (seconds: number) => void; onChanged: () => void; onOpenProcedure: (procedureId: string, versionId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("questions");
  const [questions, setQuestions] = useState<Clarification[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [historical, setHistorical] = useState<number | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [list, setList] = useState(false);
  const [index, setIndex] = useState<{ indexed: boolean; chunks: number } | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [version, setVersion] = useState<(Version & { procedure_id: string }) | null>(null);
  const { run, busy, error } = useAction();
  const path = `/recordings/${report.recording_id}`;
  useEffect(() => {
    let active = true;
    void run(async () => {
      if (tab === "questions") { const result = await api<Clarification[]>(`/learning-sessions/${sessionId}/clarifications`); if (active) setQuestions(result); }
      if (tab === "transcript") { const result = await api<Transcript>(`${path}/transcript`); if (active) setTranscript(result); }
      if (tab === "history") { const result = await allPages<History>(api, `${path}/report/history`); if (active) setHistory(result); }
      if (tab === "flow") { const result = await api<Flow>(`${path}/flow`); if (active) setFlow(result); }
      if (tab === "publish") { const result = await api<{ indexed: boolean; chunks: number }>(`${path}/index`); if (active) setIndex(result); }
    });
    return () => { active = false; };
  }, [api, path, sessionId, report.revision, tab, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const old = history.find((item) => item.revision === historical);
  const node = flow?.nodes.find((item) => item.id === selected);
  return <section className="insight-panel">
    <h3>Revisar y utilizar lo aprendido</h3>
    <div className="insight-tabs" role="tablist" aria-label="Detalles del informe">{[["questions", "Aclaraciones"], ["transcript", "Transcripción"], ["history", "Revisiones"], ["flow", "Grafo"], ["publish", "Procedimiento e índice"]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    <ErrorNotice error={error} />{message && <p className="success" role="status">{message}</p>}
    <button type="button" className="text-button" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>Actualizar esta sección</button>
    {tab === "questions" && <div>{questions.map((q) => <form className="chat-question" key={q.id} onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const next = await api<Clarification>(`/learning-sessions/${sessionId}/clarifications/${q.id}/answer`, json({ answer: answers[q.id]?.trim() }, "PUT"));
      setQuestions((items) => items.map((item) => item.id === q.id ? next : item));
    }); }}><h4>{q.question}</h4>{q.answer ? <p>{q.answer}</p> : canManage && report.review_status !== "approved" ? <><label>Tu respuesta<textarea required maxLength={10000} value={answers[q.id] || ""} onChange={(event) => setAnswers({ ...answers, [q.id]: event.target.value })} /></label><button className="secondary" disabled={busy || !answers[q.id]?.trim()}>Guardar respuesta</button></> : <p>Respuesta pendiente</p>}</form>)}
    {!questions.length && <p>No hay aclaraciones registradas.</p>}
    {canManage && report.review_status !== "approved" && <button type="button" className="primary" disabled={busy || dirty || questions.some((q) => !q.answer)} onClick={async () => {
      if (!await confirmAction("Se generará una nueva revisión con tus respuestas y notas. El informe actual quedará en el historial.", "Regenerar informe", "Regenerar")) return;
      void run(async () => { await api<Job>(`${path}/report/regenerate`, json({ revision: report.revision })); setMessage("Regeneración en cola. Puedes consultar su progreso en los trabajos de la sesión."); onChanged(); });
    }}>Regenerar con las respuestas</button>}</div>}
    {tab === "transcript" && transcript && <div><p>{transcript.analyzed ? "Audio analizado" : !transcript.audio_present ? "El video no contiene audio" : "El audio no fue analizado"}</p>{transcript.exclusion_reason && <p>Motivo: {transcript.exclusion_reason}</p>}<pre>{transcript.text || "No hay transcripción disponible."}</pre></div>}
    {tab === "history" && <><label>Comparar con revisión anterior<select value={historical ?? ""} onChange={(e) => setHistorical(e.target.value ? Number(e.target.value) : null)}><option value="">Selecciona una revisión</option>{history.map((item) => <option key={item.revision} value={item.revision}>Revisión {item.revision} · {new Date(item.created_at).toLocaleString("es")}</option>)}</select></label>{!history.length && <p>No hay revisiones archivadas.</p>}{old && <div className="revision-comparison">{[{ revision: old.revision, content: old.snapshot.content }, report].map((item) => <article key={item.revision}><h4>Revisión {item.revision}</h4><h3>{item.content.title}</h3><p>{item.content.summary}</p><pre>{item.content.report}</pre><ol>{item.content.instructions.map((step, i) => <li key={i}><strong>{step.instruction}</strong><p>{step.expected_result}</p></li>)}</ol></article>)}</div>}</>}
    {tab === "flow" && flow && <><div className="button-group"><Badge status={flow.review_status} /><span>Revisión {flow.revision}</span><button type="button" className="secondary" onClick={() => setList(!list)}>{list ? "Ver grafo" : "Ver lista accesible"}</button>{!list && <><button aria-label="Alejar grafo" type="button" onClick={() => setZoom((z) => Math.max(.6, z - .1))}>−</button><button type="button" onClick={() => setZoom(1)}>Encajar</button><button aria-label="Acercar grafo" type="button" onClick={() => setZoom((z) => Math.min(1.6, z + .1))}>+</button></>}</div>
    <div className="flow-viewport"><ol className={list ? "flow-list" : "process-flow"} style={list ? undefined : { fontSize: `${zoom}em` }}>{flow.nodes.map((item) => <li key={item.id} className={`node-${item.type}`}><button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.data.label}</button>{!list && flow.edges.filter((edge) => edge.source === item.id).map((edge) => <span className="flow-arrow" key={edge.id} aria-label={`Siguiente: ${flow.nodes.find((target) => target.id === edge.target)?.data.label || edge.target}`}>↓</span>)}</li>)}</ol></div>
    {node && <article className="flow-detail"><h4>{node.data.label}</h4><p>{node.data.expected_result}</p><p>Fuentes: {node.data.text_sources?.join(", ") || "Video"}</p><div className="time-sources">{node.data.frames?.map((frame, i) => <button key={i} type="button" className="time-source" onClick={() => onSeek(frame.timestamp_ms / 1000)}>{formatDuration(frame.timestamp_ms / 1000)}</button>)}</div></article>}</>}
    {tab === "publish" && <><p>{index?.indexed ? `Disponible en búsqueda · ${index.chunks} fragmentos` : "El índice aún no está listo. Consulta el trabajo de indexación para distinguir espera y error."}</p>
    {canManage && report.review_status === "approved" && <div className="button-group"><button type="button" className="primary" disabled={busy || dirty} onClick={() => void run(async () => { const created = await api<Version & { procedure_id: string }>(`${path}/procedure`, { method: "POST" }); setVersion(created); setMessage("Borrador creado. Revisa la versión antes de enviarla al circuito editorial."); })}>Crear / recuperar procedimiento borrador</button><button type="button" className="secondary" disabled={busy || index?.indexed} onClick={() => void run(async () => { await api<Job>(`${path}/index`, { method: "POST" }); setMessage("Indexación solicitada."); onChanged(); setRefresh((n) => n + 1); })}>Indexar / reintentar índice</button></div>}
    {version && <button type="button" className="primary" disabled={busy} onClick={() => void run(() => onOpenProcedure(version.procedure_id, version.id))}>Abrir versión {version.version_number}</button>}
    <p className="connection-note">La publicación se realiza desde el procedimiento: enviar a revisión, aprobar y publicar con el rol correspondiente.</p></>}
  </section>;
}
