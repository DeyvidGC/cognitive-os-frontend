// Reuse capture resources; grabFrame keeps working when the preview tab is hidden.
export class LiveSnapshot {
  private video = document.createElement("video");
  private canvas = document.createElement("canvas");
  private grabber?: { grabFrame(): Promise<ImageBitmap> };
  private disposed = false;
  constructor(stream: MediaStream) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
    const Capture = (globalThis as typeof globalThis & {
      ImageCapture?: new (track: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> };
    }).ImageCapture;
    if (Capture) this.grabber = new Capture(stream.getVideoTracks()[0]);
  }
  async take(): Promise<string> {
    if (this.disposed) throw new Error("Captura cerrada");
    let bitmap: ImageBitmap | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        if (this.grabber) {
          try { bitmap = await this.grabber.grabFrame(); }
          catch { this.grabber = undefined; }
        }
        if (!bitmap) await this.video.play();
        if (expired || this.disposed) throw new Error("Captura cancelada");
        const width = bitmap?.width ?? this.video.videoWidth;
        const height = bitmap?.height ?? this.video.videoHeight;
        if (!width || !height) throw new Error("La pantalla aún no está lista");
        const scale = Math.min(1, 1280 / width, 720 / height);
        this.canvas.width = Math.round(width * scale);
        this.canvas.height = Math.round(height * scale);
        this.canvas.getContext("2d")!.drawImage(bitmap ?? this.video, 0, 0, this.canvas.width, this.canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => this.canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error("No se pudo capturar")), "image/jpeg", 0.6,
        ));
        if (blob.size > 512000) throw new Error("Captura demasiado grande");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      } finally { bitmap?.close(); }
    };
    try {
      return await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error("Captura temporalmente no disponible")); }, 1500);
      })]);
    } finally { clearTimeout(timer); }
  }
  dispose() {
    this.disposed = true;
    this.video.pause();
    this.video.srcObject = null;
  }
}
