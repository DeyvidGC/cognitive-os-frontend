const OUTPUT_SAMPLE_RATE = 24000;
const MAX_QUEUED_SECONDS = 120;

export class VoiceAudio {
  private context = new AudioContext({ sampleRate: 24000 });
  private stream: MediaStream | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextPlay = 0;
  private playback = new Map<string, { start: number; duration: number }>();
  private itemId: string | null = null;
  private interrupted = false;
  private disposed = false;
  private muted = false;
  private speaking: (value: boolean) => void;
  private onPlaybackReset: () => void;
  constructor(
    speaking: (value: boolean) => void,
    onPlaybackReset: () => void = () => {},
  ) {
    this.speaking = speaking;
    this.onPlaybackReset = onPlaybackReset;
  }
  unlock() {
    return this.context.resume();
  }
  async start(send: (data: ArrayBuffer) => void) {
    if (this.context.sampleRate !== 24000)
      throw new Error("El navegador no admite audio a 24 kHz.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.setMuted(this.muted);
    await this.context.audioWorklet.addModule(
      `${import.meta.env.BASE_URL}voice-capture.worklet.js`,
    );
    if (this.disposed) return;
    this.input = this.context.createMediaStreamSource(stream);
    this.worklet = new AudioWorkletNode(this.context, "voice-capture");
    this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!this.disposed && !this.muted) send(event.data);
    };
    this.input.connect(this.worklet);
    // The processor writes no output: keep processing without playing the microphone.
    this.worklet.connect(this.context.destination);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  beginItem(itemId: string) {
    this.itemId = itemId;
    this.interrupted = false;
  }
  interrupt() {
    const itemId = this.itemId;
    const item = itemId ? this.playback.get(itemId) : undefined;
    const audioEndMs = item
      ? Math.floor(Math.max(0, Math.min(item.duration, this.context.currentTime - item.start)) * 1000)
      : 0;
    this.silence();
    this.playback.clear();
    this.itemId = null;
    this.interrupted = true;
    return { item_id: itemId, audio_end_ms: audioEndMs };
  }
  play(data: ArrayBuffer) {
    if (this.disposed || this.interrupted || !data.byteLength) return;
    if (data.byteLength % 2)
      throw new Error("El servidor envió audio PCM incompleto.");
    if (this.context.state !== "running")
      throw new Error(
        "El navegador suspendió el audio. Vuelve a iniciar la llamada.",
      );
    // Received audio can arrive faster than it plays. A normal response can
    // queue more than eight seconds without any network or playback failure.
    // Bound memory for runaway output, but recover playback without hanging up.
    const duration = data.byteLength / 2 / OUTPUT_SAMPLE_RATE;
    const queued = Math.max(0, this.nextPlay - this.context.currentTime);
    if (queued + duration > MAX_QUEUED_SECONDS) {
      this.silence();
      this.onPlaybackReset();
      if (duration > MAX_QUEUED_SECONDS) return;
    }
    const pcm = new DataView(data);
    const values = new Float32Array(data.byteLength / 2);
    for (let i = 0; i < values.length; i++)
      values[i] = pcm.getInt16(i * 2, true) / 32768;
    const buffer = this.context.createBuffer(1, values.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(values, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    this.speaking(true);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size) this.speaking(false);
    };
    const start = Math.max(this.context.currentTime + 0.02, this.nextPlay);
    if (this.itemId) {
      const item = this.playback.get(this.itemId);
      this.playback.set(this.itemId, {
        start: item?.start ?? start,
        duration: (item?.duration ?? 0) + buffer.duration,
      });
      if (this.playback.size > 8) this.playback.delete(this.playback.keys().next().value!);
    }
    source.start(start);
    this.nextPlay = start + buffer.duration;
  }
  silence() {
    this.sources.forEach((source) => {
      source.onended = null;
      source.stop();
      source.disconnect();
    });
    this.sources.clear();
    this.nextPlay = 0;
    this.speaking(false);
  }
  stop() {
    this.disposed = true;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
    }
    this.input?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.silence();
    void this.context.close().catch(() => {});
  }
}
