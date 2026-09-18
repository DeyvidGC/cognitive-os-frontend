export type Membership = {
  organization_id: string;
  organization_name: string;
  role: "owner" | "author" | "reviewer" | "reader";
};
export type User = {
  id: string;
  display_name: string;
  email: string;
  memberships: Membership[];
};
export type Session = {
  id: string;
  author_id: string;
  objective: string;
  application_name: string;
  status: string;
  created_at: string;
};
export type Procedure = {
  id: string;
  title: string;
  scope: string;
  created_at: string;
};
export type Version = {
  id: string;
  version_number: number;
  status: string;
  summary: string;
  source_session_id: string | null;
};
export type Step = {
  id: string;
  position: number;
  instruction: string;
  expected_result: string;
  origin: string;
  validation_status: string;
};
export type Evidence = {
  id: string;
  media_type: string;
  size_bytes: number;
  captured_at: string;
};
export type Event = {
  id: string;
  sequence_number: number;
  payload: { text: string };
  offset_ms: number;
};
export type Clarification = {
  id: string;
  question: string;
  answer: string | null;
};
export type Result = {
  id: string;
  procedure_id: string;
  version_id: string;
  version_number: number;
  content: string;
};
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);
const translations: Record<string, string> = {
  "Resolve pending clarifications before exporting": "Responde todas las aclaraciones antes de generar el documento.",
  "Revise the rejected report before exporting": "Corrige el informe rechazado antes de exportarlo.",
  "Document exports are busy; retry shortly": "Hay documentos en preparación. Inténtalo de nuevo en un momento.",
  "Document generation failed; verify the video and retry": "No se pudo generar el documento. Verifica el video e inténtalo de nuevo.",
  "Video captures no longer match the analyzed evidence": "Las capturas no coinciden con el análisis. Regenera el informe antes de exportar.",
  "Invalid credentials": "El correo o la contraseña no son correctos.",
  "Registration is disabled":
    "El registro está deshabilitado en la API. Contacta al administrador.",
  "Database is not configured":
    "La API todavía no tiene una base de datos configurada.",
  "Database unavailable or migrations missing":
    "La base de datos no está disponible o faltan migraciones.",
  "Too many authentication attempts":
    "Demasiados intentos. Espera un minuto antes de volver a intentar.",
  "All steps must be confirmed before review and approval":
    "Confirma todos los pasos antes de enviar a revisión.",
  "Observed and inferred steps require supporting evidence":
    "Los pasos observados o inferidos necesitan una evidencia vinculada.",
  "Create a Markdown tutorial before review":
    "Guarda un tutorial antes de enviar a revisión.",
  "Resolve pending clarifications before finishing":
    "Responde las aclaraciones pendientes antes de finalizar.",
  "Add at least one event or evidence before finishing":
    "Añade una nota o una evidencia antes de finalizar.",
};
export function client(token = "", organization = "", onExpired?: () => void) {
  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (organization) headers.set("X-Organization-Id", organization);
    if (options.body && !(options.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers,
        signal: options.signal ?? AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError(
        0,
        "No se pudo conectar con la API. Verifica que esté iniciada e inténtalo de nuevo.",
      );
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.detail;
      if (response.status === 401 && token) onExpired?.();
      const message =
        typeof detail === "string"
          ? translations[detail] || detail
          : Array.isArray(detail)
            ? detail
                .map(
                  (e: { loc: string[]; msg: string }) =>
                    `${e.loc.slice(1).join(".")}: ${e.msg}`,
                )
                .join(" · ")
            : `No se pudo completar la solicitud (${response.status}).`;
      throw new ApiError(
        response.status,
        response.status === 401 && token
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : message,
      );
    }
    if (response.status === 204) return undefined as T;
    if (path.endsWith("/file")) return (await response.blob()) as T;
    return response.json();
  }
  return Object.assign(request, {
    agentSocket(sessionId: string) {
      const url = new URL(
        `${base}/learning-sessions/${encodeURIComponent(sessionId)}/agent/live`,
        window.location.href,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      socket.addEventListener(
        "open",
        () =>
          socket.send(
            JSON.stringify({
              type: "auth",
              token,
              organization_id: organization,
              consent: true,
            }),
          ),
        { once: true },
      );
      return socket;
    },
  });
}
export type Client = ReturnType<typeof client>;
export const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export async function allPages<T>(api: Client, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api<T[]>(`${path}?limit=100&offset=${offset}`);
    items.push(...page);
    if (page.length < 100) return items;
  }
}
