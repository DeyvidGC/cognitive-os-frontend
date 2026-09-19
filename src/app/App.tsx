import VideoHistory from "../features/recordings/VideoHistory";
import { confirmAction } from "../shared/confirmAction";
import { clientColor, date, labels, useAction } from "../shared/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allPages, client, json } from "../shared/api";
import type { Procedure, Result, Session, User } from "../shared/api";
import Auth from "../features/auth/Auth";
import SessionDetail from "../features/sessions/SessionDetail";
import ProcedureDetail from "../features/procedures/ProcedureDetail";
import RecordingSearch from "../features/knowledge/RecordingSearch";
import { Badge, Empty, ErrorNotice, Icon, Modal } from "../shared/ui";
import "./App.css";
type Page =
  | "overview"
  | "dashboard"
  | "sessions"
  | "procedures"
  | "knowledge"
  | "chatbot"
  | "policies";
const navigationGroups: {
  label: string;
  items: { id: Page; label: string; icon: string }[];
}[] = [
  {
    label: "GENERAL",
    items: [
      { id: "overview", label: "Inicio", icon: "grid" },
      { id: "dashboard", label: "Dashboard de uso", icon: "chart" },
    ],
  },
  {
    label: "APRENDER",
    items: [
      { id: "sessions", label: "Sesiones de aprendizaje", icon: "record" },
      { id: "procedures", label: "Tutoriales y flujos", icon: "book" },
    ],
  },
  {
    label: "CONSULTAR",
    items: [
      { id: "knowledge", label: "Buscar en videos", icon: "search" },
      { id: "chatbot", label: "Chatbot", icon: "message" },
      { id: "policies", label: "Analizador de pólizas", icon: "shield" },
    ],
  },
];
const navigation = navigationGroups.flatMap((g) => g.items);
/* Páginas sin backend propio todavía: se muestran con una ficha honesta de
   "próximamente" en vez de datos simulados. */
const comingSoon: Partial<Record<Page, { title: string; body: string }>> = {
  chatbot: {
    title: "El chatbot conversacional está en construcción",
    body: "Responderá con lo aprendido en sesiones y procedimientos publicados, citando siempre su fuente. Mientras tanto, usa Buscar en videos o Explorar conocimiento para encontrar fragmentos relevantes.",
  },
  policies: {
    title: "El analizador de pólizas está en construcción",
    body: "Leerá pólizas desde tu almacenamiento y permitirá subir una puntual para preguntarle directamente. Todavía no hay datos ni respaldo de backend para este módulo.",
  },
  dashboard: {
    title: "El dashboard de uso está en construcción",
    body: "Mostrará qué se pregunta más, qué queda sin responder y dónde falta enseñarle algo a la IA. Todavía no hay datos ni respaldo de backend para este módulo.",
  },
};
function App() {
  const [auth, setAuth] = useState<{ token: string; user: User } | null>(null);
  const [notice, setNotice] = useState("");
  const [organization, setOrganization] = useState("");
  const expired = useCallback(() => {
    setAuth(null);
    setNotice("Tu sesión expiró. Vuelve a iniciar sesión.");
  }, []);
  return auth ? (
    <Workspace
      key={organization}
      token={auth.token}
      user={auth.user}
      organization={organization}
      setOrganization={setOrganization}
      expired={expired}
      logout={() => {
        setAuth(null);
        setNotice("");
      }}
    />
  ) : (
    <Auth
      notice={notice}
      onLogin={(token, user) => {
        setAuth({ token, user });
        setOrganization(user.memberships[0]?.organization_id || "");
        setNotice("");
      }}
    />
  );
}
function Workspace({
  token,
  user,
  organization,
  setOrganization,
  expired,
  logout,
}: {
  token: string;
  user: User;
  organization: string;
  setOrganization: (id: string) => void;
  expired: () => void;
  logout: () => void;
}) {
  const protectedRef = useRef(false);
  const [accessExpired, setAccessExpired] = useState(false);
  const handleExpired = useCallback(() => {
    if (protectedRef.current) setAccessExpired(true);
    else expired();
  }, [expired]);
  const api = useMemo(
    // client stores this callback; it only invokes it after an asynchronous 401.
    // eslint-disable-next-line react-hooks/refs
    () => client(token, organization, handleExpired),
    [token, organization, handleExpired],
  );
  const membership = user.memberships.find(
    (m) => m.organization_id === organization,
  );
  const canWrite =
    membership?.role === "owner" || membership?.role === "author";
  const [page, setPage] = useState<Page>("overview");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [targetVersion, setTargetVersion] = useState("");
  const [selected, setSelected] = useState<Session | Procedure | null>(null);
  const [captureProtected, setCaptureProtected] = useState(false);
  const updateCaptureProtected = useCallback((value: boolean) => {
    protectedRef.current = value;
    setCaptureProtected(value);
  }, []);
  async function canLeaveCapture() {
    return (
      !captureProtected ||
      (await confirmAction(
        "Hay una captura, una subida o correcciones sin guardar. Al salir se detendrá la captura y se perderán los cambios y videos locales sin guardar. ¿Salir de la sesión?",
      ))
    );
  }
  const [modal, setModal] = useState<"session" | "procedure" | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const { busy, error, run } = useAction();
  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        membership?.role === "reader"
          ? Promise.resolve([])
          : allPages<Session>(api, "/learning-sessions"),
        allPages<Procedure>(api, "/procedures"),
      ]);
      setLoadError("");
      setSessions(s);
      setProcedures(p);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "No se pudieron cargar los datos.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, membership]);
  useEffect(() => {
    // State updates happen after the HTTP promises settle, including failures.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (organization) void refresh();
  }, [organization, refresh]);
  async function navigate(next: Page) {
    if (!(await canLeaveCapture())) return;
    if (selected) void refresh();
    setPage(next);
    setSelected(null);
    setFilter("");
  }
  const visibleSessions = sessions.filter((s) =>
    `${s.objective} ${s.application_name}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const visibleProcedures = procedures.filter((p) =>
    `${p.title} ${p.scope}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const active = sessions.filter((s) => s.status === "capturing").length;
  const title = navigation.find((n) => n.id === page)!.label;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">IS</span>
          <span className="brand-text">
            <strong>Inventiva</strong>
            <small>Cognitive</small>
          </span>
        </a>
        <label className="organization">
          <small>Trabajando en</small>
          <span className="organization-row">
            <span
              className="workspace-avatar"
              style={{ background: clientColor(organization) }}
            />
            <select
              aria-label="Organización"
              value={organization}
              onChange={async (e) => {
                const next = e.target.value;
                if (await canLeaveCapture()) setOrganization(next);
              }}
            >
              {user.memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organization_name}
                </option>
              ))}
            </select>
            <span className="organization-caret">▾</span>
          </span>
        </label>
        {navigationGroups.map((group) => (
          <div key={group.label} className="nav-group">
            <span className="nav-label">{group.label}</span>
            <nav>
              {group.items
                .filter(
                  (n) => n.id !== "sessions" || membership?.role !== "reader",
                )
                .map((n) => (
                  <button
                    key={n.id}
                    className={page === n.id ? "nav-item active" : "nav-item"}
                    onClick={() => navigate(n.id)}
                    aria-current={page === n.id ? "page" : undefined}
                  >
                    <Icon name={n.icon} />
                    {n.label}
                    {n.id === "sessions" && active > 0 && (
                      <span className="nav-count">{active}</span>
                    )}
                  </button>
                ))}
            </nav>
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {user.display_name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{user.display_name}</strong>
              <small>
                {membership ? labels[membership.role] : "Sin organización"}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!(await canLeaveCapture())) return;
                  if (!accessExpired)
                    await api("/auth/logout", { method: "POST" });
                  logout();
                })
              }
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <h1 className="topbar-title">
              {selected
                ? title
                : page === "overview"
                  ? `Hola, ${user.display_name.split(" ")[0]}`
                  : title}
            </h1>
            {!selected && (
              <p className="topbar-sub">
                {
                  {
                    overview:
                      "Cada proceso que compartes es un nuevo punto de partida.",
                    sessions: "Registra la experiencia detrás de cada proceso.",
                    procedures:
                      "Documenta, revisa y comparte una forma de hacer las cosas.",
                    knowledge:
                      "Encuentra respuestas en los procedimientos publicados de tu equipo.",
                    chatbot: comingSoon.chatbot!.body,
                    policies: comingSoon.policies!.body,
                    dashboard: comingSoon.dashboard!.body,
                  }[page]
                }
              </p>
            )}
          </div>
          {!selected &&
            canWrite &&
            (page === "overview" ||
              page === "sessions" ||
              page === "procedures") && (
              <button
                className="primary"
                onClick={() =>
                  setModal(page === "procedures" ? "procedure" : "session")
                }
              >
                <Icon name="plus" size={16} />
                {page === "procedures" ? "Nuevo procedimiento" : "Nueva sesión"}
              </button>
            )}
        </header>
        <main>
          {accessExpired && (
            <div className="error" role="alert">
              Tu acceso caducó. La captura local sigue disponible: descarga el
              video y conserva tus correcciones antes de cerrar sesión y volver
              a entrar.
            </div>
          )}
          <ErrorNotice error={error} />
          {!membership ? (
            <Empty title="Sin organización asignada">
              Tu cuenta necesita una membresía para acceder al espacio.
            </Empty>
          ) : selected ? (
            <>
              <button
                className="text-button back"
                onClick={async () => {
                  if (!(await canLeaveCapture())) return;
                  setSelected(null);
                  void refresh();
                }}
              >
                ← Volver a {title.toLowerCase()}
              </button>
              {"objective" in selected ? (
                <SessionDetail
                  key={selected.id}
                  onNewSession={async () => {
                    if (await canLeaveCapture()) setModal("session");
                  }}
                  onOpenProcedure={async (procedureId, versionId) => {
                    if (!(await canLeaveCapture())) return;
                    const procedure = await api<Procedure>(
                      `/procedures/${procedureId}`,
                    );
                    setTargetVersion(versionId);
                    setSelected(procedure);
                    setPage("procedures");
                    void refresh();
                  }}
                  api={api}
                  session={selected}
                  membership={membership}
                  userId={user.id}
                  onCaptureProtectedChange={updateCaptureProtected}
                  procedures={procedures}
                />
              ) : (
                <ProcedureDetail
                  key={selected.id}
                  initialVersion={targetVersion}
                  api={api}
                  procedure={selected}
                  membership={membership}
                  sessions={sessions}
                />
              )}
            </>
          ) : (
            <>
              <ErrorNotice error={loadError} />
              {loadError && (
                <button className="secondary" onClick={() => void refresh()}>
                  Reintentar carga
                </button>
              )}
              {page === "overview" && (
                <>
                  <section className="stats">
                    {(() => {
                      /*
                        Las cifras salen sólo de lo que la API devuelve hoy en
                        los listados. Lo primero es lo accionable: qué sesión
                        espera que la persona vuelva.
                      */
                      const reader = membership.role === "reader";
                      const count = (...st: string[]) =>
                        sessions.filter((s) => st.includes(s.status)).length;
                      const analyzing = count(
                        "processing",
                        "queued",
                        "uploading",
                      );
                      const documentable = count("ready", "completed");
                      return [
                        {
                          label: "En captura",
                          value: reader ? "—" : active,
                          icon: "record",
                          foot: "Continúa donde lo dejaste",
                          attention: !reader && active > 0,
                        },
                        {
                          label: "Analizando",
                          value: reader ? "—" : analyzing,
                          icon: "clock",
                          foot: "El análisis va en camino",
                          attention: false,
                        },
                        {
                          label: "Listas para documentar",
                          value: reader ? "—" : documentable,
                          icon: "check",
                          foot: "Conviértelas en procedimiento",
                          attention: !reader && documentable > 0,
                        },
                        {
                          label: "En la biblioteca",
                          value: procedures.length,
                          icon: "book",
                          foot: "Procedimientos del equipo",
                          attention: false,
                        },
                      ];
                    })().map((s) => (
                      <article
                        className={s.attention ? "stat attention" : "stat"}
                        key={s.label}
                      >
                        <span className="stat-icon">
                          <Icon name={s.icon} />
                        </span>
                        <p>{s.label}</p>
                        <strong>{loading || loadError ? "—" : s.value}</strong>
                        <small>{s.foot}</small>
                      </article>
                    ))}
                  </section>
                  <div className="section-head-plain">
                    <h2>Módulos</h2>
                    <p className="muted">
                      Todo lo que {membership.organization_name} enseñó a
                      Cognitive, organizado por función.
                    </p>
                  </div>
                  <div className="module-grid">
                    {[
                      {
                        page: "sessions" as Page,
                        icon: "record",
                        title: "Sesiones de aprendizaje",
                        body: "Comparte pantalla y enseña un proceso en vivo; la IA escucha, pregunta y anota reglas de negocio.",
                        core: true,
                        hidden: membership.role === "reader",
                      },
                      {
                        page: "knowledge" as Page,
                        icon: "search",
                        title: "Buscar en videos",
                        body: "Encuentra respuestas en los procedimientos publicados de tu equipo.",
                      },
                      {
                        page: "chatbot" as Page,
                        icon: "message",
                        title: "Chatbot de conocimiento",
                        body: "Resuelve dudas del día a día con respuestas citando la sesión o el documento de origen.",
                      },
                      {
                        page: "procedures" as Page,
                        icon: "book",
                        title: "Tutoriales y flujos",
                        body: "Catálogo de \"cómo se hace\", documentado paso a paso desde las sesiones grabadas.",
                      },
                      {
                        page: "policies" as Page,
                        icon: "shield",
                        title: "Analizador de pólizas",
                        body: "Lee documentos desde tu almacenamiento o una carga puntual, y responde preguntas sobre su contenido.",
                      },
                      {
                        page: "dashboard" as Page,
                        icon: "chart",
                        title: "Dashboard de uso",
                        body: "Qué se pregunta más, qué quedó sin responder, y dónde falta enseñarle algo a la IA.",
                      },
                    ]
                      .filter((m) => !m.hidden)
                      .map((m) => (
                        <button
                          key={m.page}
                          className={m.core ? "module-card core" : "module-card"}
                          onClick={() => navigate(m.page)}
                        >
                          <div className="module-card-top">
                            <span className="module-icon">
                              <Icon name={m.icon} size={19} />
                            </span>
                            {m.core && (
                              <span className="badge badge-primary">Core</span>
                            )}
                          </div>
                          <h3>{m.title}</h3>
                          <p>{m.body}</p>
                        </button>
                      ))}
                  </div>
                </>
              )}
              {loading ? (
                <div className="loading" role="status">
                  Cargando tu espacio…
                </div>
              ) : (
                !loadError && (
                  <>
                    {page === "sessions" && membership.role !== "reader" && (
                      <VideoHistory
                        api={api}
                        sessions={sessions}
                        onOpen={setSelected}
                      />
                    )}
                    {((page === "overview" && membership.role !== "reader") ||
                      page === "sessions") && (
                      <section className="panel">
                        <div className="section-heading">
                          <div>
                            <h2>
                              {page === "overview"
                                ? "Sesiones recientes"
                                : "Todas las sesiones"}
                            </h2>
                            <p>El punto de partida de tu conocimiento.</p>
                          </div>
                          {page === "overview" ? (
                            <button
                              className="text-button"
                              onClick={() => navigate("sessions")}
                            >
                              Ver todas <Icon name="arrow" size={16} />
                            </button>
                          ) : (
                            <input
                              className="filter"
                              aria-label="Filtrar sesiones"
                              placeholder="Buscar una sesión…"
                              value={filter}
                              onChange={(e) => setFilter(e.target.value)}
                            />
                          )}
                        </div>
                        {visibleSessions.length ? (
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>SESIÓN / OBJETIVO</th>
                                  <th>APLICACIÓN</th>
                                  <th>ESTADO</th>
                                  <th>CREADA</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {(page === "overview"
                                  ? visibleSessions.slice(0, 5)
                                  : visibleSessions
                                ).map((s) => (
                                  <tr key={s.id}>
                                    <td>
                                      <button
                                        className="row-link"
                                        onClick={async () => {
                                          setSelected(s);
                                          setPage("sessions");
                                        }}
                                      >
                                        <span className="row-icon">
                                          <Icon name="record" size={18} />
                                        </span>
                                        {s.objective}
                                      </button>
                                    </td>
                                    <td>{s.application_name}</td>
                                    <td>
                                      <Badge status={s.status} />
                                    </td>
                                    <td className="date-cell">
                                      {date(s.created_at)}
                                    </td>
                                    <td>
                                      <button
                                        className="icon-button"
                                        aria-label={`Abrir ${s.objective}`}
                                        onClick={async () => {
                                          setSelected(s);
                                          setPage("sessions");
                                        }}
                                      >
                                        <Icon name="arrow" size={17} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty
                            title={
                              filter
                                ? "No encontramos esa sesión"
                                : "Tu primera sesión empieza aquí"
                            }
                          >
                            {filter
                              ? "Prueba con otro objetivo o aplicación."
                              : "Crea una sesión para registrar notas y capturas de un proceso."}
                          </Empty>
                        )}
                      </section>
                    )}
                    {(page === "procedures" || page === "overview") && (
                      <section
                        className={
                          page === "overview" ? "library-section" : "panel"
                        }
                      >
                        <div className="section-heading">
                          <div>
                            <h2>
                              {page === "overview"
                                ? "Tu biblioteca de procesos"
                                : "Biblioteca de procedimientos"}
                            </h2>
                            <p>La experiencia del equipo, en un solo lugar.</p>
                          </div>
                          {page === "overview" ? (
                            <button
                              className="text-button"
                              onClick={() => navigate("procedures")}
                            >
                              Explorar biblioteca{" "}
                              <Icon name="arrow" size={16} />
                            </button>
                          ) : (
                            <input
                              className="filter"
                              aria-label="Filtrar procedimientos"
                              placeholder="Buscar un procedimiento…"
                              value={filter}
                              onChange={(e) => setFilter(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="procedure-grid">
                          {(page === "overview"
                            ? visibleProcedures.slice(0, 3)
                            : visibleProcedures
                          ).map((p) => (
                            <button
                              key={p.id}
                              className="procedure-card"
                              onClick={async () => {
                                setSelected(p);
                                setPage("procedures");
                              }}
                            >
                              <span className="document-icon">
                                <Icon name="book" size={23} />
                              </span>
                              <h3>{p.title}</h3>
                              <p>{p.scope}</p>
                              <footer>
                                {date(p.created_at)}
                                <Icon name="arrow" size={17} />
                              </footer>
                            </button>
                          ))}
                        </div>
                        {!visibleProcedures.length && (
                          <Empty
                            title={
                              filter
                                ? "Sin coincidencias"
                                : "Un espacio para lo que tu equipo sabe"
                            }
                          >
                            Los procedimientos que crees aparecerán aquí.
                          </Empty>
                        )}
                      </section>
                    )}
                    {page === "knowledge" && membership?.role !== "reader" && (
                      <RecordingSearch
                        api={api}
                        onOpen={async (id) => {
                          const next = await api<Session>(
                            `/learning-sessions/${id}`,
                          );
                          setSelected(next);
                          setPage("sessions");
                        }}
                      />
                    )}
                    {page === "knowledge" && (
                      <section className="panel search-panel">
                        <span className="search-symbol">
                          <Icon name="search" size={32} />
                        </span>
                        <h2>¿Qué quieres encontrar?</h2>
                        <p>
                          Busca por palabras clave en los pasos de los
                          procedimientos publicados.
                        </p>
                        <form
                          className="search-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(async () => {
                              setResults(null);
                              setResults(
                                await api<Result[]>(
                                  `/knowledge/search?q=${encodeURIComponent(query.trim())}&limit=100`,
                                ),
                              );
                            });
                          }}
                        >
                          <input
                            aria-label="Buscar conocimiento"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            required
                            maxLength={500}
                            placeholder="Por ejemplo: crear una cotización"
                          />
                          <button
                            className="primary"
                            disabled={busy || !query.trim()}
                          >
                            {busy ? "Buscando…" : "Buscar"}
                            <Icon name="arrow" size={18} />
                          </button>
                        </form>
                        {results && (
                          <div className="search-results">
                            <small>{results.length} resultados</small>
                            {results.map((r) => (
                              <article key={r.id}>
                                <Badge status="published" />
                                <h3>
                                  {procedures.find(
                                    (p) => p.id === r.procedure_id,
                                  )?.title || "Procedimiento publicado"}{" "}
                                  · v{r.version_number}
                                </h3>
                                <p>{r.content}</p>
                                <button
                                  className="text-button"
                                  onClick={async () => {
                                    const p = procedures.find(
                                      (p) => p.id === r.procedure_id,
                                    );
                                    if (p) {
                                      setSelected(p);
                                      setPage("procedures");
                                    }
                                  }}
                                  disabled={
                                    !procedures.some(
                                      (p) => p.id === r.procedure_id,
                                    )
                                  }
                                >
                                  Abrir procedimiento →
                                </button>
                              </article>
                            ))}
                            {!results.length && (
                              <Empty title="Todavía no hay coincidencias">
                                Prueba con otras palabras o publica un
                                procedimiento para hacerlo consultable.
                              </Empty>
                            )}
                          </div>
                        )}
                      </section>
                    )}
                    {(page === "chatbot" ||
                      page === "policies" ||
                      page === "dashboard") && (
                      <section className="panel">
                        <Empty
                          title={comingSoon[page]!.title}
                          icon={
                            page === "chatbot"
                              ? "message"
                              : page === "policies"
                                ? "shield"
                                : "chart"
                          }
                        >
                          {comingSoon[page]!.body}
                        </Empty>
                      </section>
                    )}
                  </>
                )
              )}
              {page === "overview" && (
                <footer className="page-footer">
                  <span className="mini-brand">
                    <Icon name="spark" size={15} /> cognitive OS
                  </span>
                  <span>Aprender. Documentar. Compartir.</span>
                </footer>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === "session"
              ? "Nueva sesión de aprendizaje"
              : "Nuevo procedimiento"
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <ErrorNotice error={error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                if (modal === "session") {
                  const session = await api<Session>(
                    "/learning-sessions",
                    json({
                      objective: f.get("objective"),
                      application_name: f.get("application_name"),
                      procedure_id: f.get("procedure_id") || null,
                      consent: f.get("consent") === "on",
                    }),
                  );
                  setSelected(session);
                  setPage("sessions");
                } else {
                  const procedure = await api<Procedure>(
                    "/procedures",
                    json({ title: f.get("title"), scope: f.get("scope") }),
                  );
                  setSelected(procedure);
                  setPage("procedures");
                }
                setModal(null);
                await refresh();
              });
            }}
          >
            <fieldset disabled={busy}>
              {modal === "session" ? (
                <>
                  <p className="form-intro">
                    Define qué vas a enseñar y entra a tu espacio de captura.
                  </p>
                  <label>
                    Objetivo
                    <textarea
                      name="objective"
                      placeholder="Cómo crear y enviar una cotización"
                      required
                      maxLength={4000}
                    />
                  </label>
                  <label>
                    Aplicación
                    <input
                      name="application_name"
                      placeholder="Ej. Portal de cotizaciones"
                      required
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Proceso que estás actualizando
                    <select name="procedure_id" defaultValue={selected && "objective" in selected ? selected.procedure_id || "" : ""}>
                      <option value="">Nuevo proceso</option>
                      {procedures.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.title}</option>)}
                    </select>
                    <small>El análisis aprobado generará una nueva versión en borrador y conservará las anteriores. Si grabas un video para este mismo proceso, la información que corrija o actualice un hecho ya indexado lo reemplazará automáticamente en la búsqueda; nada se duplica.</small>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="consent" required />
                    Autorizo guardar las notas y capturas de esta sesión en mi
                    organización.
                  </label>
                  <section
                    className="session-screen-intro"
                    aria-label="Compartir pantalla en la sesión"
                  >
                    <header>
                      <span>
                        <Icon name="monitor" size={22} />
                      </span>
                      <h3>Comparte tu pantalla</h3>
                    </header>
                    <p>
                      Al crear la sesión podrás elegir una pestaña, ventana o
                      pantalla y grabar el proceso. Tendrás una vista previa y
                      un espacio para tu agente de aprendizaje.
                    </p>
                    <footer>
                      <span>
                        <Icon name="monitor" size={13} />
                        Vista previa
                      </span>
                      <span>
                        <Icon name="record" size={13} />
                        Grabación local
                      </span>
                      <span>
                        <Icon name="spark" size={13} />
                        Agente por conectar
                      </span>
                    </footer>
                  </section>
                </>
              ) : (
                <>
                  <label>
                    Título
                    <input
                      name="title"
                      required
                      maxLength={200}
                      placeholder="Ej. Emisión de una póliza"
                    />
                  </label>
                  <label>
                    Alcance
                    <textarea
                      name="scope"
                      required
                      maxLength={4000}
                      placeholder="Qué cubre este procedimiento y a quién está dirigido"
                    />
                  </label>
                </>
              )}
              <button className="primary full" type="submit">
                {busy
                  ? "Creando…"
                  : modal === "session"
                    ? "Crear sesión y preparar pantalla"
                    : "Crear procedimiento"}
                <Icon name="arrow" size={18} />
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default App;
