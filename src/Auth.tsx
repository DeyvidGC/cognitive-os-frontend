import { useAction } from "./utils";
import { useState } from "react";
import { client, json } from "./api";
import type { User } from "./api";
import { ErrorNotice, Icon } from "./ui";
export default function Auth({
  onLogin,
  notice,
}: {
  onLogin: (token: string, user: User) => void;
  notice: string;
}) {
  const [register, setRegister] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="spark" size={25} />
          </span>
          cognitive<span className="brand-os">OS</span>
        </a>
        <div className="auth-message">
          <span className="eyebrow">EL CONOCIMIENTO EMPIEZA CONTIGO</span>
          <h1>
            Lo que tu equipo sabe.
            <br />
            <em>Todo lo que puede hacer.</em>
          </h1>
          <p>
            Convierte la experiencia de cada día en procesos que todos puedan
            aprender, mejorar y compartir.
          </p>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit-ring" />
            <div className="orbit-ring second" />
            <span className="orbit-core">
              <Icon name="spark" size={44} />
            </span>
            <span className="orbit-label first">
              <Icon name="record" /> Captura
            </span>
            <span className="orbit-label middle">
              <Icon name="check" /> Valida
            </span>
            <span className="orbit-label last">
              <Icon name="book" /> Comparte
            </span>
          </div>
        </div>
        <small>Tu experiencia, convertida en conocimiento.</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">TU ESPACIO DE CONOCIMIENTO</span>
          <h2>{register ? "Crea tu espacio" : "Bienvenido de nuevo"}</h2>
          <p>
            {register
              ? "Empieza con una cuenta y una organización."
              : "Inicia sesión para continuar construyendo."}
          </p>
          <ErrorNotice error={error || notice} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(async () => {
                const email = String(form.get("email")).trim();
                const password = String(form.get("password"));
                if (register) {
                  await client()(
                    "/auth/register",
                    json({
                      email,
                      password,
                      display_name: form.get("display_name"),
                      organization_name: form.get("organization_name"),
                    }),
                  );
                  // An account created successfully must not be registered again
                  // if the subsequent sign-in fails or the network disconnects.
                  setRegister(false);
                }
                const auth = await client()<{ access_token: string }>(
                  "/auth/login",
                  json({ email, password }),
                );
                const user = await client(auth.access_token)<User>("/auth/me");
                onLogin(auth.access_token, user);
              });
            }}
          >
            <fieldset disabled={busy}>
              {register && (
                <>
                  <label>
                    Tu nombre
                    <input
                      name="display_name"
                      autoComplete="name"
                      required
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Organización
                    <input
                      name="organization_name"
                      autoComplete="organization"
                      required
                      maxLength={200}
                    />
                  </label>
                </>
              )}
              <label>
                Correo electrónico
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="nombre@empresa.com"
                  required
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  name="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  placeholder={
                    register ? "Al menos 12 caracteres" : "Tu contraseña"
                  }
                  required
                />
              </label>
              <button className="primary full" type="submit">
                {busy
                  ? "Un momento…"
                  : register
                    ? "Crear cuenta"
                    : "Entrar a mi espacio"}
                <Icon name="arrow" size={18} />
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {register ? "¿Ya tienes una cuenta?" : "¿Primera vez aquí?"}{" "}
            <button
              className="text-button"
              onClick={() => setRegister(!register)}
              disabled={busy}
            >
              {register ? "Inicia sesión" : "Crea tu espacio"}
            </button>
          </p>
          <div className="auth-foot">
            <span className="status-dot" /> Un espacio privado para el
            conocimiento de tu equipo
          </div>
        </div>
      </section>
    </div>
  );
}
