import { confirmAction } from "./confirmAction";
import { date, labels, useAction } from "./utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allPages, client, json } from "./api";
import type { Procedure, Result, Session, User } from "./api";
import Auth from "./Auth";
import SessionDetail from "./SessionDetail";
import ProcedureDetail from "./ProcedureDetail";
import { Badge, Empty, ErrorNotice, Icon, Modal } from "./ui";
import "./App.css";
type Page = "overview" | "sessions" | "procedures" | "knowledge";
const navigation: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Vista general", icon: "grid" },
  { id: "sessions", label: "Sesiones de aprendizaje", icon: "record" },
  { id: "procedures", label: "Procedimientos", icon: "book" },
  { id: "knowledge", label: "Explorar conocimiento", icon: "search" },
];
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
  const [selected, setSelected] = useState<Session | Procedure | null>(null);
  const [captureProtected, setCaptureProtected] = useState(false);
  const updateCaptureProtected = useCallback((value: boolean) => {
    protectedRef.current = value;
    setCaptureProtected(value);
  }, []);
  async function canLeaveCapture() {
    return (
      !captureProtected ||
      await confirmAction(
        "Hay una captura, una subida o correcciones sin guardar. Al salir se detendrá la captura y se perderán los cambios y videos locales sin guardar. ¿Salir de la sesión?",
      )
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
          <span className="brand-mark">
            <Icon name="spark" size={23} />
          </span>
          cognitive<span className="brand-os">OS</span>
        </a>
        <label className="organization">
          <span className="workspace-avatar">
            {membership?.organization_name.charAt(0).toUpperCase() || "C"}
          </span>
          <span>
            <small>ESPACIO DE TRABAJO</small>
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
          </span>
        </label>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation
            .filter((n) => n.id !== "sessions" || membership?.role !== "reader")
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
        <div className="sidebar-bottom">
          <div className="tip">
            <span className="tip-icon">
              <Icon name="spark" />
            </span>
            <strong>El conocimiento se construye.</strong>
            <p>Captura un proceso hoy. Hazlo parte de tu equipo mañana.</p>
          </div>
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
          <span>
            Workspace <span className="breadcrumb">/</span>{" "}
            <strong>{title}</strong>
          </span>
          <span className="workspace-status">
            <span className="status-dot" /> Espacio privado
          </span>
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
                  api={api}
                  session={selected}
                  membership={membership}
                  userId={user.id}
                  onCaptureProtectedChange={updateCaptureProtected}
                />
              ) : (
                <ProcedureDetail
                  api={api}
                  procedure={selected}
                  membership={membership}
                  sessions={sessions}
                />
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "overview"
                      ? "TU EQUIPO, MÁS CONECTADO"
                      : "CONOCIMIENTO EN ACCIÓN"}
                  </span>
                  <h1>
                    {page === "overview"
                      ? `Hola, ${user.display_name.split(" ")[0]}`
                      : title}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {page === "overview"
                      ? "Cada proceso que compartes es un nuevo punto de partida."
                      : page === "sessions"
                        ? "Registra la experiencia detrás de cada proceso."
                        : page === "procedures"
                          ? "Documenta, revisa y comparte una forma de hacer las cosas."
                          : "Encuentra respuestas en los procedimientos publicados de tu equipo."}
                  </p>
                </div>
                {canWrite && page !== "knowledge" && (
                  <button
                    className="primary"
                    onClick={() =>
                      setModal(page === "procedures" ? "procedure" : "session")
                    }
                  >
                    <Icon name="plus" size={18} />
                    {page === "procedures"
                      ? "Nuevo procedimiento"
                      : "Nueva sesión"}
                  </button>
                )}
              </div>
              <ErrorNotice error={loadError} />
              {loadError && (
                <button className="secondary" onClick={() => void refresh()}>
                  Reintentar carga
                </button>
              )}
              {page === "overview" && (
                <>
                  <section className="welcome-banner">
                    <div>
                      <span className="eyebrow">
                        DE LA EXPERIENCIA AL CONOCIMIENTO
                      </span>
                      <h2>
                        Tu próxima gran guía
                        <br />
                        empieza con una sesión.
                      </h2>
                      <p>
                        Documenta cómo lo haces. Dale a tu equipo
                        <br className="desktop-break" /> el conocimiento para
                        hacerlo también.
                      </p>
                      <button
                        className="banner-link"
                        onClick={() =>
                          canWrite
                            ? setModal("session")
                            : navigate("procedures")
                        }
                      >
                        {canWrite
                          ? "Capturar un proceso"
                          : "Explorar procedimientos"}
                        <Icon name="arrow" size={18} />
                      </button>
                    </div>
                    <div className="flow-art" aria-hidden="true">
                      <div className="flow-orbit" />
                      <span className="flow-node capture">
                        <Icon name="record" size={26} />
                        <small>Captura</small>
                      </span>
                      <span className="flow-center">
                        <Icon name="spark" size={38} />
                      </span>
                      <span className="flow-node knowledge">
                        <Icon name="book" size={26} />
                        <small>Conocimiento</small>
                      </span>
                      <span className="flow-dot one" />
                      <span className="flow-dot two" />
                    </div>
                  </section>
                  <section className="stats">
                    {[
                      {
                        label: "Sesiones de aprendizaje",
                        value:
                          membership.role === "reader" ? "—" : sessions.length,
                        icon: "record",
                        foot: "Experiencia documentada",
                      },
                      {
                        label: "Procedimientos",
                        value: procedures.length,
                        icon: "book",
                        foot: "En tu biblioteca",
                      },
                      {
                        label: "Sesiones en captura",
                        value: membership.role === "reader" ? "—" : active,
                        icon: "clock",
                        foot: "Listas para continuar",
                      },
                    ].map((s) => (
                      <article className="stat" key={s.label}>
                        <span className="stat-icon">
                          <Icon name={s.icon} />
                        </span>
                        <p>{s.label}</p>
                        <strong>{loading || loadError ? "—" : s.value}</strong>
                        <small>{s.foot}</small>
                      </article>
                    ))}
                  </section>
                </>
              )}
              {loading ? (
                <div className="loading" role="status">
                  Cargando tu espacio…
                </div>
              ) : (
                !loadError && (
                  <>
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
