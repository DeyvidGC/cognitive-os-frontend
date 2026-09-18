import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { json } from "../../shared/api";
import type { Client } from "../../shared/api";
import type { RecordingReport } from "./recordings";
import { ErrorNotice } from "../../shared/ui";

export default function ReportDocument({
  api,
  report,
  dirty,
}: {
  api: Client;
  report: RecordingReport;
  dirty: boolean;
}) {
  const [format, setFormat] = useState("pdf");
  const [style, setStyle] = useState("tutorial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{
    url: string;
    name: string;
    key: string;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const key = `${report.recording_id}:${report.revision}:${format}:${style}`;
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  async function generate() {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setDownload(null);
    try {
      const blob = await api<Blob>(
        `/recordings/${report.recording_id}/report/file`,
        {
          ...json({ revision: report.revision, format, style }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(300000),
          ]),
        },
      );
      if (controller.signal.aborted) return;
      setDownload({
        url: URL.createObjectURL(blob),
        name: `${style}-${report.recording_id}-r${report.revision}.${format}`,
        key,
      });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo generar el documento.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="report-document">
      <h4>Documento de la sesión</h4>
      <p>
        {report.review_status === "approved"
          ? "Informe aprobado"
          : "Borrador pendiente de validación"}{" "}
        · Revisión {report.revision}
      </p>
      <fieldset disabled={busy} className="document-formats">
        <legend>Formato</legend>
        {[
          ["pdf", "PDF"],
          ["docx", "Word"],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name={`format-${report.recording_id}`}
              checked={format === value}
              onChange={() => setFormat(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Contenido{" "}
        <select
          disabled={busy}
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="tutorial">Tutorial paso a paso</option>
          <option value="report">Informe completo</option>
        </select>
      </label>
      <ErrorNotice error={error} />
      <div className="button-group">
        <button
          type="button"
          className="primary"
          disabled={busy || dirty || report.review_status === "rejected"}
          onClick={() => void generate()}
        >
          <Download size={18} />{" "}
          {busy ? "Preparando capturas y documento..." : "Generar documento"}
        </button>
        {!dirty && download?.key === key && (
          <a className="secondary" href={download.url} download={download.name}>
            Descargar {format === "pdf" ? "PDF" : "Word"}
          </a>
        )}
      </div>
      {busy && <progress aria-label="Generando documento" />}
    </div>
  );
}
