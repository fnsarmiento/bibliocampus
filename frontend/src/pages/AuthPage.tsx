import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api/client";
import type { UsuarioPublico } from "../types/api";

interface AuthPageProps {
  onSuccessLogin: (token: string, usuario: UsuarioPublico) => void;
  onCancel?: () => void;
}

export function AuthPage({ onSuccessLogin, onCancel }: AuthPageProps) {
  const [modo, setModo] = useState<"login" | "register">("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    setBusy(true);

    try {
      if (modo === "register") {
        const creado = await api.registrarUsuario({ nombre, email, contrasena });
        setOkMsg(
          `Cuenta creada como ${creado.rol} para ${creado.email}. Ya podés iniciar sesión.`
        );
        setContrasena("");
      } else {
        const sesion = await api.entrar({ email, contrasena });
        onSuccessLogin(sesion.token, sesion.usuario);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No se pudo conectar con el servidor.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Autenticación">
      <div className="tabs">
        <button
          type="button"
          className={`btn ${modo === "login" ? "btn-active" : ""}`}
          onClick={() => {
            setModo("login");
            setError(null);
            setOkMsg(null);
          }}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          className={`btn ${modo === "register" ? "btn-active" : ""}`}
          onClick={() => {
            setModo("register");
            setError(null);
            setOkMsg(null);
          }}
        >
          Crear cuenta
        </button>
      </div>

      {error && (
        <div className="alert alert-err" role="alert">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="alert alert-ok" role="status">
          {okMsg}
        </div>
      )}

      <form className="form-grid" onSubmit={handleSubmit}>
        {modo === "register" && (
          <div className="field">
            <label htmlFor="auth-nombre">Nombre</label>
            <input
              id="auth-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="auth-password">Contraseña</label>
          <input
            id="auth-password"
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />
        </div>

        <div className="actions-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Procesando..." : modo === "register" ? "Registrarme" : "Entrar"}
          </button>
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel}>
              Volver al catálogo
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
