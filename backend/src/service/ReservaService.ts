import type { CalendarioHabil } from "../components/CalendarioHabil.js";
import type { Correo } from "../components/Correo.js";
import type { Reloj } from "../components/Reloj.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { CatalogoRepository } from "../repository/CatalogoRepository.js";
import type { FeriadoRepository } from "../repository/FeriadoRepository.js";
import type {
  CupoPenalizadoRecord,
  ReservaRecord,
  ReservaRepository,
} from "../repository/ReservaRepository.js";
import type { UsuarioPublico } from "./UsuarioService.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class ReservaService {
  constructor(
    private readonly reservaRepo: ReservaRepository,
    private readonly catalogoRepo: CatalogoRepository,
    private readonly feriadoRepo: FeriadoRepository,
    private readonly calendario: CalendarioHabil,
    private readonly reloj: Reloj,
    private readonly correo: Correo
  ) {}

  /**
   * Vence reservas de 48 h hábiles no retiradas, libera el ejemplar y penaliza 1 cupo por 7 días (RN-11, RN-28).
   */
  async procesarVencimientos(): Promise<void> {
    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();
    const vencidas = await this.reservaRepo.listConfirmadasVencidas(ahoraIso);

    for (const reserva of vencidas) {
      const baseVencimientoMs = reserva.venceRetiroEn
        ? Date.parse(reserva.venceRetiroEn)
        : ahora.getTime();
      const penalizadoHasta = new Date(baseVencimientoMs + SEVEN_DAYS_MS).toISOString();

      const aplicada = await this.reservaRepo.marcarVencidaYPenalizarEnTransaccion({
        reservaId: reserva.id,
        usuarioId: reserva.usuarioId,
        ejemplarId: reserva.ejemplarId,
        penalizadoHasta,
        creadoEn: ahoraIso,
      });

      if (aplicada && reserva.usuarioEmail) {
        await this.correo.send({
          to: reserva.usuarioEmail,
          type: "reserva vencida",
          message: `Tu reserva de "${reserva.tituloNombre}" venció sin retiro. El ejemplar fue liberado y el cupo queda penalizado hasta ${penalizadoHasta}.`,
        });
      }
    }
  }

  async crearReserva(usuario: UsuarioPublico, tituloId: number): Promise<ReservaRecord> {
    await this.procesarVencimientos();

    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    if (usuario.suspendidoHasta && usuario.suspendidoHasta > ahoraIso) {
      throw new ConflictError(`Usuario suspendido hasta ${usuario.suspendidoHasta}.`);
    }

    if (await this.reservaRepo.hasPrestamoVencido(usuario.id, ahoraIso)) {
      throw new ConflictError("Tenés un préstamo vencido sin devolver.");
    }

    const titulo = await this.catalogoRepo.findTituloById(tituloId);
    if (!titulo) {
      throw new NotFoundError("Título no encontrado.");
    }

    const feriados = await this.feriadoRepo.listFechas();
    const { fechaLimite, corrimientoInformado, detalleCorrimiento } =
      this.calendario.sumarHorasHabiles(ahora, 48, feriados);

    const reserva = await this.reservaRepo.createConfirmadaEnTransaccion({
      usuarioId: usuario.id,
      tituloId,
      creadaEn: ahoraIso,
      venceRetiroEn: fechaLimite.toISOString(),
      corrimientoInformado: corrimientoInformado ? detalleCorrimiento : null,
      maxCupo: usuario.cupoMaximo,
      ahoraIso,
    });

    await this.correo.send({
      to: usuario.email,
      type: "reserva confirmada",
      message: `Reserva confirmada para "${titulo.nombre}" (ejemplar ${reserva.ejemplarCodigo}). Retirar antes de ${reserva.venceRetiroEn}.${
        detalleCorrimiento ? ` ${detalleCorrimiento}` : ""
      }`,
    });

    return reserva;
  }

  async cancelarReserva(usuarioId: number, reservaId: number): Promise<ReservaRecord> {
    await this.procesarVencimientos();

    const reserva = await this.reservaRepo.findById(reservaId);
    if (!reserva) {
      throw new NotFoundError("Reserva no encontrada.");
    }
    if (reserva.usuarioId !== usuarioId) {
      throw new ForbiddenError("No podés cancelar la reserva de otro usuario.");
    }
    if (reserva.estado !== "confirmada" && reserva.estado !== "desactivada") {
      throw new ConflictError(`La reserva en estado "${reserva.estado}" no puede cancelarse.`);
    }

    return this.reservaRepo.cancelarEnTransaccion(reserva.id, reserva.ejemplarId);
  }

  async listarMisReservas(usuarioId: number): Promise<{
    reservas: ReservaRecord[];
    penalidadesVigentes: CupoPenalizadoRecord[];
    cupoOcupado: number;
  }> {
    await this.procesarVencimientos();

    const ahoraIso = this.reloj.now().toISOString();
    const [reservas, penalidadesVigentes, cupoOcupado] = await Promise.all([
      this.reservaRepo.listByUsuario(usuarioId),
      this.reservaRepo.listPenalidadesVigentes(usuarioId, ahoraIso),
      this.reservaRepo.countCupoOcupado(usuarioId, ahoraIso),
    ]);

    return { reservas, penalidadesVigentes, cupoOcupado };
  }
}
