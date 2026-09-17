import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = (
  await readFile(new URL("../src/recordings.ts", import.meta.url), "utf8")
).replace(
  /import \{ json \} from ['"]\.\/api['"];?/,
  'const json = (body, method = "POST") => ({ method, body: JSON.stringify(body) });',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { RecordingUpload, validateVideo, transferVideo } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const oldXHR = globalThis.XMLHttpRequest;
afterEach(() => {
  globalThis.XMLHttpRequest = oldXHR;
});
const blob = new Blob(["test-video"], { type: "video/webm" });
const reservation = {
  id: "r1",
  session_id: "s1",
  size_bytes: blob.size,
  media_type: "video/webm",
  status: "uploading",
};
function fakeXHR(fail = false) {
  const sent = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    status = 201;
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(key, value) {
      this.headers[key] = value;
    }
    send(value) {
      sent.push({
        method: this.method,
        url: this.url,
        headers: this.headers,
        blob: value,
      });
      queueMicrotask(() => {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: value.size,
          total: value.size,
        });
        if (fail) this.onerror();
        else this.onload();
      });
    }
    abort() {
      this.onabort?.();
    }
  };
  return sent;
}
const signed = {
  method: "PUT",
  url: "https://storage.example.test/video?signed=yes",
  headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "video/webm" },
};
test("signed transfers send only storage headers and report real progress", async () => {
  const sent = fakeXHR();
  const progress = [];
  await transferVideo(
    signed,
    blob,
    (p) => progress.push(p),
    new AbortController().signal,
  );
  assert.equal(sent[0].headers.Authorization, undefined);
  assert.equal(sent[0].headers["x-ms-blob-type"], "BlockBlob");
  assert.equal(sent[0].method, "PUT");
  assert.deepEqual(progress, [100]);
});
test("retry after failed confirmation does not upload twice or reserve another video", async () => {
  const sent = fakeXHR();
  const calls = [];
  let completes = 0;
  const api = async (path, options) => {
    calls.push(path);
    if (path.endsWith("/recordings")) {
      assert.equal(JSON.parse(options.body).consent, true);
      return reservation;
    }
    if (path.endsWith("/upload-url")) return signed;
    if (path.endsWith("/complete")) {
      if (++completes === 1) throw new Error("Network lost");
      return { ...reservation, status: "uploaded" };
    }
    return reservation;
  };
  const task = new RecordingUpload(api, "s1", blob);
  await assert.rejects(
    task.send(
      () => {},
      () => {},
      new AbortController().signal,
    ),
    /Network lost/,
  );
  const result = await task.send(
    () => {},
    () => {},
    new AbortController().signal,
  );
  assert.equal(result.status, "uploaded");
  assert.equal(sent.length, 1);
  assert.equal(calls.filter((p) => p.endsWith("/recordings")).length, 1);
});
test("an ambiguous reservation failure retries with the same idempotency key", async () => {
  fakeXHR();
  const keys = [];
  let failed = false;
  const api = async (path, options) => {
    if (path.endsWith("/recordings")) {
      keys.push(JSON.parse(options.body).idempotency_key);
      if (!failed) {
        failed = true;
        throw new Error("timeout");
      }
      return reservation;
    }
    if (path.endsWith("/upload-url")) return signed;
    if (path.endsWith("/complete"))
      return { ...reservation, status: "uploaded" };
    return reservation;
  };
  const task = new RecordingUpload(api, "s1", blob);
  await assert.rejects(
    task.send(
      () => {},
      () => {},
      new AbortController().signal,
    ),
  );
  await task.send(
    () => {},
    () => {},
    new AbortController().signal,
  );
  assert.equal(keys[0], keys[1]);
});
test("recovered reservation rejects a different file before transfer", async () => {
  const sent = fakeXHR();
  const task = new RecordingUpload(
    async () => reservation,
    "s1",
    new Blob(["different-size"], { type: "video/webm" }),
    reservation,
  );
  await assert.rejects(
    task.send(
      () => {},
      () => {},
      new AbortController().signal,
    ),
    /no coincide/,
  );
  assert.equal(sent.length, 0);
});
test("API limits and pre-cancelled transfers are enforced", async () => {
  const caps = {
    media_types: ["video/webm"],
    max_bytes: 1024,
    max_seconds: 10,
  };
  assert.throws(() => validateVideo(blob, caps, 11), /supera/);
  assert.throws(
    () => validateVideo(new Blob(["x"], { type: "text/plain" }), caps),
    /Formato/,
  );
  assert.throws(() => validateVideo(new Blob(), caps), /vacío/);
  fakeXHR();
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    transferVideo(signed, blob, () => {}, c.signal),
    { name: "AbortError" },
  );
});

test("audio analysis consent is opt-in and retained on reservation retries", async () => {
  for (const allowed of [false, true]) {
    const bodies = [];
    const api = async (path, options) => {
      if (path.includes("learning-sessions")) {
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) throw new Error("connection lost");
        return reservation;
      }
      return { ...reservation, status: "uploaded" };
    };
    const upload = new RecordingUpload(api, "s1", blob, undefined, allowed);
    const send = () => upload.send(() => {}, () => {}, new AbortController().signal);
    await assert.rejects(send, /connection lost/);
    await send();
    assert.equal(bodies[0].audio_consent, allowed);
    assert.equal(bodies[1].audio_consent, allowed);
    assert.equal(bodies[0].idempotency_key, bodies[1].idempotency_key);
  }
});
