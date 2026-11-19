import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { AuthPage } from "./pages/AuthPage";
import { CatalogoPage } from "./pages/CatalogoPage";
import type { TituloConEjemplares, UsuarioPublico } from "./types/api";
import "./styles/app.css";

const TOKEN_STORAGE_KEY = "bibliocampus_token";

function leerTokenGuardado(): string | null {
  try {
    return typeof window !== "undefined" && typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

function guardarToken(value: string | null): void {
  try {
    if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
      return;
    }
    if (value === null) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
    }
  } catch {
    // ignore storage errors
  }
}

type Vista = "catalogo" | "auth";

export default function App() {
  const [token, setToken] = useState<string | null>(() => leerTokenGuardado());
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [vista, setVista] = useState<Vista>("catalogo");
  const [titulos, setTitulos] = useState<TituloConEjemplares[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [slowServer, setSlowServer] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  const cargarCatalogo = useCallback(async () => {
    setLoadingCatalogo(true);
    setCatalogoError(null);
    setSlowServer(false);
    const slowTimer = window.setTimeout(() => setSlowServer(true), 1800);

    try {
      const data = await api.listarTitulos();
      setTitulos(data);
    } catch (err) {
      setCatalogoError(
        err instanceof ApiError ? err.message : "Error al cargar el catálogo."
      );
    } finally {
      window.clearTimeout(slowTimer);
      setLoadingCatalogo(false);
      setSlowServer(false);
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    if (!token) {
      setUsuario(null);
      return;
    }
    if (usuario) {
      return;
    }
    let cancelled = false;
    api
      .yo(token)
      .then((u) => {
        if (!cancelled) {
          setUsuario(u);
        }
      })
      .catch(() => {
        if (!cancelled) {
          guardarToken(null);
          setToken(null);
          setUsuario(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, usuario]);

  function handleLogin(newToken: string, loggedUser: UsuarioPublico) {
    guardarToken(newToken);
    setToken(newToken);
    setUsuario(loggedUser);
    setVista("catalogo");
  }

  function handleLogout() {
    guardarToken(null);
    setToken(null);
    setUsuario(null);
    setVista("catalogo");
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <h1>BiblioCampus</h1>
          <span>Reservas y préstamos</span>
        </div>

        <nav className="nav">
          <button
            type="button"
            className={`btn ${vista === "catalogo" ? "btn-active" : ""}`}
            onClick={() => setVista("catalogo")}
          >
            Catálogo
          </button>

          {usuario ? (
            <>
              <span className="user-pill">
                <strong>{usuario.nombre}</strong>
                <span>· {usuario.rol}</span>
              </span>
              <button type="button" className="btn" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`btn ${vista === "auth" ? "btn-active" : "btn-primary"}`}
              onClick={() => setVista("auth")}
            >
              Ingresar / Registrarse
            </button>
          )}
        </nav>
      </header>

      <main className="container">
        {vista === "auth" ? (
          <AuthPage
            onSuccessLogin={handleLogin}
            onCancel={() => setVista("catalogo")}
          />
        ) : (
          <CatalogoPage
            titulos={titulos}
            loading={loadingCatalogo}
            slowServer={slowServer}
            error={catalogoError}
            onRefresh={() => void cargarCatalogo()}
          />
        )}
      </main>
    </div>
  );
}
