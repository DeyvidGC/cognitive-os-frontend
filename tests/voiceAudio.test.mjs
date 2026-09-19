import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const source = (
  await readFile(
    new URL("../src/features/agent/voiceAudio.ts", import.meta.url),
    "utf8",
  )
).replace("import.meta.env.BASE_URL", '"/"');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { VoiceAudio } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const originals = Object.fromEntries(
  ["AudioContext", "AudioWorkletNode", "navigator"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
function setup(getMedia) {
  let context, worklet;
  const track = {
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const sources = [],
    buffers = [];
  globalThis.AudioContext = class {
    constructor(options) {
      assert.equal(options.sampleRate, 24000);
      this.sampleRate = 24000;
      this.state = "running";
      this.currentTime = 1;
      this.destination = {};
      this.audioWorklet = { addModule: async () => {} };
      context = this;
    }
    async resume() {}
    async close() {
      this.closed = true;
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createBuffer(channels, size, rate) {
      assert.equal(channels, 1);
      assert.equal(rate, 24000);
      return {
        duration: size / rate,
        copyToChannel(values) {
          buffers.push(values);
        },
      };
    }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        start(at) {
          this.at = at;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    }
  };
  globalThis.AudioWorkletNode = class {
    constructor() {
      this.port = {};
      worklet = this;
    }
    connect() {}
    disconnect() {}
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: getMedia || (async () => stream) } },
  });
  return {
    track,
    stream,
    sources,
    buffers,
    context: () => context,
    worklet: () => worklet,
  };
}
test("voice stream sends binary chunks, obeys mute and releases its own microphone", async () => {
  const env = setup(),
    sent = [];
  const audio = new VoiceAudio(() => {});
  await audio.start((data) => sent.push(data));
  const data = new ArrayBuffer(960);
  env.worklet().port.onmessage({ data });
  audio.setMuted(true);
  env.worklet().port.onmessage({ data });
  assert.equal(sent.length, 1);
  assert.equal(sent[0], data);
  assert.equal(env.track.enabled, false);
  audio.stop();
  assert.equal(env.track.stopped, true);
  assert.equal(env.context().closed, true);
  assert.equal(env.worklet().port.onmessage, null);
});
test("microphone permission arriving after hangup is released immediately", async () => {
  let resolve;
  const env = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const audio = new VoiceAudio(() => {});
  const pending = audio.start(() => assert.fail("Must not send after hangup"));
  audio.stop();
  resolve(env.stream);
  await pending;
  assert.equal(env.track.stopped, true);
  assert.equal(env.worklet(), undefined);
});
test("PCM playback is signed little-endian, queued in order and stopped on hangup", () => {
  const env = setup(),
    speaking = [];
  const audio = new VoiceAudio((value) => speaking.push(value));
  const data = new Uint8Array([0, 128, 0, 0, 255, 127]).buffer;
  audio.play(data);
  audio.play(data);
  assert.equal(env.buffers[0][0], -1);
  assert.equal(env.buffers[0][1], 0);
  assert.ok(env.buffers[0][2] > 0.99);
  assert.ok(env.sources[1].at > env.sources[0].at);
  assert.throws(() => audio.play(new ArrayBuffer(3)), /incompleto/);
  audio.stop();
  assert.ok(env.sources.every((item) => item.stopped));
  assert.equal(speaking.at(-1), false);
});
test("AudioWorklet downmixes and encodes 20ms mono PCM chunks below the minimum server limit", async () => {
  const source = await readFile(
    new URL("../public/voice-capture.worklet.js", import.meta.url),
    "utf8",
  );
  let Processor;
  const chunks = [];
  vm.runInNewContext(source, {
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (data) => chunks.push(data) };
      }
    },
    registerProcessor: (_name, value) => {
      Processor = value;
    },
  });
  const processor = new Processor();
  const channel = new Float32Array(480);
  channel.fill(0.5);
  channel[0] = -1;
  channel[1] = 1;
  processor.process([[channel]]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].byteLength, 960);
  const pcm = new DataView(chunks[0]);
  assert.equal(pcm.getInt16(0, true), -32768);
  assert.equal(pcm.getInt16(2, true), 32767);
  assert.equal(pcm.getInt16(4, true), 16384);
});
