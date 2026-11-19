import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type {
  ListaEsperaRecord,
  MisReservasResponse,
  PrestamoRecord,
  UsuarioPublico,
} from "../types/api";
import { formatFechaAr } from "../utils/formatDate";

interface LectorPageProps {
  token: string;
  usuario: UsuarioPublico;
  onProfileChanged: () => void;
}

export function LectorPage({ token, usuario, onProfileChanged }: LectorPageProps) {
  const [misReservas, setMisReservas] = useState<MisReservasResponse | null>(null);
  const [listasEspera, setListasEspera] = useState<ListaEsperaRecord[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resData, listasData, prestamosData] = await Promise.all([
        api.misReservas(token),
        api.misListasEspera(token),
        api.listarPrestamos(token),
      ]);
      setMisReservas(resData);
      setListasEspera(listasData);
      setPrestamos(prestamosData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar tus datos.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  async function ejecutarAccion(
    key: string,
    fn: () => Promise<string>
  ) {
    setBusyKey(key);
    setError(null);
    setOkMsg(null);
    try {
      const message = await fn();
      setOkMsg(message);
      await cargarDatos();
      onProfileChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusyKey(null);
    }
  }

  const suspendidoActivo =
    usuario.suspendidoHasta !== null && Date.parse(usuario.suspendidoHasta) > Date.now();
  const avisosPorReservaId = new Map(
    listasEspera
      .filter((le) => le.reservaDesactivadaId !== null && le.estado === "avisado")
      .map((le) => [le.reservaDesactivadaId!, le])
  );

  return (
    <section>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Mis reservas y préstamos</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Seguimiento de cupos, vencimientos de retiro (48 h hábiles), lista de espera (24 h hábiles) y renovaciones.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void cargarDatos()} disabled={loading}>
          Actualizar
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

      {suspendidoActivo && (
        <div className="alert alert-err" role="alert">
          Suspendido hasta {formatFechaAr(usuario.suspendidoHasta)}. No podés retirar ni renovar mientras dure la sanción.
        </div>
      )}

      {misReservas && misReservas.penalidadesVigentes.length > 0 && (
        <div className="alert alert-warn" role="status">
          Tenés {misReservas.penalidadesVigentes.length} cupo(s) penalizado(s) por vencimiento sin retiro (próxima liberación:{" "}
          {formatFechaAr(misReservas.penalidadesVigentes[0].penalizadoHasta)}).
        </div>
      )}

      <div className="card">
        <strong>
          Cupo ocupado: {misReservas ? misReservas.cupoOcupado : "—"} / {usuario.cupoMaximo}
        </strong>
        <span className="muted" style={{ marginLeft: "0.75rem" }}>
          Rol: {usuario.rol}
        </span>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mis reservas</h3>
        {!loading && (!misReservas || misReservas.reservas.length === 0) ? (
          <p className="muted">Todavía no tenés reservas registradas.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {misReservas?.reservas.map((r) => {
              const avisoTurno = avisosPorReservaId.get(r.id);
              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <strong>{r.tituloNombre ?? `Título #${r.tituloId}`}</strong>
                      {r.ejemplarCodigo ? ` · Ejemplar ${r.ejemplarCodigo}` : ""}
                    </div>
                    <span
                      className={`badge ${
                        r.estado === "confirmada"
                          ? "badge-ok"
                          : r.estado === "desactivada"
                            ? "badge-warn"
                            : "badge-err"
                      }`}
                    >
                      {r.estado}
                    </span>
                  </div>

                  {r.venceRetiroEn && r.estado === "confirmada" && (
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      Retiro válido hasta: {formatFechaAr(r.venceRetiroEn)}
                      {r.corrimientoInformado ? ` (${r.corrimientoInformado})` : ""}
                    </p>
                  )}

                  {r.estado === "desactivada" && (
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      Motivo: {r.desactivadaMotivo ?? "sistema"} (mantiene tu cupo y lugar en la lista).
                      {avisoTurno
                        ? ` ¡Turno disponible! Reactivá antes de ${formatFechaAr(avisoTurno.confirmarHasta)} (24 h hábiles).`
                        : " Esperando ejemplar disponible para reactivar."}
                    </p>
                  )}

                  {(r.estado === "confirmada" || r.estado === "desactivada") && (
                    <div className="actions-row">
                      {r.estado === "desactivada" && avisoTurno && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyKey === `react-${r.id}`}
                          onClick={() =>
                            void ejecutarAccion(`react-${r.id}`, async () => {
                              const res = await api.reactivarReserva(token, r.id);
                              return `Reserva reactivada (${res.ejemplarCodigo ?? ""}). Retirar antes de ${formatFechaAr(res.venceRetiroEn)}.`;
                            })
                          }
                        >
                          Reactivar
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busyKey === `cancel-${r.id}`}
                        onClick={() =>
                          void ejecutarAccion(`cancel-${r.id}`, async () => {
                            await api.cancelarReserva(token, r.id);
                            return "Reserva cancelada y cupo liberado.";
                          })
                        }
                      >
                        Cancelar reserva
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mi lista de espera</h3>
        {!loading && listasEspera.length === 0 ? (
          <p className="muted">No estás en ninguna lista de espera.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {listasEspera.map((le) => (
              <div
                key={le.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <strong>{le.tituloNombre ?? `Título #${le.tituloId}`}</strong>
                  <span
                    className={`badge ${
                      le.estado === "avisado"
                        ? "badge-ok"
                        : le.estado === "esperando"
                          ? "badge-info"
                          : "badge-warn"
                    }`}
                  >
                    {le.estado}
                  </span>
                </div>

                {le.estado === "avisado" && (
                  <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                    Turno disponible por 24 h hábiles hasta {formatFechaAr(le.confirmarHasta)}.
                  </p>
                )}

                {(le.estado === "avisado" || le.estado === "esperando") && (
                  <div className="actions-row">
                    {le.estado === "avisado" && le.reservaDesactivadaId === null && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyKey === `conf-${le.id}`}
                        onClick={() =>
                          void ejecutarAccion(`conf-${le.id}`, async () => {
                            const res = await api.confirmarListaEspera(token, le.id);
                            return `Reserva confirmada (${res.ejemplarCodigo ?? ""}). Retirar antes de ${formatFechaAr(res.venceRetiroEn)}.`;
                          })
                        }
                      >
                        Confirmar turno
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busyKey === `rej-${le.id}`}
                      onClick={() =>
                        void ejecutarAccion(`rej-${le.id}`, async () => {
                          await api.rechazarListaEspera(token, le.id);
                          return "Salida de lista de espera registrada.";
                        })
                      }
                    >
                      {le.estado === "avisado" ? "Rechazar turno" : "Salir de la cola"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mis préstamos</h3>
        {!loading && prestamos.length === 0 ? (
          <p className="muted">No tenés préstamos registrados.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {prestamos.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <strong>{p.tituloNombre ?? `Ejemplar #${p.ejemplarId}`}</strong>
                    {p.ejemplarCodigo ? ` · ${p.ejemplarCodigo}` : ""}
                  </div>
                  <span
                    className={`badge ${
                      p.devueltoEn ? "badge-info" : p.vencido ? "badge-err" : "badge-ok"
                    }`}
                  >
                    {p.devueltoEn ? "Devuelto" : p.vencido ? "Vencido" : "Activo"}
                  </span>
                </div>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Vence: {formatFechaAr(p.venceEn)}
                  {p.renovado ? " · Ya renovado" : ""}
                </p>
                {!p.devueltoEn && !p.renovado && !p.vencido && (
                  <div className="actions-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyKey === `ren-${p.id}`}
                      onClick={() =>
                        void ejecutarAccion(`ren-${p.id}`, async () => {
                          const upd = await api.renovarPrestamo(token, p.id);
                          return `Préstamo renovado hasta ${formatFechaAr(upd.venceEn)}${
                            upd.corrimientoInformado ? ` (${upd.corrimientoInformado})` : ""
                          }.`;
                        })
                      }
                    >
                      Renovar préstamo (+5 días hábiles)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
