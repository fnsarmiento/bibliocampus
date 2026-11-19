import type { Client } from "@libsql/client";
import { ConflictError } from "../domain/errors.js";
import type { ReservaRecord } from "./ReservaRepository.js";

export type EstadoListaEspera = "esperando" | "avisado" | "confirmado" | "expirado" | "cancelado";

export interface ListaEsperaRecord {
  id: number;
  tituloId: number;
  tituloNombre?: string;
  usuarioId: number;
  usuarioEmail?: string;
  usuarioRol?: "Alumno" | "Docente" | "Bibliotecario";
  suspendidoHasta?: string | null;
  reservaDesactivadaId: number | null;
  estado: EstadoListaEspera;
  ordenEn: string;
  avisadoEn: string | null;
  confirmarHasta: string | null;
}

export class ListaEsperaRepository {
  constructor(private readonly db: Client) {}

  private mapEntry(row: Record<string, unknown>): ListaEsperaRecord {
    return {
      id: Number(row.id),
      tituloId: Number(row.titulo_id),
      tituloNombre: row.titulo_nombre === undefined ? undefined : String(row.titulo_nombre),
      usuarioId: Number(row.usuario_id),
      usuarioEmail: row.usuario_email === undefined ? undefined : String(row.usuario_email),
      usuarioRol:
        row.usuario_rol === undefined
          ? undefined
          : (String(row.usuario_rol) as "Alumno" | "Docente" | "Bibliotecario"),
      suspendidoHasta:
        row.suspendido_hasta === undefined || row.suspendido_hasta === null
          ? null
          : String(row.suspendido_hasta),
      reservaDesactivadaId:
        row.reserva_desactivada_id === null ? null : Number(row.reserva_desactivada_id),
      estado: String(row.estado) as EstadoListaEspera,
      ordenEn: String(row.orden_en),
      avisadoEn: row.avisado_en === null ? null : String(row.avisado_en),
      confirmarHasta: row.confirmar_hasta === null ? null : String(row.confirmar_hasta),
    };
  }

  async findById(id: number): Promise<ListaEsperaRecord | null> {
    const res = await this.db.execute({
      sql: `
        SELECT le.*, t.nombre AS titulo_nombre, u.email AS usuario_email, u.rol AS usuario_rol, u.suspendido_hasta
        FROM lista_espera le
        INNER JOIN titulo t ON t.id = le.titulo_id
        INNER JOIN usuario u ON u.id = le.usuario_id
        WHERE le.id = ?
      `,
      args: [id],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapEntry(res.rows[0] as Record<string, unknown>);
  }

  async findByReservaDesactivadaId(reservaId: number): Promise<ListaEsperaRecord | null> {
    const res = await this.db.execute({
      sql: `
        SELECT le.*, t.nombre AS titulo_nombre, u.email AS usuario_email, u.rol AS usuario_rol, u.suspendido_hasta
        FROM lista_espera le
        INNER JOIN titulo t ON t.id = le.titulo_id
        INNER JOIN usuario u ON u.id = le.usuario_id
        WHERE le.reserva_desactivada_id = ?
        ORDER BY le.id DESC
        LIMIT 1
      `,
      args: [reservaId],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapEntry(res.rows[0] as Record<string, unknown>);
  }

  async listByUsuario(usuarioId: number): Promise<ListaEsperaRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT le.*, t.nombre AS titulo_nombre
        FROM lista_espera le
        INNER JOIN titulo t ON t.id = le.titulo_id
        WHERE le.usuario_id = ?
        ORDER BY le.id DESC
      `,
      args: [usuarioId],
    });
    return res.rows.map((r) => this.mapEntry(r as Record<string, unknown>));
  }

  async createVoluntariaEnTransaccion(input: {
    tituloId: number;
    usuarioId: number;
    ordenEn: string;
  }): Promise<ListaEsperaRecord> {
    const tx = await this.db.transaction("write");
    try {
      const stockRes = await tx.execute({
        sql: `
          SELECT
            (SELECT COUNT(*) FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0) AS prestables_totales,
            (SELECT COUNT(*) FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible') AS disponibles,
            (SELECT COUNT(*) FROM lista_espera WHERE titulo_id = ? AND estado = 'avisado') AS avisados
        `,
        args: [input.tituloId, input.tituloId, input.tituloId],
      });

      const prestablesTotales = Number(stockRes.rows[0].prestables_totales);
      const disponibles = Number(stockRes.rows[0].disponibles);
      const avisados = Number(stockRes.rows[0].avisados);

      if (prestablesTotales === 0) {
        await tx.rollback();
        throw new ConflictError("Este título no tiene ejemplares prestables.");
      }
      if (disponibles > avisados) {
        await tx.rollback();
        throw new ConflictError("Hay ejemplares disponibles para reservar directamente.");
      }

      const dupRes = await tx.execute({
        sql: `
          SELECT COUNT(*) AS total
          FROM lista_espera
          WHERE titulo_id = ? AND usuario_id = ? AND estado IN ('esperando', 'avisado') AND reserva_desactivada_id IS NULL
        `,
        args: [input.tituloId, input.usuarioId],
      });
      if (Number(dupRes.rows[0].total) > 0) {
        await tx.rollback();
        throw new ConflictError("Ya estás anotado en la lista de espera de este título.");
      }

      const ins = await tx.execute({
        sql: `
          INSERT INTO lista_espera (titulo_id, usuario_id, reserva_desactivada_id, estado, orden_en)
          VALUES (?, ?, NULL, 'esperando', ?)
        `,
        args: [input.tituloId, input.usuarioId, input.ordenEn],
      });
      const entryId = Number(ins.lastInsertRowid);
      await tx.commit();

      const created = await this.findById(entryId);
      if (!created) {
        throw new Error("No se pudo recuperar la inscripción en lista de espera.");
      }
      return created;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      if (err instanceof ConflictError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) {
        throw new ConflictError("Ya estás anotado en la lista de espera de este título.");
      }
      throw err;
    }
  }

  async listAvisadosVencidos(ahoraIso: string): Promise<ListaEsperaRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT le.*, t.nombre AS titulo_nombre, u.email AS usuario_email, u.rol AS usuario_rol, u.suspendido_hasta
        FROM lista_espera le
        INNER JOIN titulo t ON t.id = le.titulo_id
        INNER JOIN usuario u ON u.id = le.usuario_id
        WHERE le.estado = 'avisado' AND le.confirmar_hasta IS NOT NULL AND le.confirmar_hasta < ?
        ORDER BY le.confirmar_hasta ASC, le.id ASC
      `,
      args: [ahoraIso],
    });
    return res.rows.map((r) => this.mapEntry(r as Record<string, unknown>));
  }

  async expirarAvisoEnTransaccion(entryId: number, reservaDesactivadaId: number | null): Promise<boolean> {
    const tx = await this.db.transaction("write");
    try {
      const upd = await tx.execute({
        sql: "UPDATE lista_espera SET estado = 'expirado' WHERE id = ? AND estado = 'avisado'",
        args: [entryId],
      });
      if (upd.rowsAffected === 0) {
        await tx.rollback();
        return false;
      }
      if (reservaDesactivadaId !== null) {
        await tx.execute({
          sql: "UPDATE reserva SET estado = 'cancelada', ejemplar_id = NULL WHERE id = ? AND estado = 'desactivada'",
          args: [reservaDesactivadaId],
        });
      }
      await tx.commit();
      return true;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async listTitulosConEsperandoYStock(): Promise<number[]> {
    const res = await this.db.execute(`
      SELECT DISTINCT le.titulo_id
      FROM lista_espera le
      WHERE le.estado = 'esperando'
        AND (
          SELECT COUNT(*) FROM ejemplar e
          WHERE e.titulo_id = le.titulo_id AND e.solo_en_sala = 0 AND e.estado = 'disponible'
        ) > (
          SELECT COUNT(*) FROM lista_espera la
          WHERE la.titulo_id = le.titulo_id AND la.estado = 'avisado'
        )
    `);
    return res.rows.map((r) => Number(r.titulo_id));
  }

  async countCuposLibresParaAviso(tituloId: number): Promise<number> {
    const res = await this.db.execute({
      sql: `
        SELECT
          (SELECT COUNT(*) FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible') AS disponibles,
          (SELECT COUNT(*) FROM lista_espera WHERE titulo_id = ? AND estado = 'avisado') AS avisados
      `,
      args: [tituloId, tituloId],
    });
    return Math.max(0, Number(res.rows[0].disponibles) - Number(res.rows[0].avisados));
  }

  async listEsperandoPorTitulo(tituloId: number): Promise<ListaEsperaRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT le.*, t.nombre AS titulo_nombre, u.email AS usuario_email, u.rol AS usuario_rol, u.suspendido_hasta
        FROM lista_espera le
        INNER JOIN titulo t ON t.id = le.titulo_id
        INNER JOIN usuario u ON u.id = le.usuario_id
        WHERE le.titulo_id = ? AND le.estado = 'esperando'
        ORDER BY le.orden_en ASC, le.id ASC
      `,
      args: [tituloId],
    });
    return res.rows.map((r) => this.mapEntry(r as Record<string, unknown>));
  }

  async marcarAvisadoEnTransaccion(input: {
    entryId: number;
    tituloId: number;
    avisadoEn: string;
    confirmarHasta: string;
  }): Promise<boolean> {
    const tx = await this.db.transaction("write");
    try {
      const stockRes = await tx.execute({
        sql: `
          SELECT
            (SELECT COUNT(*) FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible') AS disponibles,
            (SELECT COUNT(*) FROM lista_espera WHERE titulo_id = ? AND estado = 'avisado') AS avisados
        `,
        args: [input.tituloId, input.tituloId],
      });
      if (Number(stockRes.rows[0].disponibles) <= Number(stockRes.rows[0].avisados)) {
        await tx.rollback();
        return false;
      }

      const upd = await tx.execute({
        sql: `
          UPDATE lista_espera
          SET estado = 'avisado', avisado_en = ?, confirmar_hasta = ?
          WHERE id = ? AND estado = 'esperando'
        `,
        args: [input.avisadoEn, input.confirmarHasta, input.entryId],
      });
      if (upd.rowsAffected === 0) {
        await tx.rollback();
        return false;
      }
      await tx.commit();
      return true;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async confirmarTurnoEnTransaccion(input: {
    entryId: number;
    usuarioId: number;
    tituloId: number;
    reservaDesactivadaId: number | null;
    maxCupo: number;
    creadaEn: string;
    venceRetiroEn: string;
    corrimientoInformado: string | null;
    ahoraIso: string;
  }): Promise<ReservaRecord> {
    const tx = await this.db.transaction("write");
    try {
      const cupoRes = await tx.execute({
        sql: `
          SELECT
            (SELECT COUNT(*) FROM reserva WHERE usuario_id = ? AND estado IN ('confirmada', 'desactivada')) +
            (SELECT COUNT(*) FROM prestamo WHERE usuario_id = ? AND devuelto_en IS NULL) +
            (SELECT COUNT(*) FROM cupo_penalizado WHERE usuario_id = ? AND penalizado_hasta > ?) AS total
        `,
        args: [input.usuarioId, input.usuarioId, input.usuarioId, input.ahoraIso],
      });
      const cupoOcupado = Number(cupoRes.rows[0].total);
      const limite = input.reservaDesactivadaId !== null ? input.maxCupo : input.maxCupo - 1;
      if (cupoOcupado > limite) {
        await tx.rollback();
        throw new ConflictError("Alcanzaste tu cupo máximo disponible.");
      }

      const ejRes = await tx.execute({
        sql: "SELECT id, codigo FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible' ORDER BY id ASC LIMIT 1",
        args: [input.tituloId],
      });
      if (ejRes.rows.length === 0) {
        await tx.rollback();
        throw new ConflictError("No hay ejemplares disponibles para confirmar este turno.");
      }

      const ejemplarId = Number(ejRes.rows[0].id);
      await tx.execute({
        sql: "UPDATE ejemplar SET estado = 'reservado' WHERE id = ? AND estado = 'disponible'",
        args: [ejemplarId],
      });

      const updLe = await tx.execute({
        sql: "UPDATE lista_espera SET estado = 'confirmado' WHERE id = ? AND estado = 'avisado'",
        args: [input.entryId],
      });
      if (updLe.rowsAffected === 0) {
        await tx.rollback();
        throw new ConflictError("El aviso ya no está vigente.");
      }

      let reservaId: number;
      if (input.reservaDesactivadaId !== null) {
        const updRes = await tx.execute({
          sql: `
            UPDATE reserva
            SET estado = 'confirmada',
                ejemplar_id = ?,
                vence_retiro_en = ?,
                corrimiento_informado = ?,
                desactivada_motivo = NULL
            WHERE id = ? AND estado = 'desactivada'
          `,
          args: [ejemplarId, input.venceRetiroEn, input.corrimientoInformado, input.reservaDesactivadaId],
        });
        if (updRes.rowsAffected === 0) {
          await tx.rollback();
          throw new ConflictError("La reserva desactivada ya no está disponible para reactivar.");
        }
        reservaId = input.reservaDesactivadaId;
      } else {
        const ins = await tx.execute({
          sql: `
            INSERT INTO reserva (usuario_id, titulo_id, ejemplar_id, estado, creada_en, vence_retiro_en, corrimiento_informado)
            VALUES (?, ?, ?, 'confirmada', ?, ?, ?)
          `,
          args: [
            input.usuarioId,
            input.tituloId,
            ejemplarId,
            input.creadaEn,
            input.venceRetiroEn,
            input.corrimientoInformado,
          ],
        });
        reservaId = Number(ins.lastInsertRowid);
      }

      const rowRes = await tx.execute({
        sql: `
          SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre, u.email AS usuario_email
          FROM reserva r
          LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
          INNER JOIN titulo t ON t.id = r.titulo_id
          INNER JOIN usuario u ON u.id = r.usuario_id
          WHERE r.id = ?
        `,
        args: [reservaId],
      });

      await tx.commit();
      const row = rowRes.rows[0] as Record<string, unknown>;
      return {
        id: Number(row.id),
        usuarioId: Number(row.usuario_id),
        tituloId: Number(row.titulo_id),
        ejemplarId: row.ejemplar_id === null ? null : Number(row.ejemplar_id),
        estado: String(row.estado) as ReservaRecord["estado"],
        creadaEn: String(row.creada_en),
        venceRetiroEn: row.vence_retiro_en === null ? null : String(row.vence_retiro_en),
        corrimientoInformado:
          row.corrimiento_informado === null ? null : String(row.corrimiento_informado),
        desactivadaMotivo:
          row.desactivada_motivo === null
            ? null
            : (String(row.desactivada_motivo) as "suspension" | "reparacion"),
        ordenColaEn: row.orden_cola_en === null ? null : String(row.orden_cola_en),
        ejemplarCodigo: row.ejemplar_codigo === null ? null : String(row.ejemplar_codigo),
        tituloNombre: String(row.titulo_nombre),
        usuarioEmail: String(row.usuario_email),
      };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      if (err instanceof ConflictError) {
        throw err;
      }
      throw err;
    }
  }

  async rechazarEnTransaccion(entryId: number, reservaDesactivadaId: number | null): Promise<void> {
    const tx = await this.db.transaction("write");
    try {
      const upd = await tx.execute({
        sql: "UPDATE lista_espera SET estado = 'cancelado' WHERE id = ? AND estado IN ('esperando', 'avisado')",
        args: [entryId],
      });
      if (upd.rowsAffected === 0) {
        await tx.rollback();
        throw new ConflictError("El registro de lista de espera ya no está activo.");
      }
      if (reservaDesactivadaId !== null) {
        await tx.execute({
          sql: "UPDATE reserva SET estado = 'cancelada', ejemplar_id = NULL WHERE id = ? AND estado = 'desactivada'",
          args: [reservaDesactivadaId],
        });
      }
      await tx.commit();
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }
}
