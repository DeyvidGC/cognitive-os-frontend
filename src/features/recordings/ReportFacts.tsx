import type { EvidenceStatement, RecordingReport } from "./recordings";
export default function ReportFacts({
  facts,
  report,
  onSeek,
}: {
  facts: EvidenceStatement[];
  report: RecordingReport;
  onSeek: (seconds: number) => void;
}) {
  return (
    <ul className="report-facts">
      {facts.map((fact, index) => (
        <li key={index}>
          <span className="fact-number">{index + 1}</span>
          <div>
            <p>{fact.text}</p>
            {fact.frame_indices.length > 0 && (
              <details className="fact-evidence">
                <summary>Consultar evidencia</summary>
                <div className="button-group">
                  {fact.frame_indices.map((frameIndex, sourceIndex) => {
                    const frame = report.sampling.frames.find(
                      (item) => item.index === frameIndex,
                    );
                    return (
                      frame && (
                        <button
                          type="button"
                          className="text-button"
                          key={frameIndex}
                          onClick={() => onSeek(frame.timestamp_ms / 1000)}
                        >
                          Ver evidencia {sourceIndex + 1}
                        </button>
                      )
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
