import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export default function VoiceInput({
  value,
  onChange,
  disabled = false,
  name,
  question,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  question?: string;
}) {
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const speech = window as SpeechWindow;
  const Constructor =
    speech.SpeechRecognition || speech.webkitSpeechRecognition;
  useEffect(
    () => () => {
      const current = recognition.current;
      if (current) {
        current.onresult = null;
        current.onerror = null;
        current.onend = null;
        current.abort();
      }
      window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (disabled) recognition.current?.abort();
  }, [disabled]);
  function dictate() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Constructor) return;
    window.speechSynthesis?.cancel();
    const current = new Constructor();
    recognition.current = current;
    current.lang = "es-CO";
    current.continuous = false;
    current.interimResults = false;
    const prefix = value.trim();
    current.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      onChange([prefix, text].filter(Boolean).join(" ").slice(0, 10000));
    };
    current.onerror = () => {
      setError(
        "No se pudo transcribir. Revisa el permiso del micrófono o escribe tu respuesta.",
      );
      setListening(false);
    };
    current.onend = () => setListening(false);
    try {
      setError("");
      current.start();
      setListening(true);
    } catch {
      setError("El dictado no está disponible. Puedes responder por texto.");
    }
  }
  return (
    <div className="voice-answer">
      <label>
        Tu respuesta
        <textarea
          name={name}
          required
          maxLength={10000}
          value={value}
          disabled={disabled || listening}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe o dicta tu respuesta; revísala antes de guardar."
        />
      </label>
      <div className="button-group">
        <button
          className="secondary"
          type="button"
          disabled={disabled || !Constructor}
          onClick={dictate}
        >
          {listening ? "Detener dictado" : "Responder por voz"}
        </button>
        {question && "speechSynthesis" in window && (
          <button
            className="text-button"
            type="button"
            disabled={listening}
            onClick={() => {
              window.speechSynthesis.cancel();
              const message = new SpeechSynthesisUtterance(question);
              message.lang = "es-CO";
              window.speechSynthesis.speak(message);
            }}
          >
            Escuchar pregunta
          </button>
        )}
      </div>
      <small>
        {listening
          ? "Escuchando…"
          : Constructor
            ? "El dictado utiliza el servicio de voz del navegador. Se guarda el texto que confirmes."
            : "Este navegador no ofrece dictado. La respuesta por texto sigue disponible."}
      </small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
