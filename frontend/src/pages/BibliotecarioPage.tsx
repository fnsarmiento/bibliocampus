import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api/client";
import type {
  FeriadoRecord,
  PrestamoRecord,
  ReservaRecord,
  RolUsuario,
  TituloConEjemplares,
  UsuarioPublico,
} from "../types/api";
import { formatFechaAr } from "../utils/formatDate";

interface BibliotecarioPageProps {
  token: string;
  usuarioActualId: number;
  titulos: TituloConEjemplares[];
  onRefreshCatalogo: () => Promise<void> | void;
}

export function BibliotecarioPage({
  token,
  usuarioActualId,
  titulos,
  onRefreshCatalogo,
}: BibliotecarioPageProps) {
  const [reservas, setReservas] = useState<ReservaRecord[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoRecord[]>([]);
  const [feriados, setFeriados] = useState<FeriadoRecord[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioPublico[]>([]);
  const [rolesDraft, setRolesDraft] = useState<Record<number, RolUsuario>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [nuevoTitulo, setNuevoTitulo] = useState({ nombre: "", autor: "", isbn: "" });
  const [nuevoEjemplar, setNuevoEjemplar] = useState<{
    tituloId: string;
    codigo: string;
    soloEnSala: boolean;
  }>({
    tituloId: titulos[0] ? String(titulos[0].id) : "",
    codigo: "",
    soloEnSala: false,
  });
  const [nuevoFeriado, setNuevoFeriado] = useState({ fecha: "", descripcion: "" });

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resList, prestList, ferList, usrList] = await Promise.all([
        api.todasReservas(token),
        api.listarPrestamos(token),
        api.listarFeriados(),
        api.listarUsuarios(token),
      ]);
      setReservas(resList);
      setPrestamos(prestList);
      setFeriados(ferList);
      setUsuarios(usrList);
      const draft: Record<number, RolUsuario> = {};
      for (const u of usrList) {
        draft[u.id] = u.rol;
      }
      setRolesDraft(draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    if (!nuevoEjemplar.tituloId && titulos[0]) {
      setNuevoEjemplar((prev) => ({ ...prev, tituloId: String(titulos[0].id) }));
    }
  }, [titulos, nuevoEjemplar.tituloId]);

  async function ejecutar(key: string, fn: () => Promise<string>) {
    setBusyKey(key);
    setError(null);
    setOkMsg(null);
    try {
      const msg = await fn();
      setOkMsg(msg);
      await Promise.all([cargarTodo(), Promise.resolve(onRefreshCatalogo())]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error en la operación administrativa.");
    } finally {
      setBusyKey(null);
    }
  }

  function handleCrearTitulo(e: FormEvent) {
    e.preventDefault();
    void ejecutar("crear-titulo", async () => {
      const creado = await api.crearTitulo(token, {
        nombre: nuevoTitulo.nombre,
        autor: nuevoTitulo.autor,
        isbn: nuevoTitulo.isbn || undefined,
      });
      setNuevoTitulo({ nombre: "", autor: "", isbn: "" });
      return `Título "${creado.nombre}" creado.`;
    });
  }

  function handleAgregarEjemplar(e: FormEvent) {
    e.preventDefault();
    const tituloId = Number(nuevoEjemplar.tituloId);
    if (!tituloId) {
      setError("Seleccioná un título primero.");
      return;
    }
    void ejecutar("crear-ejemplar", async () => {
      const ej = await api.agregarEjemplar(token, tituloId, {
        codigo: nuevoEjemplar.codigo,
        soloEnSala: nuevoEjemplar.soloEnSala,
      });
      setNuevoEjemplar((prev) => ({ ...prev, codigo: "", soloEnSala: false }));
      return `Ejemplar ${ej.codigo} agregado.`;
    });
  }

  function handleCargarFeriado(e: FormEvent) {
    e.preventDefault();
    void ejecutar("cargar-feriado", async () => {
      const fer = await api.cargarFeriado(token, nuevoFeriado);
      setNuevoFeriado({ fecha: "", descripcion: "" });
      return `Feriado ${fer.fecha} guardado (${fer.descripcion}).`;
    });
  }

  const reservasPendientes = reservas.filter(
    (r) => r.estado === "confirmada" || r.estado === "desactivada"
  );
  const prestamosActivos = prestamos.filter((p) => p.devueltoEn === null);

  return (
    <section>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Panel Bibliotecario</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Retiros físicos, devoluciones con cálculo de suspensión, reparaciones, feriados y roles.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void cargarTodo()} disabled={loading}>
          Actualizar panel
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reservas pendientes de retiro</h3>
        {reservasPendientes.length === 0 ? (
          <p className="muted">No hay reservas pendientes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lector</th>
                <th>Título / Ejemplar</th>
                <th>Estado</th>
                <th>Vence retiro</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {reservasPendientes.map((r) => (
                <tr key={r.id}>
                  <td>{r.usuarioEmail ?? `Usuario #${r.usuarioId}`}</td>
                  <td>
                    {r.tituloNombre ?? `Título #${r.tituloId}`}
                    {r.ejemplarCodigo ? ` (${r.ejemplarCodigo})` : ""}
                  </td>
                  <td>{r.estado}</td>
                  <td>{formatFechaAr(r.venceRetiroEn)}</td>
                  <td>
                    {r.estado === "confirmada" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyKey === `retiro-${r.id}`}
                        onClick={() =>
                          void ejecutar(`retiro-${r.id}`, async () => {
                            const p = await api.registrarRetiro(token, r.id);
                            return `Retiro registrado. Vence: ${formatFechaAr(p.venceEn)}.`;
                          })
                        }
                      >
                        Registrar retiro
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Préstamos activos</h3>
        {prestamosActivos.length === 0 ? (
          <p className="muted">No hay préstamos activos pendientes de devolución.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lector</th>
                <th>Título / Ejemplar</th>
                <th>Vence</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {prestamosActivos.map((p) => (
                <tr key={p.id}>
                  <td>{p.usuarioNombre ?? p.usuarioEmail ?? `Usuario #${p.usuarioId}`}</td>
                  <td>
                    {p.tituloNombre ?? `Ejemplar #${p.ejemplarId}`}
                    {p.ejemplarCodigo ? ` (${p.ejemplarCodigo})` : ""}
                  </td>
                  <td>{formatFechaAr(p.venceEn)}</td>
                  <td>
                    <span className={`badge ${p.vencido ? "badge-err" : "badge-ok"}`}>
                      {p.vencido ? "Vencido" : "Vigente"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyKey === `dev-${p.id}`}
                      onClick={() =>
                        void ejecutar(`dev-${p.id}`, async () => {
                          const res = await api.registrarDevolucion(token, p.id);
                          return res.diasSuspension > 0
                            ? `Devolución registrada con ${res.diasAtraso} día(s) de atraso. Suspensión de ${res.diasSuspension} día(s).`
                            : "Devolución registrada sin atraso.";
                        })
                      }
                    >
                      Registrar devolución
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ejemplares y reparaciones</h3>
        <div style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
          {titulos.map((t) => (
            <div key={t.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.6rem" }}>
              <strong>{t.nombre}</strong> <span className="muted">({t.autor})</span>
              <div className="actions-row">
                {t.ejemplares.map((ej) => (
                  <div key={ej.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span className="chip">
                      {ej.codigo} · {ej.soloEnSala ? "solo en sala" : ej.estado}
                    </span>
                    {ej.estado !== "prestado" && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busyKey === `rep-${ej.id}`}
                        onClick={() =>
                          void ejecutar(`rep-${ej.id}`, async () => {
                            const enRep = ej.estado !== "en_reparacion";
                            const res = await api.cambiarReparacion(token, ej.id, enRep);
                            return enRep
                              ? `Ejemplar ${res.ejemplar.codigo} enviado a reparación (${res.accion}).`
                              : `Ejemplar ${res.ejemplar.codigo} volvió a disponible.`;
                          })
                        }
                      >
                        {ej.estado === "en_reparacion"
                          ? "Sacar de reparación"
                          : "Enviar a reparación"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid">
          <form className="form-grid" onSubmit={handleCrearTitulo}>
            <h4 style={{ margin: 0 }}>Nuevo título</h4>
            <div className="field">
              <label htmlFor="titulo-nombre">Nombre del título</label>
              <input
                id="titulo-nombre"
                type="text"
                value={nuevoTitulo.nombre}
                onChange={(e) => setNuevoTitulo((p) => ({ ...p, nombre: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="titulo-autor">Autor</label>
              <input
                id="titulo-autor"
                type="text"
                value={nuevoTitulo.autor}
                onChange={(e) => setNuevoTitulo((p) => ({ ...p, autor: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="titulo-isbn">ISBN (opcional)</label>
              <input
                id="titulo-isbn"
                type="text"
                value={nuevoTitulo.isbn}
                onChange={(e) => setNuevoTitulo((p) => ({ ...p, isbn: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busyKey === "crear-titulo"}>
              Crear título
            </button>
          </form>

          <form className="form-grid" onSubmit={handleAgregarEjemplar}>
            <h4 style={{ margin: 0 }}>Agregar ejemplar</h4>
            <div className="field">
              <label htmlFor="ej-titulo">Título destino</label>
              <select
                id="ej-titulo"
                value={nuevoEjemplar.tituloId}
                onChange={(e) => setNuevoEjemplar((p) => ({ ...p, tituloId: e.target.value }))}
              >
                {titulos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ej-codigo">Código de ejemplar</label>
              <input
                id="ej-codigo"
                type="text"
                value={nuevoEjemplar.codigo}
                onChange={(e) => setNuevoEjemplar((p) => ({ ...p, codigo: e.target.value }))}
                required
              />
            </div>
            <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={nuevoEjemplar.soloEnSala}
                onChange={(e) =>
                  setNuevoEjemplar((p) => ({ ...p, soloEnSala: e.target.checked }))
                }
              />
              Solo lectura en sala
            </label>
            <button type="submit" className="btn btn-primary" disabled={busyKey === "crear-ejemplar"}>
              Agregar ejemplar
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Feriados (calendario hábil)</h3>
        <form className="form-grid" onSubmit={handleCargarFeriado}>
          <div className="field">
            <label htmlFor="fer-fecha">Fecha del feriado</label>
            <input
              id="fer-fecha"
              type="date"
              value={nuevoFeriado.fecha}
              onChange={(e) => setNuevoFeriado((p) => ({ ...p, fecha: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="fer-desc">Descripción del feriado</label>
            <input
              id="fer-desc"
              type="text"
              value={nuevoFeriado.descripcion}
              onChange={(e) => setNuevoFeriado((p) => ({ ...p, descripcion: e.target.value }))}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busyKey === "cargar-feriado"}>
            Cargar feriado
          </button>
        </form>

        {feriados.length > 0 && (
          <div className="chips" style={{ marginTop: "0.85rem" }}>
            {feriados.map((f) => (
              <span key={f.fecha} className="chip">
                {f.fecha}: {f.descripcion}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Usuarios y roles</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={`Rol de ${u.nombre}`}
                    value={rolesDraft[u.id] ?? u.rol}
                    onChange={(e) =>
                      setRolesDraft((prev) => ({
                        ...prev,
                        [u.id]: e.target.value as RolUsuario,
                      }))
                    }
                  >
                    <option value="Alumno">Alumno</option>
                    <option value="Docente">Docente</option>
                    <option value="Bibliotecario">Bibliotecario</option>
                  </select>
                </td>
                <td>
                  {u.id === usuarioActualId ? (
                    <span className="muted">Sesión actual</span>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busyKey === `rol-${u.id}`}
                      onClick={() =>
                        void ejecutar(`rol-${u.id}`, async () => {
                          const rolNuevo = rolesDraft[u.id] ?? u.rol;
                          const upd = await api.cambiarRolUsuario(token, u.id, rolNuevo);
                          return `Rol de ${upd.nombre} actualizado a ${upd.rol}.`;
                        })
                      }
                    >
                      Guardar rol
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
