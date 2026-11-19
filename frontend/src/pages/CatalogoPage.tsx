import { useState } from "react";
import type { TituloConEjemplares } from "../types/api";

interface CatalogoPageProps {
  titulos: TituloConEjemplares[];
  loading: boolean;
  slowServer: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function CatalogoPage({
  titulos,
  loading,
  slowServer,
  error,
  onRefresh,
}: CatalogoPageProps) {
  const [busqueda, setBusqueda] = useState("");

  const q = busqueda.trim().toLowerCase();
  const filtrados = titulos.filter(
    (t) =>
      !q ||
      t.nombre.toLowerCase().includes(q) ||
      t.autor.toLowerCase().includes(q) ||
      (t.isbn ?? "").toLowerCase().includes(q)
  );

  return (
    <section>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Catálogo de biblioteca</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Disponibilidad en tiempo real (los ejemplares «solo en sala» son únicamente de consulta).
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            type="search"
            className="search-input"
            placeholder="Buscar por título, autor o ISBN..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar en el catálogo"
          />
          <button type="button" className="btn" onClick={onRefresh} disabled={loading}>
            Actualizar
          </button>
        </div>
      </div>

      {slowServer && loading && (
        <div className="alert alert-info" role="status">
          Conectando con el servidor de biblioteca (el primer arranque en Render puede demorar unos
          segundos)...
        </div>
      )}

      {error && (
        <div className="alert alert-err" role="alert">
          {error}
        </div>
      )}

      {!loading && filtrados.length === 0 && !error && (
        <div className="card">No se encontraron títulos que coincidan con la búsqueda.</div>
      )}

      <div className="grid">
        {filtrados.map((titulo) => (
          <article key={titulo.id} className="card">
            <h3 style={{ margin: "0 0 0.25rem" }}>{titulo.nombre}</h3>
            <p className="muted" style={{ margin: "0 0 0.65rem" }}>
              {titulo.autor}
              {titulo.isbn ? ` · ISBN ${titulo.isbn}` : ""}
            </p>

            <div className="chips">
              <span
                className={`badge ${
                  titulo.prestablesDisponibles > 0 ? "badge-ok" : "badge-warn"
                }`}
              >
                {titulo.prestablesDisponibles} de {titulo.prestablesTotales} prestables disponibles
              </span>
              {titulo.ejemplaresSoloEnSala > 0 && (
                <span className="badge badge-info">
                  {titulo.ejemplaresSoloEnSala} solo en sala (no reservable online)
                </span>
              )}
            </div>

            {titulo.ejemplares.length > 0 && (
              <div className="chips" aria-label={`Ejemplares de ${titulo.nombre}`}>
                {titulo.ejemplares.map((ej) => (
                  <span key={ej.id} className="chip">
                    {ej.codigo}: {ej.soloEnSala ? "solo en sala" : ej.estado}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
