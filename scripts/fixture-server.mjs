// Isolated, disposable UI fixture. Never used by the application by default.
// API_PROXY_TARGET=http://127.0.0.1:8011 npm run dev -- --port 5174
import http from "node:http";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const organization = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const sessions = [
  "Crear y enviar una cotización",
  "Validar documentos del cliente",
  "Registrar una nueva solicitud",
].map((objective, i) => ({
  id: randomUUID(),
  author_id: userId,
  objective,
  application_name: ["Portal comercial", "Gestión documental", "CRM"][i],
  status: "capturing",
  created_at: now,
}));
const procedures = [
  "Gestión de cotizaciones",
  "Alta de nuevos clientes",
  "Revisión de solicitudes",
].map((title, i) => ({
  id: randomUUID(),
  title,
  scope: [
    "Del primer contacto a una propuesta lista para enviar.",
    "Los pasos para dar la bienvenida a un nuevo cliente.",
    "Validaciones necesarias antes de continuar el proceso.",
  ][i],
  created_at: now,
}));
const versions = new Map();
const steps = new Map();
const tutorials = new Map();
const events = new Map();
const questions = new Map();
questions.set(sessions[1].id, [{ id: 'demo-question', question: '¿Qué se hace si la identificación no coincide?', answer: null }]);
const evidences = new Map();
sessions[1].status = 'completed';
const demoRecording = { id: '30000000-0000-4000-8000-000000000001', session_id: sessions[1].id, media_type: 'video/webm', size_bytes: 1200000, status: 'ready', created_at: now, uploaded_at: now, error_code: null };
let demoReport = { recording_id: demoRecording.id, revision: 1, review_status: 'pending', feedback: null, content: { title: 'Validación de documentos del cliente', summary: 'Revisión de la identificación antes de registrar la solicitud.', report: 'Se identificaron dos pasos que requieren revisión humana. Este es un informe de prueba.', instructions: [{ instruction: 'Abrir la ficha del cliente', expected_result: 'La ficha muestra los datos registrados.', frame_indices: [0] }, { instruction: 'Comparar la identificación con el documento recibido', expected_result: 'El número y nombre coinciden.', frame_indices: [1, 2] }], uncertainties: ['Confirmar qué hacer si la identificación no coincide.'] }, sampling: { frames: [{ index: 0, timestamp_ms: 0 }, { index: 1, timestamp_ms: 10000 }, { index: 2, timestamp_ms: 20000 }], duration_ms: 25000, audio_analyzed: false } };
let requests = 0;
const reportHistory = [];
const server = http.createServer(async (req, res) => {
  function send(value, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(status === 204 ? undefined : JSON.stringify(value));
  }
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const method = req.method;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : {};
    if (path === "/health") return send({ status: "ok" });
    if (path === "/auth/login") {
      if (
        body.email !== "prueba@example.com" ||
        body.password !== "Prueba-local-2026"
      )
        return send({ detail: "Invalid credentials" }, 401);
      return send({
        access_token: "fixture-only",
        token_type: "bearer",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }
    if (path === "/auth/register")
      return send({ detail: "Registration is disabled" }, 403);
    assert.equal(
      req.headers.authorization,
      "Bearer fixture-only",
      "Missing bearer token",
    );
    if (path === "/auth/me")
      return send({
        id: userId,
        display_name: "Alex Rivera",
        email: "prueba@example.com",
        memberships: [
          {
            organization_id: organization,
            organization_name: "Cognitive Studio",
            role: "owner",
          },
          {
            organization_id: "10000000-0000-4000-8000-000000000002",
            organization_name: "Biblioteca de prueba",
            role: "reader",
          },
        ],
      });
    if (path === "/auth/logout") return send(null, 204);
    const reader =
      req.headers["x-organization-id"] ===
      "10000000-0000-4000-8000-000000000002";
    assert.ok(
      reader || req.headers["x-organization-id"] === organization,
      "Missing organization header",
    );
    if (reader && path.startsWith("/learning-sessions"))
      return send({ detail: "Capture access denied" }, 403);
    requests++;
    if (path === `/recordings/${demoRecording.id}/transcript`) return send({ text: "Comprueba que el nombre y el número coincidan.", analyzed: true, audio_present: true, revision: demoReport.revision, exclusion_reason: null });
    if (path === `/recordings/${demoRecording.id}/report/history`) return send(reportHistory);
    if (path === `/recordings/${demoRecording.id}/flow/bpmn`) {
      const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
      const nodes = [{ id: 'start', type: 'startEvent', name: 'Inicio' }, ...demoReport.content.instructions.map((step, index) => ({ id: `step-${index}`, type: 'task', name: step.instruction })), { id: 'end', type: 'endEvent', name: 'Fin' }];
      const flows = nodes.slice(1).map((node, index) => ({ id: `flow-${index}`, source: nodes[index].id, target: node.id }));
      const xml = `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions" targetNamespace="http://example.test/bpmn"><bpmn:process id="Process" isExecutable="false">${nodes.map(node => `<bpmn:${node.type} id="${node.id}" name="${escape(node.name)}"/>`).join('')}${flows.map(flow => `<bpmn:sequenceFlow id="${flow.id}" sourceRef="${flow.source}" targetRef="${flow.target}"/>`).join('')}</bpmn:process><bpmndi:BPMNDiagram id="Diagram"><bpmndi:BPMNPlane id="Plane" bpmnElement="Process">${nodes.map((node, index) => `<bpmndi:BPMNShape id="shape-${node.id}" bpmnElement="${node.id}"><dc:Bounds x="200" y="${100 + index * 190}" width="160" height="80"/></bpmndi:BPMNShape>`).join('')}${flows.map((flow, index) => `<bpmndi:BPMNEdge id="edge-${flow.id}" bpmnElement="${flow.id}"><di:waypoint x="280" y="${180 + index * 190}"/><di:waypoint x="280" y="${290 + index * 190}"/></bpmndi:BPMNEdge>`).join('')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
      return send({ xml, revision: demoReport.revision });
    }
    if (path === `/recordings/${demoRecording.id}/index`) return send({ indexed: demoReport.review_status === "approved", chunks: 3, revision: demoReport.revision });
    if (path === `/recordings/${demoRecording.id}/flow`) {
      const nodes = [{ id: "start", type: "input", data: { label: "Inicio" } }, ...demoReport.content.instructions.map((step, i) => ({ id: `step-${i}`, type: "default", data: { label: step.instruction, expected_result: step.expected_result, frames: step.frame_indices.map((n) => demoReport.sampling.frames[n]), text_sources: ["notes"] } })), { id: "end", type: "output", data: { label: "Fin" } }];
      return send({ nodes, edges: nodes.slice(1).map((node, i) => ({ id: `edge-${i}`, source: nodes[i].id, target: node.id })), revision: demoReport.revision, review_status: demoReport.review_status, title: demoReport.content.title });
    }
    if (path === `/recordings/${demoRecording.id}/procedure`) {
      if (demoReport.review_status !== "approved") return send({ detail: "Approve report first" }, 409);
      const procedure = procedures[0];
      let version = versions.get(procedure.id)?.[0];
      if (!version) { version = { id: randomUUID(), procedure_id: procedure.id, version_number: 1, status: "draft", summary: demoReport.content.summary, source_session_id: demoRecording.session_id }; versions.set(procedure.id, [version]); }
      return send(version, 201);
    }
    if (path === "/recordings/search") return send({ results: demoReport.review_status === "approved" ? [{ id: "hit-1", recording_id: demoRecording.id, session_id: demoRecording.session_id, report_revision: demoReport.revision, content: demoReport.content.summary, score: .81, source: { kind: "summary", frame_indices: [] } }] : [] });
    if (path === '/recordings/capabilities') return send({ media_types: ['video/webm', 'video/mp4'], max_bytes: 262144000, max_seconds: 600, frame_interval_seconds: 10, storage_configured: false, analysis_mode: 'sampled_frames_after_upload', audio_supported: false, max_recordings_per_session: 1 });
    if (path === `/recordings/${demoRecording.id}`) return send(demoRecording);
    if (path === `/recordings/${demoRecording.id}/report` && method === 'GET') return send(demoReport);
    if (path === `/recordings/${demoRecording.id}/report` && method === 'PUT') {
      if (body.revision !== demoReport.revision) return send({ detail: 'Report changed; reload the latest revision' }, 409);
      if (demoReport.review_status === 'approved') return send({ detail: 'Approved report is immutable' }, 409);
      reportHistory.unshift({ revision: demoReport.revision, created_at: now, snapshot: structuredClone(demoReport) });
      demoReport = { ...demoReport, revision: demoReport.revision + 1, content: body.content, review_status: 'pending' }; return send(demoReport);
    }
    if (path === `/recordings/${demoRecording.id}/report/review`) {
      if (body.revision !== demoReport.revision) return send({ detail: 'Report changed; reload the latest revision' }, 409);
      demoReport = { ...demoReport, revision: demoReport.revision + 1, review_status: body.decision, feedback: body.feedback }; return send(demoReport);
    }
    const paged = (list) =>
      list.slice(
        Number(url.searchParams.get("offset") || 0),
        Number(url.searchParams.get("offset") || 0) +
          Number(url.searchParams.get("limit") || 20),
      );
    if (path === "/learning-sessions") {
      if (method === "GET") return send(paged(sessions));
      assert.equal(body.consent, true);
      assert.ok(body.objective && body.application_name);
      const item = {
        ...body,
        id: randomUUID(),
        author_id: userId,
        created_at: now,
        status: "capturing",
      };
      sessions.unshift(item);
      return send(item, 201);
    }
    if (path === "/procedures") {
      if (method === "GET") return send(reader ? [] : paged(procedures));
      assert.ok(body.title && body.scope);
      const p = { ...body, id: randomUUID(), created_at: now };
      procedures.unshift(p);
      return send(p, 201);
    }
    const parts = path.split("/").filter(Boolean);
    const id = parts[1];
    const sub = parts[2];
    if (parts[0] === "learning-sessions") {
      const session = sessions.find((s) => s.id === id);
      assert.ok(session);
      if (!sub) return send(session);
      if (sub === "jobs") return send(session.id === demoRecording.session_id ? [{ id: "demo-job", kind: "analyze_recording", status: "completed", attempts: 1, session_id: session.id, recording_id: demoRecording.id, version_id: null }] : []);
      if (sub === "agent") return send([{ message_id: "demo-turn", text: "¿Qué debo verificar?", status: "completed", reply: { observation: "El proceso incluye comparar documentos.", answer: "Verifica nombre y número de identificación.", questions: ["¿Qué se hace si no coincide?"] } }]);
      if (sub === 'recordings' && method === 'GET') return send(session.id === demoRecording.session_id ? [demoRecording] : []);
      if (sub === "finish") {
        session.status = "processing";
        return send(
          { id: randomUUID(), status: "pending", session_id: id },
          202,
        );
      }
      const store =
        sub === "events"
          ? events
          : sub === "clarifications"
            ? questions
            : evidences;
      const list = store.get(id) || [];
      store.set(id, list);
      if (method === "GET") return send(sub === "events" ? paged(list) : list);
      if (method === "PUT") {
        const q = list.find((q) => q.id === parts[3]);
        q.answer = body.answer;
        return send(q);
      }
      if (sub === "events") {
        assert.equal(body.event_type, "message");
        assert.ok(body.idempotency_key);
        assert.ok(Number.isInteger(body.sequence_number));
        assert.ok(body.offset_ms >= 0);
        const event = {
          id: randomUUID(),
          ...body,
          payload: { text: body.text },
        };
        list.push(event);
        return send(event);
      }
      const q = { ...body, id: randomUUID(), answer: null };
      list.push(q);
      return send(q, 201);
    }
    if (parts[0] === "procedures" && !sub) return send(procedures.find((p) => p.id === id));
    if (parts[0] === "procedures" && sub === "versions") {
      const list = versions.get(id) || [];
      versions.set(id, list);
      if (method === "GET") return send(paged(list));
      const v = {
        ...body,
        id: randomUUID(),
        version_number: list.length + 1,
        status: "draft",
      };
      list.unshift(v);
      return send(v, 201);
    }
    if (parts[0] === "procedure-versions") {
      const version = [...versions.values()].flat().find((v) => v.id === id);
      assert.ok(version);
      if (sub === "steps") {
        const list = steps.get(id) || [];
        steps.set(id, list);
        if (method === "GET") return send(list);
        assert.ok(
          body.instruction && body.expected_result && body.position >= 1,
        );
        const step = { ...body, id: parts[3] || randomUUID() };
        const index = list.findIndex((s) => s.id === step.id);
        if (index >= 0) list[index] = step;
        else list.push(step);
        return send(step, 201);
      }
      if (sub === "tutorial") {
        if (method === "PUT") tutorials.set(id, body);
        return tutorials.has(id)
          ? send(tutorials.get(id))
          : send({ detail: "Tutorial not found" }, 404);
      }
      const transitions = {
        submit: ["draft", "in_review"],
        approve: ["in_review", "approved"],
        publish: ["approved", "published"],
        return: ["in_review", "draft"],
        retire: ["published", "retired"],
      };
      const transition = transitions[sub];
      assert.ok(transition);
      assert.equal(version.status, transition[0]);
      version.status = transition[1];
      return send(version);
    }
    if (path === "/knowledge/search")
      return send(
        [...versions.values()]
          .flat()
          .filter((v) => v.status === "published")
          .flatMap((v) =>
            (steps.get(v.id) || [])
              .filter((s) =>
                s.instruction
                  .toLowerCase()
                  .includes((url.searchParams.get("q") || "").toLowerCase()),
              )
              .map((s) => ({
                id: s.id,
                procedure_id: [...versions.entries()].find(([, list]) =>
                  list.includes(v),
                )[0],
                version_id: v.id,
                version_number: v.version_number,
                content: s.instruction + "\n" + s.expected_result,
              })),
          ),
      );
    send({ detail: "Fixture route not implemented" }, 404);
  } catch (error) {
    console.error(error.message);
    send({ detail: error.message }, 422);
  }
});
server.listen(8011, "127.0.0.1", () =>
  console.log(
    "Disposable UI fixture: http://127.0.0.1:8011 · prueba@example.com / Prueba-local-2026",
  ),
);
process.on("SIGINT", () => {
  console.log(`Checked ${requests} organization-scoped requests.`);
  server.close();
  process.exit(0);
});
