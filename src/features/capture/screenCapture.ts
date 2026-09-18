export type CaptureState = {
  phase:
    | "idle"
    | "selecting"
    | "sharing"
    | "recording"
    | "paused"
    | "stopping"
    | "recorded";
  stream: MediaStream | null;
  clip: string;
  mimeType: string;
  seconds: number;
  bytes: number;
  error: string;
  microphone: "off" | "requesting" | "on" | "muted";
  hasAudio: boolean;
};
const initial: CaptureState = {
  phase: "idle",
  stream: null,
  clip: "",
  mimeType: "",
  seconds: 0,
  bytes: 0,
  error: "",
  microphone: "off",
  hasAudio: false,
};
export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

// Owns browser resources independently of React. No server upload or AI is simulated.
export class ScreenCapture {
  private state: CaptureState = { ...initial };
  private listeners = new Set<() => void>();
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private elapsed = 0;
  private startedAt = 0;
  private generation = 0;
  private microphoneStream: MediaStream | null = null;
  private micGeneration = 0;
  private maxBytes = 250 * 1024 * 1024;
  private maxSeconds = 600;
  setLimits(maxBytes: number, maxSeconds: number) {
    this.maxBytes = maxBytes;
    this.maxSeconds = maxSeconds;
  }
  async enableMicrophone() {
    if (
      !this.state.stream ||
      this.state.phase !== "sharing" ||
      this.state.microphone === "requesting"
    )
      return;
    const generation = ++this.micGeneration;
    this.update({ microphone: "requesting", error: "" });
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (
        generation !== this.micGeneration ||
        !this.state.stream ||
        this.state.phase !== "sharing"
      ) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      this.microphoneStream = mic;
      mic.getAudioTracks().forEach((track) => {
        this.state.stream!.addTrack(track);
        track.onended = () => {
          this.update({
            microphone: "off",
            error:
              "Se interrumpió el micrófono. La grabación de pantalla continúa sin voz.",
          });
        };
      });
      this.update({ microphone: "on", hasAudio: true });
    } catch {
      if (generation === this.micGeneration)
        this.update({
          microphone: "off",
          error:
            "No se pudo activar el micrófono. Revisa el permiso o continúa sin voz.",
        });
    }
  }
  toggleMicrophone() {
    if (!this.microphoneStream) return;
    const enabled = this.state.microphone !== "on";
    this.microphoneStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    this.update({ microphone: enabled ? "on" : "muted" });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<CaptureState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private releaseStream() {
    ++this.micGeneration;
    this.microphoneStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.microphoneStream = null;
    this.state.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }
  private stopTimer() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  async share() {
    if (this.state.phase !== "idle") return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.update({
        error:
          "Este navegador no permite compartir pantalla. Abre la sesión en un navegador de escritorio compatible usando HTTPS o localhost.",
      });
      return;
    }
    const generation = ++this.generation;
    this.update({ phase: "selecting", error: "" });
    try {
      const devices = navigator.mediaDevices as MediaDevices & {
        setCaptureHandleConfig?: (config: {
          handle: string;
          exposeOrigin: boolean;
          permittedOrigins: string[];
        }) => void;
      };
      if (typeof location !== "undefined")
        devices.setCaptureHandleConfig?.({
          handle: "cognitive-os-workspace",
          exposeOrigin: true,
          permittedOrigins: [location.origin],
        });
      const options: DisplayMediaStreamOptions & {
        selfBrowserSurface: "exclude";
        surfaceSwitching: "exclude";
        preferCurrentTab: boolean;
      } = {
        video: {
          frameRate: { ideal: 15, max: 30 },
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
        },
        audio: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "exclude",
        preferCurrentTab: false,
      };
      const stream = await navigator.mediaDevices.getDisplayMedia(options);
      const selectedTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
        getCaptureHandle?: () => { handle?: string } | null;
      };
      if (
        selectedTrack?.getCaptureHandle?.()?.handle === "cognitive-os-workspace"
      ) {
        stream.getTracks().forEach((track) => track.stop());
        this.update({
          phase: "idle",
          error:
            "Elige otra pestaña o aplicación. No se permite capturar este espacio de Cognitive.",
        });
        return;
      }
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => this.stop();
      });
      this.update({ stream, phase: "sharing" });
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({
        phase: "idle",
        error:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "No se compartió ninguna pantalla. Puedes volver a elegirla cuando quieras."
            : "No fue posible compartir la pantalla. Revisa los permisos del navegador e inténtalo otra vez.",
      });
    }
  }
  record() {
    if (
      this.state.phase !== "sharing" ||
      !this.state.stream ||
      this.state.microphone === "requesting"
    )
      return;
    if (typeof MediaRecorder === "undefined") {
      this.update({
        error:
          "Tu navegador puede compartir pantalla, pero no admite grabación local.",
      });
      return;
    }
    try {
      const mimeType = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(this.state.stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2500000,
      });
      this.recorder = recorder;
      this.chunks = [];
      this.elapsed = 0;
      this.startedAt = performance.now();
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        this.chunks.push(event.data);
        const bytes = this.state.bytes + event.data.size;
        this.update({ bytes });
        if (bytes >= this.maxBytes) {
          this.update({
            error:
              "La grabación alcanzó el límite de tamaño permitido y se detuvo. Guarda o descarga el video.",
          });
          this.stop();
        }
      };
      recorder.onstop = () => {
        this.stopTimer();
        this.releaseStream();
        const blob = new Blob(this.chunks, {
          type: recorder.mimeType || mimeType || "video/webm",
        });
        this.chunks = [];
        this.recorder = null;
        this.update({
          stream: null,
          microphone: "off",
          phase: blob.size ? "recorded" : "idle",
          clip: blob.size ? URL.createObjectURL(blob) : "",
          mimeType: blob.type,
          bytes: blob.size,
          ...(!blob.size
            ? {
                error:
                  "La grabación terminó sin contenido. Vuelve a compartir la pantalla.",
              }
            : {}),
        });
      };
      recorder.onerror = () => {
        this.update({
          error:
            "La grabación se interrumpió. Si se recuperó contenido, puedes descargarlo abajo.",
        });
        this.stop();
      };
      recorder.start(1000);
      this.update({ phase: "recording", seconds: 0, bytes: 0, error: "" });
      this.timer = setInterval(() => {
        if (
          this.state.phase === "recording" &&
          (this.elapsed + performance.now() - this.startedAt) / 1000 >=
            Math.max(0.5, this.maxSeconds - 1)
        ) {
          this.update({
            error:
              "Se alcanzó el límite de duración. La grabación se detuvo para poder guardarla.",
          });
          this.stop();
          return;
        }
        if (this.state.phase === "recording")
          this.update({
            seconds: Math.floor(
              (this.elapsed + performance.now() - this.startedAt) / 1000,
            ),
          });
      }, 500);
    } catch {
      this.recorder = null;
      this.update({
        error:
          "No se pudo iniciar la grabación. Puedes detener la pantalla y volver a intentarlo.",
      });
    }
  }
  pause() {
    if (this.state.phase !== "recording" || !this.recorder) return;
    this.recorder.pause();
    this.elapsed += performance.now() - this.startedAt;
    this.update({ phase: "paused", seconds: Math.floor(this.elapsed / 1000) });
  }
  resume() {
    if (this.state.phase !== "paused" || !this.recorder) return;
    this.recorder.resume();
    this.startedAt = performance.now();
    this.update({ phase: "recording" });
  }
  stop() {
    if (this.state.phase === "stopping" || this.state.phase === "recorded")
      return;
    if (this.state.phase === "recording")
      this.elapsed += performance.now() - this.startedAt;
    this.stopTimer();
    if (this.recorder && this.recorder.state !== "inactive") {
      this.update({
        phase: "stopping",
        seconds: Math.floor(this.elapsed / 1000),
      });
      this.recorder.stop();
      this.releaseStream();
    } else {
      this.releaseStream();
      this.update({
        phase: "idle",
        stream: null,
        microphone: "off",
        hasAudio: false,
      });
    }
  }
  reset() {
    this.dispose();
    this.update({ ...initial });
  }
  dispose() {
    ++this.generation;
    this.stopTimer();
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
      this.recorder = null;
    }
    this.releaseStream();
    if (this.state.clip) URL.revokeObjectURL(this.state.clip);
    this.chunks = [];
  }
}
