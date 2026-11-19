import type { Correo } from "../components/Correo.js";
import type { CatalogoRepository, EjemplarRecord } from "../repository/CatalogoRepository.js";
import type { ReservaRecord } from "../repository/ReservaRepository.js";

export interface ResultadoReparacion {
  ejemplar: EjemplarRecord;
  accion: "disponible" | "sin_reserva" | "reasignada" | "desactivada";
  reservaAfectada: ReservaRecord | null;
}

export class ReparacionService {
  constructor(
    private readonly catalogoRepo: CatalogoRepository,
    private readonly correo: Correo,
    private readonly procesarVencimientos: () => Promise<void>
  ) {}

  /**
   * Pasa un ejemplar a o desde reparación: reasigna reserva si hay stock, desactiva si no hay y dispara la cola al volver (RN-20, RN-21, RN-28).
   */
  async cambiarReparacion(ejemplarId: number, enReparacion: boolean): Promise<ResultadoReparacion> {
    await this.procesarVencimientos();

    if (enReparacion) {
      const res = await this.catalogoRepo.pasarAReparacionEnTransaccion(ejemplarId);

      if (res.reservaAfectada && res.reservaAfectada.usuarioEmail) {
        if (res.accion === "reasignada") {
          await this.correo.send({
            to: res.reservaAfectada.usuarioEmail,
            type: "reparacion",
            message: `El ejemplar originalmente asignado a tu reserva de "${res.reservaAfectada.tituloNombre}" pasó a reparación. Reasignamos automáticamente el ejemplar ${res.ejemplarReemplazoCodigo}.`,
          });
        } else if (res.accion === "desactivada") {
          await this.correo.send({
            to: res.reservaAfectada.usuarioEmail,
            type: "reparacion",
            message: `El ejemplar de tu reserva de "${res.reservaAfectada.tituloNombre}" pasó a reparación y no hay otro disponible. Tu reserva quedó desactivada conservando tu cupo y lugar en la lista; te avisaremos cuando se libere uno para reactivarla o cancelarla.`,
          });
        }
      }

      return {
        ejemplar: res.ejemplar,
        accion: res.accion,
        reservaAfectada: res.reservaAfectada,
      };
    }

    const ejemplar = await this.catalogoRepo.sacarDeReparacionEnTransaccion(ejemplarId);
    await this.procesarVencimientos();

    return {
      ejemplar,
      accion: "disponible",
      reservaAfectada: null,
    };
  }
}
