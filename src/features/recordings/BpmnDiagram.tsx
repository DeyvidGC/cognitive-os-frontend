import { horizontalBpmn } from "./horizontalBpmn";
import { useEffect, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import type Canvas from "diagram-js/lib/core/Canvas";
import { Download, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

export default function BpmnDiagram({
  xml,
  filename,
  onSelect,
}: {
  xml: string;
  filename: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<NavigatedViewer | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const instance = new NavigatedViewer({ container: container.current! });
    viewer.current = instance;
    let active = true;
    const observer = new ResizeObserver(() =>
      instance.get<Canvas>("canvas").resized(),
    );
    observer.observe(container.current!);
    instance.on("element.click", (event: { element: { id: string } }) => {
      onSelect(event.element.id.replace("decision-", "step-"));
    });
    void Promise.resolve()
      .then(() => instance.importXML(horizontalBpmn(xml)))
      .then(() => {
        if (!active) return;
        setError("");
        const canvas = instance.get<Canvas>("canvas");
        canvas.zoom("fit-viewport");
      })
      .catch(() => {
        if (active) setError("No se pudo representar el diagrama BPMN.");
      });
    return () => {
      active = false;
      observer.disconnect();
      instance.destroy();
      viewer.current = null;
    };
  }, [xml, onSelect]);
  function zoom(factor: number) {
    const canvas = viewer.current?.get<Canvas>("canvas");
    if (canvas) canvas.zoom(Math.max(0.1, Math.min(3, canvas.zoom() * factor)));
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([horizontalBpmn(xml)], { type: "application/xml" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="bpmn-tool">
      <div className="button-group bpmn-toolbar">
        <button
          type="button"
          className="secondary"
          title="Alejar"
          aria-label="Alejar"
          onClick={() => zoom(0.8)}
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          className="secondary"
          title="Acercar"
          aria-label="Acercar"
          onClick={() => zoom(1.25)}
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          className="secondary"
          title="Encajar diagrama"
          aria-label="Encajar diagrama"
          onClick={() => {
            const canvas = viewer.current?.get<Canvas>("canvas");
            canvas?.resized();
            canvas?.zoom("fit-viewport");
          }}
        >
          <Maximize size={18} />
        </button>
        <button type="button" className="secondary" onClick={download}>
          <Download size={18} /> Descargar BPMN
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        ref={container}
        className="bpmn-canvas"
        role="img"
        aria-label="Proceso BPMN: actividades y decisiones del usuario"
      />
    </div>
  );
}
