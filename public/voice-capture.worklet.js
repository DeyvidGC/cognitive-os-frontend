/* global AudioWorkletProcessor, registerProcessor */
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(480);
    this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let value = 0;
      for (const channel of channels) value += channel[index] / channels.length;
      this.samples[this.offset++] = value;
      if (this.offset === 480) {
        const buffer = new ArrayBuffer(960);
        const view = new DataView(buffer);
        for (let i = 0; i < 480; i++) {
          const sample = Math.max(-1, Math.min(1, this.samples[i]));
          view.setInt16(
            i * 2,
            Math.round(sample * (sample < 0 ? 32768 : 32767)),
            true,
          );
        }
        this.port.postMessage(buffer, [buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("voice-capture", VoiceCapture);
