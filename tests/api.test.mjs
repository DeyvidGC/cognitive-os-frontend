import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile the actual client with an empty Vite environment for Node's test runner.
const source = (
  await readFile(new URL("../src/api.ts", import.meta.url), "utf8")
).replace("import.meta.env", "({})");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { client, json, allPages, ApiError } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("authenticated JSON requests carry the token and selected organization", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/learning-sessions");
    assert.equal(options.headers.get("Authorization"), "Bearer token");
    assert.equal(options.headers.get("X-Organization-Id"), "org-2");
    assert.equal(options.headers.get("Content-Type"), "application/json");
    assert.equal(JSON.parse(options.body).consent, true);
    return Response.json({ id: "session" });
  };
  assert.deepEqual(
    await client("token", "org-2")(
      "/learning-sessions",
      json({ consent: true }),
    ),
    { id: "session" },
  );
});
test("multipart evidence leaves boundary generation to the browser", async () => {
  const data = new FormData();
  data.append(
    "file",
    new Blob(["image"], { type: "image/png" }),
    "capture.png",
  );
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.has("Content-Type"), false);
    assert.equal(options.body, data);
    return Response.json({ id: "evidence" });
  };
  await client("token", "org")("/learning-sessions/id/evidence", {
    method: "POST",
    body: data,
  });
});
test("401 expires authenticated sessions, but invalid login does not invoke expiration", async () => {
  let expired = 0;
  globalThis.fetch = async () =>
    Response.json({ detail: "Invalid credentials" }, { status: 401 });
  await assert.rejects(
    client("token", "org", () => expired++)("/auth/me"),
    (error) => error instanceof ApiError && error.status === 401,
  );
  await assert.rejects(
    client("", "", () => expired++)("/auth/login", json({})),
  );
  assert.equal(expired, 1);
});
test("204 logout is handled without parsing an empty body", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(
    await client("token")("/auth/logout", { method: "POST" }),
    undefined,
  );
});
test("pagination keeps all events beyond the first page", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return Response.json(
      url.endsWith("offset=0")
        ? Array.from({ length: 100 }, (_, id) => ({ id }))
        : [{ id: 100 }],
    );
  };
  const events = await allPages(
    client("token", "org"),
    "/learning-sessions/id/events",
  );
  assert.equal(events.length, 101);
  assert.equal(
    urls[1],
    "/api/v1/learning-sessions/id/events?limit=100&offset=100",
  );
});
test("database failures, validation details and offline errors are actionable", async () => {
  globalThis.fetch = async () =>
    Response.json({ detail: "Database is not configured" }, { status: 503 });
  await assert.rejects(client()("/auth/login"), /base de datos configurada/);
  globalThis.fetch = async () =>
    Response.json(
      { detail: [{ loc: ["body", "password"], msg: "Too short" }] },
      { status: 422 },
    );
  await assert.rejects(client()("/auth/register"), /password: Too short/);
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(client()("/procedures"), /No se pudo conectar/);
});
