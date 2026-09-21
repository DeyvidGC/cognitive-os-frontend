import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(new URL(
  "../src/features/agent/liveSnapshot.ts", import.meta.url,
), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { LiveSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("hidden-tab capture reuses resources, closes bitmaps and leaves shared track running", async () => {
  const originals = { document: globalThis.document, ImageCapture: globalThis.ImageCapture };
  let videos = 0, canvases = 0, closed = 0, grabs = 0;
  const track = { stop() { assert.fail("Shared screen belongs to ScreenStudio"); } };
  const video = { pause() {}, play() { assert.fail("ImageCapture does not need video playback"); } };
  const canvas = {
    getContext: () => ({ drawImage() {} }),
    toBlob: (done) => done(new Blob([new Uint8Array([1, 2, 3])])),
  };
  globalThis.document = { hidden: true, createElement(kind) {
    if (kind === "video") { videos++; return video; }
    canvases++; return canvas;
  } };
  globalThis.ImageCapture = class {
    constructor(value) { assert.equal(value, track); }
    async grabFrame() {
      grabs++;
      return { width: 1920, height: 1080, close() { closed++; } };
    }
  };
  try {
    const capture = new LiveSnapshot({ getVideoTracks: () => [track] });
    assert.equal(await capture.take(), "AQID");
    assert.equal(await capture.take(), "AQID");
    assert.equal(videos, 1);
    assert.equal(canvases, 1);
    assert.equal(grabs, 2);
    assert.equal(closed, 2);
    assert.equal(canvas.width, 1280);
    assert.equal(canvas.height, 720);
    capture.dispose();
    assert.equal(video.srcObject, null);
    await assert.rejects(capture.take(), /cerrada/);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
