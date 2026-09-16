import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/screenCapture.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { ScreenCapture } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const descriptors = ["navigator", "MediaRecorder"].map((key) => [
  key,
  Object.getOwnPropertyDescriptor(globalThis, key),
]);
const controllers = [];
function setup(getDisplayMedia) {
  const track = {
    label: "Pantalla de prueba",
    onended: null,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const tracks = [track];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => [track],
    addTrack: (t) => tracks.push(t),
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia:
          getDisplayMedia ||
          (async (options) => {
            assert.equal(options.audio, false);
            return stream;
          }),
      },
    },
  });
  class Recorder {
    static isTypeSupported(type) {
      return type === "video/webm";
    }
    state = "inactive";
    mimeType = "video/webm";
    constructor(s) {
      assert.equal(s, stream);
    }
    start() {
      this.state = "recording";
    }
    pause() {
      this.state = "paused";
    }
    resume() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["final video chunk"]) });
        this.onstop?.();
      });
    }
  }
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: Recorder,
  });
  const capture = new ScreenCapture();
  controllers.push(capture);
  return { capture, track, stream };
}
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  descriptors.forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
});
test("sharing does not record until requested; pause and resume preserve the capture", async () => {
  const { capture, track } = setup();
  await capture.share();
  assert.equal(capture.getSnapshot().phase, "sharing");
  capture.record();
  assert.equal(capture.getSnapshot().phase, "recording");
  capture.pause();
  assert.equal(capture.getSnapshot().phase, "paused");
  capture.resume();
  assert.equal(capture.getSnapshot().phase, "recording");
  capture.stop();
  assert.equal(track.stopped, true);
  assert.equal(capture.getSnapshot().phase, "stopping");
  await Promise.resolve();
  assert.equal(capture.getSnapshot().phase, "recorded");
  assert.ok(capture.getSnapshot().bytes > 0);
  assert.match(capture.getSnapshot().clip, /^blob:/);
  assert.equal(capture.getSnapshot().stream, null);
});
test("ending sharing in browser finalizes the recording with the final chunk", async () => {
  const { capture, track } = setup();
  await capture.share();
  capture.record();
  track.onended();
  await Promise.resolve();
  const clip = capture.getSnapshot().clip;
  assert.equal(await (await fetch(clip)).text(), "final video chunk");
  capture.reset();
  assert.equal(capture.getSnapshot().phase, "idle");
  await assert.rejects(fetch(clip));
});
test("cancelled permission returns to a recoverable idle state", async () => {
  const { capture } = setup(async () => {
    throw new DOMException("cancel", "NotAllowedError");
  });
  await capture.share();
  assert.equal(capture.getSnapshot().phase, "idle");
  assert.match(capture.getSnapshot().error, /volver a elegirla/);
});
test("a permission result arriving after unmount immediately stops its tracks", async () => {
  let resolve;
  const { capture, track, stream } = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const sharing = capture.share();
  capture.dispose();
  resolve(stream);
  await sharing;
  assert.equal(track.stopped, true);
  assert.equal(capture.getSnapshot().stream, null);
});
test("unmount stops capture without creating a leaked recording URL", async () => {
  const { capture, track } = setup();
  await capture.share();
  capture.record();
  capture.dispose();
  await Promise.resolve();
  assert.equal(track.stopped, true);
  assert.equal(capture.getSnapshot().clip, "");
});
test("optional microphone is included, can be muted, and is released with the screen", async () => {
  const { capture, stream } = setup();
  const mic = {
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  navigator.mediaDevices.getUserMedia = async (options) => {
    assert.equal(options.video, false);
    return { getTracks: () => [mic], getAudioTracks: () => [mic] };
  };
  await capture.share();
  await capture.enableMicrophone();
  assert.equal(capture.getSnapshot().microphone, "on");
  assert.ok(stream.getTracks().includes(mic));
  capture.record();
  capture.toggleMicrophone();
  assert.equal(mic.enabled, false);
  capture.toggleMicrophone();
  assert.equal(mic.enabled, true);
  capture.stop();
  await Promise.resolve();
  assert.equal(mic.stopped, true);
});
test("microphone denial preserves the shared screen and allows recording without voice", async () => {
  const { capture } = setup();
  navigator.mediaDevices.getUserMedia = async () => {
    throw new DOMException("denied", "NotAllowedError");
  };
  await capture.share();
  await capture.enableMicrophone();
  assert.equal(capture.getSnapshot().phase, "sharing");
  assert.equal(capture.getSnapshot().microphone, "off");
  capture.record();
  assert.equal(capture.getSnapshot().phase, "recording");
});
