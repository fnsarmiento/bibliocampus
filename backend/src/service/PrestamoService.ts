import type { CalendarioHabil } from "../components/CalendarioHabil.js";
import type { Correo } from "../components/Correo.js";
import type { Reloj } from "../components/Reloj.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { FeriadoRepository } from "../repository/FeriadoRepository.js";
import type { PrestamoRecord, PrestamoRepository } from "../repository/PrestamoRepository.js";
import type { ReservaRepository } from "../repository/ReservaRepository.js";
import type { UsuarioRepository } from "../repository/UsuarioRepository.js";
import type { ReservaService } from "./ReservaService.js";
import type { UsuarioPublico } from "./UsuarioService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function diffCalendarDays(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / DAY_MS);
}

export class PrestamoService {
  constructor(
    private readonly prestamoRepo: PrestamoRepository,
    private readonly reservaRepo: ReservaRepository,
    private readonly usuarioRepo: UsuarioRepository,
    private readonly feriadoRepo: FeriadoRepository,
    private readonly reservaService: ReservaService,
    private readonly calendario: CalendarioHabil,
    private readonly reloj: Reloj,
    private readonly correo: Correo
  ) {}

  async listarPrestamos(usuario: UsuarioPublico): Promise<PrestamoRecord[]> {
    await this.reservaService.procesarVencimientos();
    const ahoraIso = this.reloj.now().toISOString();
    if (usuario.rol === "Bibliotecario") {
      return this.prestamoRepo.listAll(ahoraIso);
    }
    return this.prestamoRepo.listByUsuario(usuario.id, ahoraIso);
  }

  /**
   * Registra el retiro físico de una reserva confirmada vigente (RN-14, RN-15, RN-17).
   */
  async registrarRetiro(reservaId: number): Promise<PrestamoRecord & { corrimientoInformado: string | null }> {
    await this.reservaService.procesarVencimientos();

    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    const reserva = await this.reservaRepo.findById(reservaId);
    if (!reserva) {
      throw new NotFoundError("Reserva no encontrada.");
    }
    if (reserva.estado !== "confirmada" || reserva.ejemplarId === null) {
      throw new ConflictError(`La reserva en estado "${reserva.estado}" no puede retirarse.`);
    }

    const lector = await this.usuarioRepo.findById(reserva.usuarioId);
    if (!lector) {
      throw new NotFoundError("Usuario no encontrado.");
    }
    if (lector.suspendidoHasta && lector.suspendidoHasta > ahoraIso) {
      throw new ConflictError("El usuario está suspendido y no puede retirar libros.");
    }
    if (await this.reservaRepo.hasPrestamoVencido(lector.id, ahoraIso)) {
      throw new ConflictError("El usuario tiene un préstamo vencido sin devolver.");
    }

    const diasBase = lector.rol === "Alumno" ? 7 : 15;
    const feriados = await this.feriadoRepo.listFechas();
    const { fechaLimite, corrimientoInformado, detalleCorrimiento } =
      this.calendario.calcularVencimientoPrestamo(ahora, diasBase, feriados);

    const prestamo = await this.prestamoRepo.registrarRetiroEnTransaccion({
      reservaId: reserva.id,
      usuarioId: reserva.usuarioId,
      ejemplarId: reserva.ejemplarId,
      retiradoEn: ahoraIso,
      venceEn: fechaLimite.toISOString(),
    });

    return {
      ...prestamo,
      corrimientoInformado: corrimientoInformado ? detalleCorrimiento : null,
    };
  }

  /**
   * Registra la devolución física, aplica suspensión por atraso (tope 7 días) y desactiva reservas pendientes (RN-18, RN-19, RN-28).
   */
  async registrarDevolucion(prestamoId: number): Promise<{
    prestamo: PrestamoRecord;
    diasAtraso: number;
    diasSuspension: number;
    suspendidoHasta: string | null;
  }> {
    await this.reservaService.procesarVencimientos();
    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    const prestamo = await this.prestamoRepo.findById(prestamoId, ahoraIso);
    if (!prestamo) {
      throw new NotFoundError("Préstamo no encontrado.");
    }
    if (prestamo.devueltoEn !== null) {
      throw new ConflictError("El préstamo ya fue devuelto.");
    }

    let diasAtraso = 0;
    if (ahora.getTime() > Date.parse(prestamo.venceEn)) {
      const venceDia = this.calendario.toClubDay(new Date(prestamo.venceEn));
      const hoyDia = this.calendario.toClubDay(ahora);
      diasAtraso = Math.max(1, diffCalendarDays(venceDia, hoyDia));
    }

    const diasSuspension = diasAtraso > 0 ? Math.min(diasAtraso, 7) : 0;
    let nuevoSuspendidoHasta: string | null = null;
    if (diasSuspension > 0) {
      const calculado = new Date(ahora.getTime() + diasSuspension * DAY_MS).toISOString();
      const lector = await this.usuarioRepo.findById(prestamo.usuarioId);
      nuevoSuspendidoHasta =
        lector?.suspendidoHasta && lector.suspendidoHasta > calculado
          ? lector.suspendidoHasta
          : calculado;
    }

    const updated = await this.prestamoRepo.registrarDevolucionEnTransaccion({
      prestamoId: prestamo.id,
      ejemplarId: prestamo.ejemplarId,
      usuarioId: prestamo.usuarioId,
      devueltoEn: ahoraIso,
      diasAtraso,
      nuevoSuspendidoHasta,
    });

    if (diasSuspension > 0 && prestamo.usuarioEmail) {
      await this.correo.send({
        to: prestamo.usuarioEmail,
        type: "suspension aplicada",
        message: `Devolución con ${diasAtraso} día(s) de atraso. Quedás suspendido por ${diasSuspension} día(s) hasta ${nuevoSuspendidoHasta}. Tus reservas pendientes quedaron desactivadas manteniendo tu cupo y lugar en la lista.`,
      });
    }

    await this.reservaService.procesarVencimientos();

    return {
      prestamo: updated,
      diasAtraso,
      diasSuspension,
      suspendidoHasta: nuevoSuspendidoHasta,
    };
  }

  /**
   * Renueva un préstamo activo 1 sola vez por 5 días hábiles si no hay lista de espera (RN-15, RN-16, RN-17).
   */
  async renovarPrestamo(
    usuario: UsuarioPublico,
    prestamoId: number
  ): Promise<PrestamoRecord & { corrimientoInformado: string | null }> {
    await this.reservaService.procesarVencimientos();
    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    if (usuario.suspendidoHasta && usuario.suspendidoHasta > ahoraIso) {
      throw new ConflictError("Usuario suspendido: no puede renovar préstamos.");
    }

    const prestamo = await this.prestamoRepo.findById(prestamoId, ahoraIso);
    if (!prestamo) {
      throw new NotFoundError("Préstamo no encontrado.");
    }
    if (prestamo.usuarioId !== usuario.id) {
      throw new ForbiddenError("No podés renovar el préstamo de otro usuario.");
    }
    if (prestamo.devueltoEn !== null) {
      throw new ConflictError("El préstamo ya fue devuelto.");
    }
    if (prestamo.renovado) {
      throw new ConflictError("El préstamo ya fue renovado una vez.");
    }
    if (ahora.getTime() > Date.parse(prestamo.venceEn)) {
      throw new ConflictError("No podés renovar un préstamo ya vencido.");
    }
    if (await this.reservaRepo.hasPrestamoVencido(usuario.id, ahoraIso)) {
      throw new ConflictError("Tenés otro préstamo vencido sin devolver.");
    }
    if (
      prestamo.tituloId !== undefined &&
      (await this.prestamoRepo.hasActiveListaEsperaForTitulo(prestamo.tituloId))
    ) {
      throw new ConflictError("No se puede renovar porque hay usuarios en lista de espera.");
    }

    const feriados = await this.feriadoRepo.listFechas();
    const { fechaLimite, corrimientoInformado, detalleCorrimiento } =
      this.calendario.calcularVencimientoPrestamo(new Date(prestamo.venceEn), 5, feriados);

    const updated = await this.prestamoRepo.marcarRenovado(
      prestamo.id,
      fechaLimite.toISOString(),
      ahoraIso
    );

    return {
      ...updated,
      corrimientoInformado: corrimientoInformado ? detalleCorrimiento : null,
    };
  }
}
