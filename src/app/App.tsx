import { confirmAction } from "../shared/confirmAction";
import { clientColor, date, labels, useAction } from "../shared/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allPages, client, json } from "../shared/api";
import type { Procedure, Session, User } from "../shared/api";
import Auth from "../features/auth/Auth";
import SessionDetail from "../features/sessions/SessionDetail";
import ProcedureDetail from "../features/procedures/ProcedureDetail";
import RecordingSearch from "../features/knowledge/RecordingSearch";
import Policies from "../features/policies/Policies";
import FloatingAssistant from "../features/assistant/FloatingAssistant";
import type { AssistantContext } from "../features/assistant/FloatingAssistant";
import UsageDashboard from "../features/dashboard/UsageDashboard";
import Home from "../features/dashboard/Home";
import { pendingSessions } from "../features/dashboard/pendingSessions";
import NewSessionDialog from "../features/sessions/NewSessionDialog";
import SessionList from "../features/sessions/SessionList";
import Master from "../features/master/Master";
import { Empty, ErrorNotice, Icon, Modal, Select } from "../shared/ui";
import "./App.css";
type Page =
  | "overview"
  | "dashboard"
  | "sessions"
  | "procedures"
  | "knowledge"
  | "policies"
  | "master";
const navigationGroups: {
  label: string;
  items: { id: Page; label: string; icon: string }[];
}[] = [
  {
    label: "GENERAL",
    items: [
      { id: "overview", label: "Inicio", icon: "grid" },
      { id: "dashboard", label: "Panel de uso", icon: "chart" },
    ],
  },
  {
    label: "APRENDER",
    items: [{ id: "sessions", label: "Sesiones", icon: "record" }],
  },
  {
    label: "BIBLIOTECA",
    items: [{ id: "procedures", label: "Biblioteca", icon: "book" }],
  },
  {
    label: "CONSULTAR",
    items: [
      { id: "knowledge", label: "Buscar", icon: "search" },
      { id: "policies", label: "Pólizas", icon: "shield" },
    ],
  },
  {
    label: "PLATAFORMA",
    items: [{ id: "master", label: "Agente maestro", icon: "spark" }],
  },
];
const navigation = navigationGroups.flatMap((g) => g.items);
/* Colores planos que rotan en la galería de Tutoriales y flujos. */
const procedureTones = ["mint", "peach", "lavender", "sky"];
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
  const [sessionObjective, setSessionObjective] = useState("");
  const [justCreated, setJustCreated] = useState<{
    id: string;
    source: "share" | "upload";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");
  const [policyFocus, setPolicyFocus] = useState<{ id: string; title: string } | null>(null);
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
    setPolicyFocus(null);
  }
  const visibleProcedures = procedures.filter((p) =>
    `${p.title} ${p.scope}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const active = sessions.filter((s) => s.status === "capturing").length;
  const title = navigation.find((n) => n.id === page)!.label;
  const assistantContext: AssistantContext =
    selected && "objective" in selected
      ? { kind: "session", id: selected.id, title: selected.objective }
      : selected
        ? { kind: "procedure", id: selected.id, title: selected.title }
        : page === "policies"
          ? policyFocus
            ? { kind: "policy", id: policyFocus.id, title: policyFocus.title }
            : { kind: "policies" }
          : { kind: "general" };
  return (
    <div
      className="app-shell redesign-shell"
    >
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
            <Icon name="spark" size={19} />
          </span>
          <span className="brand-word">
            cognitive<span className="brand-os">OS</span>
          </span>
        </a>
        <label className="organization">
          <small>Trabajando en</small>
          <span className="organization-row">
            <span
              className="workspace-avatar"
              style={{ background: clientColor(organization) }}
            />
            <Select
              className="organization-select"
              ariaLabel="Organización"
              value={organization}
              onChange={async (next) => {
                if (await canLeaveCapture()) setOrganization(next);
              }}
              options={user.memberships.map((m) => ({
                value: m.organization_id,
                label: m.organization_name,
              }))}
            />
          </span>
        </label>
        {navigationGroups.map((group) => {
          const items = group.items.filter(
            (n) =>
              ((n.id !== "sessions" && n.id !== "dashboard") ||
                membership?.role !== "reader") &&
              (n.id !== "master" || user.is_platform_staff),
          );
          return items.length ? (
            <div key={group.label} className="nav-group">
              <span className="nav-label">{group.label}</span>
              <nav>
                {items.map((n) => (
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
          ) : null;
        })}
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
            {!selected && (page === "overview" || page === "dashboard") && (
              <span className="workspace-eyebrow">
                {page === "overview"
                  ? new Intl.DateTimeFormat("es-CO", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(new Date())
                  : membership?.organization_name}
              </span>
            )}
            <h1 className="topbar-title">
              {selected
                ? title
                : page === "overview"
                  ? `Hola, ${user.display_name.split(" ")[0]}`
                  : page === "dashboard"
                    ? "Qué pregunta el equipo"
                    : title}
            </h1>
            {!selected && (
              <p className="topbar-sub">
                {
                  {
                    overview: loading
                      ? "Preparando tu espacio de trabajo…"
                      : membership?.role === "reader"
                        ? "La experiencia del equipo, lista para consultar."
                        : pendingSessions(sessions).length
                          ? `Tienes ${pendingSessions(sessions).length} ${pendingSessions(sessions).length === 1 ? "sesión pendiente" : "sesiones pendientes"}. Empieza por la que frena a los demás.`
                          : "Todo al día. Es un buen momento para compartir lo que sabes.",
                    sessions: "Registra la experiencia detrás de cada proceso.",
                    procedures:
                      "Documenta, revisa y comparte una forma de hacer las cosas.",
                    knowledge:
                      "Encuentra respuestas en los procedimientos publicados de tu equipo.",
                    policies:
                      "Lee pólizas desde tu almacenamiento o una carga puntual, y responde preguntas sobre su contenido.",
                    dashboard: "Y qué todavía no podemos responder.",
                    master:
                      "Aprende de todas las organizaciones a la vez, y explica en qué se parecen o difieren entre sí.",
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
                  initialSource={
                    justCreated?.id === selected.id
                      ? justCreated.source
                      : "share"
                  }
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
              {loading ? (
                <div className="loading" role="status">
                  Cargando tu espacio…
                </div>
              ) : (
                !loadError && (
                  <>
                    {page === "sessions" && (
                      <SessionList
                        api={api}
                        sessions={sessions}
                        onOpen={(s) => {
                          setSelected(s);
                          setPage("sessions");
                        }}
                      />
                    )}
                    {page === "procedures" && (
                      <section className="panel">
                        <div className="section-heading">
                          <div>
                            <h2>Biblioteca de procedimientos</h2>
                            <p>La experiencia del equipo, en un solo lugar.</p>
                          </div>
                          <input
                            className="filter"
                            aria-label="Filtrar procedimientos"
                            placeholder="Buscar un procedimiento…"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          />
                        </div>
                        <div
                          className={
                            page === "procedures"
                              ? "procedure-grid vivid"
                              : "procedure-grid"
                          }
                        >
                          {visibleProcedures.map((p, i) =>
                            page === "procedures" ? (
                              <button
                                key={p.id}
                                className="procedure-card vivid"
                                onClick={async () => {
                                  setSelected(p);
                                  setPage("procedures");
                                }}
                              >
                                <span
                                  className={`procedure-banner tone-${procedureTones[i % procedureTones.length]}`}
                                >
                                  <Icon name="book" size={30} />
                                </span>
                                <div className="procedure-card-body">
                                  <h3>{p.title}</h3>
                                  <p>{p.scope}</p>
                                  <footer>
                                    {date(p.created_at)}
                                    <Icon name="arrow" size={17} />
                                  </footer>
                                </div>
                              </button>
                            ) : (
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
                            ),
                          )}
                          {page === "procedures" && canWrite && (
                            <button
                              className="procedure-add-tile"
                              onClick={() => setModal("procedure")}
                            >
                              <span className="module-icon">
                                <Icon name="plus" size={20} />
                              </span>
                              Enseñar un proceso nuevo
                            </button>
                          )}
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
                        procedures={procedures}
                        onOpenSession={async (id) => {
                          const next = await api<Session>(
                            `/learning-sessions/${id}`,
                          );
                          setSelected(next);
                          setPage("sessions");
                        }}
                        onOpenProcedure={(procedureId) => {
                          const p = procedures.find(
                            (item) => item.id === procedureId,
                          );
                          if (p) {
                            setSelected(p);
                            setPage("procedures");
                          }
                        }}
                      />
                    )}
                    {page === "policies" && (
                      <Policies
                        api={api}
                        canManage={membership.role !== "reader"}
                        onFocusChange={setPolicyFocus}
                      />
                    )}
                    {page === "dashboard" && membership.role !== "reader" && (
                      <UsageDashboard
                        api={api}
                        canTeach={canWrite}
                        onTeach={(objective) => {
                          setSessionObjective(objective);
                          setModal("session");
                        }}
                      />
                    )}
                    {page === "master" && user.is_platform_staff && (
                      <Master api={api} />
                    )}
                    {page === "overview" && (
                      <Home
                        api={api}
                        sessions={sessions}
                        reader={membership.role === "reader"}
                        canWrite={canWrite}
                        onOpen={(session) => {
                          setSelected(session);
                          setPage("sessions");
                        }}
                        onTeach={(objective) => {
                          setSessionObjective(objective);
                          setModal("session");
                        }}
                        onLibrary={() => void navigate("procedures")}
                      />
                    )}
                  </>
                )
              )}
            </>
          )}
        </main>
      </div>
      {modal === "session" && (
        <NewSessionDialog
          api={api}
          procedures={procedures}
          organizationName={membership?.organization_name || ""}
          objective={sessionObjective}
          procedureId={
            selected && "objective" in selected
              ? selected.procedure_id || ""
              : ""
          }
          onCreated={(session, source) => {
            setJustCreated({ id: session.id, source });
            setSelected(session);
            setPage("sessions");
            setModal(null);
            setSessionObjective("");
            void refresh();
          }}
          close={() => {
            setModal(null);
            setSessionObjective("");
          }}
        />
      )}
      {modal === "procedure" && (
        <Modal
          title="Nuevo procedimiento"
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
                const procedure = await api<Procedure>(
                  "/procedures",
                  json({ title: f.get("title"), scope: f.get("scope") }),
                );
                setSelected(procedure);
                setPage("procedures");
                setModal(null);
                await refresh();
              });
            }}
          >
            <fieldset disabled={busy}>
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
              <button className="primary full" type="submit">
                {busy ? "Creando…" : "Crear procedimiento"}
                <Icon name="arrow" size={18} />
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
      {membership && (
        <FloatingAssistant
          api={api}
          context={assistantContext}
          userInitials={user.display_name.slice(0, 2).toUpperCase()}
        />
      )}
    </div>
  );
}
export default App;
