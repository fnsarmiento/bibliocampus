import type { CalendarioHabil } from "../components/CalendarioHabil.js";
import type { Correo } from "../components/Correo.js";
import type { Reloj } from "../components/Reloj.js";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { CatalogoRepository } from "../repository/CatalogoRepository.js";
import type { FeriadoRepository } from "../repository/FeriadoRepository.js";
import type {
  CupoPenalizadoRecord,
  ReservaRecord,
  ReservaRepository,
} from "../repository/ReservaRepository.js";
import type { UsuarioPublico } from "./UsuarioService.js";

export class ReservaService {
  constructor(
    private readonly reservaRepo: ReservaRepository,
    private readonly catalogoRepo: CatalogoRepository,
    private readonly feriadoRepo: FeriadoRepository,
    private readonly calendario: CalendarioHabil,
    private readonly reloj: Reloj,
    private readonly correo: Correo
  ) {}

  async crearReserva(usuario: UsuarioPublico, tituloId: number): Promise<ReservaRecord> {
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

  async listarMisReservas(usuarioId: number): Promise<{
    reservas: ReservaRecord[];
    penalidadesVigentes: CupoPenalizadoRecord[];
    cupoOcupado: number;
  }> {
    const ahoraIso = this.reloj.now().toISOString();
    const [reservas, penalidadesVigentes, cupoOcupado] = await Promise.all([
      this.reservaRepo.listByUsuario(usuarioId),
      this.reservaRepo.listPenalidadesVigentes(usuarioId, ahoraIso),
      this.reservaRepo.countCupoOcupado(usuarioId, ahoraIso),
    ]);

    return { reservas, penalidadesVigentes, cupoOcupado };
  }
}
