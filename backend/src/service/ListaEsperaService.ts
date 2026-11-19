import type { CalendarioHabil } from "../components/CalendarioHabil.js";
import type { Correo } from "../components/Correo.js";
import type { Reloj } from "../components/Reloj.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { CatalogoRepository } from "../repository/CatalogoRepository.js";
import type { FeriadoRepository } from "../repository/FeriadoRepository.js";
import type {
  ListaEsperaRecord,
  ListaEsperaRepository,
} from "../repository/ListaEsperaRepository.js";
import type { ReservaRecord, ReservaRepository } from "../repository/ReservaRepository.js";
import { cupoMaximoParaRol, type UsuarioPublico } from "./UsuarioService.js";

export class ListaEsperaService {
  constructor(
    private readonly listaEsperaRepo: ListaEsperaRepository,
    private readonly reservaRepo: ReservaRepository,
    private readonly catalogoRepo: CatalogoRepository,
    private readonly feriadoRepo: FeriadoRepository,
    private readonly calendario: CalendarioHabil,
    private readonly reloj: Reloj,
    private readonly correo: Correo,
    private readonly procesarReservasVencidas: () => Promise<void>
  ) {}

  private async esElegibleParaAviso(
    candidate: ListaEsperaRecord,
    ahoraIso: string
  ): Promise<boolean> {
    if (candidate.suspendidoHasta && candidate.suspendidoHasta > ahoraIso) {
      return false;
    }
    if (await this.reservaRepo.hasPrestamoVencido(candidate.usuarioId, ahoraIso)) {
      return false;
    }
    const maxCupo = cupoMaximoParaRol(candidate.usuarioRol ?? "Alumno");
    const cupoOcupado = await this.reservaRepo.countCupoOcupado(candidate.usuarioId, ahoraIso);
    const limite = candidate.reservaDesactivadaId !== null ? maxCupo : maxCupo - 1;
    return cupoOcupado <= limite;
  }

  /**
   * Vence avisos de 24 h hábiles no confirmados (cancelando reservas desactivadas vinculadas) y asigna turnos disponibles en cola.
   */
  async procesarVencimientosYAsignar(titulosExtra: number[] = []): Promise<void> {
    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    const vencidos = await this.listaEsperaRepo.listAvisadosVencidos(ahoraIso);
    const titulosAfectados = new Set<number>(titulosExtra);

    for (const aviso of vencidos) {
      const expirado = await this.listaEsperaRepo.expirarAvisoEnTransaccion(
        aviso.id,
        aviso.reservaDesactivadaId
      );
      if (expirado) {
        titulosAfectados.add(aviso.tituloId);
      }
    }

    const titulosConCola = await this.listaEsperaRepo.listTitulosConEsperandoYStock();
    for (const tId of titulosConCola) {
      titulosAfectados.add(tId);
    }

    if (titulosAfectados.size === 0) {
      return;
    }

    const feriados = await this.feriadoRepo.listFechas();

    for (const tituloId of titulosAfectados) {
      let libres = await this.listaEsperaRepo.countCuposLibresParaAviso(tituloId);
      while (libres > 0) {
        const esperando = await this.listaEsperaRepo.listEsperandoPorTitulo(tituloId);
        let elegido: ListaEsperaRecord | null = null;
        for (const candidate of esperando) {
          if (await this.esElegibleParaAviso(candidate, ahoraIso)) {
            elegido = candidate;
            break;
          }
        }
        if (!elegido) {
          break;
        }

        const { fechaLimite, detalleCorrimiento } = this.calendario.sumarHorasHabiles(
          ahora,
          24,
          feriados
        );
        const confirmarHastaIso = fechaLimite.toISOString();

        const avisado = await this.listaEsperaRepo.marcarAvisadoEnTransaccion({
          entryId: elegido.id,
          tituloId,
          avisadoEn: ahoraIso,
          confirmarHasta: confirmarHastaIso,
        });
        if (!avisado) {
          break;
        }

        if (elegido.usuarioEmail) {
          const accion = elegido.reservaDesactivadaId ? "reactivar tu reserva" : "confirmar tu reserva";
          await this.correo.send({
            to: elegido.usuarioEmail,
            type: "turno disponible en lista de espera",
            message: `Hay un ejemplar disponible para "${elegido.tituloNombre ?? `título #${tituloId}`}". Tenés 24 h hábiles (hasta ${confirmarHastaIso}) para ${accion}.${
              detalleCorrimiento ? ` ${detalleCorrimiento}` : ""
            }`,
          });
        }

        libres -= 1;
      }
    }
  }

  async anotarse(usuario: UsuarioPublico, tituloId: number): Promise<ListaEsperaRecord> {
    await this.procesarReservasVencidas();

    const ahoraIso = this.reloj.now().toISOString();
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

    return this.listaEsperaRepo.createVoluntariaEnTransaccion({
      tituloId,
      usuarioId: usuario.id,
      ordenEn: ahoraIso,
    });
  }

  async listarMisListas(usuarioId: number): Promise<ListaEsperaRecord[]> {
    await this.procesarReservasVencidas();
    return this.listaEsperaRepo.listByUsuario(usuarioId);
  }

  private async confirmarEntradaAvisada(
    usuario: UsuarioPublico,
    entry: ListaEsperaRecord
  ): Promise<ReservaRecord> {
    const ahora = this.reloj.now();
    const ahoraIso = ahora.toISOString();

    if (entry.usuarioId !== usuario.id) {
      throw new ForbiddenError("No podés confirmar el turno de otro usuario.");
    }
    if (entry.estado !== "avisado") {
      throw new ConflictError(`El turno en estado "${entry.estado}" no puede confirmarse.`);
    }
    if (usuario.suspendidoHasta && usuario.suspendidoHasta > ahoraIso) {
      throw new ConflictError(`Usuario suspendido hasta ${usuario.suspendidoHasta}.`);
    }
    if (await this.reservaRepo.hasPrestamoVencido(usuario.id, ahoraIso)) {
      throw new ConflictError("Tenés un préstamo vencido sin devolver.");
    }

    const feriados = await this.feriadoRepo.listFechas();
    const { fechaLimite, corrimientoInformado, detalleCorrimiento } =
      this.calendario.sumarHorasHabiles(ahora, 48, feriados);

    const reserva = await this.listaEsperaRepo.confirmarTurnoEnTransaccion({
      entryId: entry.id,
      usuarioId: usuario.id,
      tituloId: entry.tituloId,
      reservaDesactivadaId: entry.reservaDesactivadaId,
      maxCupo: usuario.cupoMaximo,
      creadaEn: ahoraIso,
      venceRetiroEn: fechaLimite.toISOString(),
      corrimientoInformado: corrimientoInformado ? detalleCorrimiento : null,
      ahoraIso,
    });

    await this.correo.send({
      to: usuario.email,
      type: "reserva confirmada",
      message: `Reserva confirmada para "${reserva.tituloNombre}" (ejemplar ${reserva.ejemplarCodigo}). Retirar antes de ${reserva.venceRetiroEn}.${
        detalleCorrimiento ? ` ${detalleCorrimiento}` : ""
      }`,
    });

    return reserva;
  }

  async confirmarTurno(usuario: UsuarioPublico, esperaId: number): Promise<ReservaRecord> {
    await this.procesarReservasVencidas();

    const entry = await this.listaEsperaRepo.findById(esperaId);
    if (!entry) {
      throw new NotFoundError("Registro de lista de espera no encontrado.");
    }
    return this.confirmarEntradaAvisada(usuario, entry);
  }

  async confirmarPorReservaDesactivada(
    usuario: UsuarioPublico,
    reservaId: number
  ): Promise<ReservaRecord> {
    await this.procesarReservasVencidas();

    const reserva = await this.reservaRepo.findById(reservaId);
    if (!reserva) {
      throw new NotFoundError("Reserva no encontrada.");
    }
    if (reserva.usuarioId !== usuario.id) {
      throw new ForbiddenError("No podés reactivar la reserva de otro usuario.");
    }
    if (reserva.estado !== "desactivada") {
      throw new ConflictError(`La reserva en estado "${reserva.estado}" no puede reactivarse.`);
    }

    const entry = await this.listaEsperaRepo.findByReservaDesactivadaId(reservaId);
    if (!entry || entry.estado !== "avisado") {
      throw new ConflictError("Todavía no tenés un turno disponible para reactivar esta reserva.");
    }

    return this.confirmarEntradaAvisada(usuario, entry);
  }

  async rechazarTurno(usuario: UsuarioPublico, esperaId: number): Promise<ListaEsperaRecord> {
    await this.procesarReservasVencidas();

    const entry = await this.listaEsperaRepo.findById(esperaId);
    if (!entry) {
      throw new NotFoundError("Registro de lista de espera no encontrado.");
    }
    if (entry.usuarioId !== usuario.id) {
      throw new ForbiddenError("No podés rechazar el turno de otro usuario.");
    }
    if (entry.estado !== "esperando" && entry.estado !== "avisado") {
      throw new ConflictError(`El registro en estado "${entry.estado}" no puede rechazarse.`);
    }

    await this.listaEsperaRepo.rechazarEnTransaccion(entry.id, entry.reservaDesactivadaId);
    await this.procesarVencimientosYAsignar([entry.tituloId]);

    const updated = await this.listaEsperaRepo.findById(entry.id);
    if (!updated) {
      throw new Error("No se pudo recuperar el registro cancelado.");
    }
    return updated;
  }
}
