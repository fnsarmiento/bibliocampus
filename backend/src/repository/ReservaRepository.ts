import type { Client } from "@libsql/client";
import { ConflictError } from "../domain/errors.js";

export type EstadoReserva =
  | "confirmada"
  | "desactivada"
  | "retirada"
  | "vencida"
  | "cancelada";

export interface ReservaRecord {
  id: number;
  usuarioId: number;
  tituloId: number;
  ejemplarId: number | null;
  estado: EstadoReserva;
  creadaEn: string;
  venceRetiroEn: string | null;
  corrimientoInformado: string | null;
  desactivadaMotivo: "suspension" | "reparacion" | null;
  ordenColaEn: string | null;
  ejemplarCodigo?: string | null;
  tituloNombre?: string;
  usuarioEmail?: string;
}

export interface CupoPenalizadoRecord {
  id: number;
  usuarioId: number;
  reservaId: number;
  penalizadoHasta: string;
  creadoEn: string;
}

export class ReservaRepository {
  constructor(private readonly db: Client) {}

  private mapReserva(row: Record<string, unknown>): ReservaRecord {
    return {
      id: Number(row.id),
      usuarioId: Number(row.usuario_id),
      tituloId: Number(row.titulo_id),
      ejemplarId: row.ejemplar_id === null ? null : Number(row.ejemplar_id),
      estado: String(row.estado) as EstadoReserva,
      creadaEn: String(row.creada_en),
      venceRetiroEn: row.vence_retiro_en === null ? null : String(row.vence_retiro_en),
      corrimientoInformado:
        row.corrimiento_informado === null ? null : String(row.corrimiento_informado),
      desactivadaMotivo:
        row.desactivada_motivo === null
          ? null
          : (String(row.desactivada_motivo) as "suspension" | "reparacion"),
      ordenColaEn: row.orden_cola_en === null ? null : String(row.orden_cola_en),
      ejemplarCodigo:
        row.ejemplar_codigo === undefined || row.ejemplar_codigo === null
          ? null
          : String(row.ejemplar_codigo),
      tituloNombre: row.titulo_nombre === undefined ? undefined : String(row.titulo_nombre),
      usuarioEmail: row.usuario_email === undefined ? undefined : String(row.usuario_email),
    };
  }

  async countCupoOcupado(usuarioId: number, ahoraIso: string): Promise<number> {
    const res = await this.db.execute({
      sql: `
        SELECT
          (SELECT COUNT(*) FROM reserva WHERE usuario_id = ? AND estado IN ('confirmada', 'desactivada')) +
          (SELECT COUNT(*) FROM prestamo WHERE usuario_id = ? AND devuelto_en IS NULL) +
          (SELECT COUNT(*) FROM cupo_penalizado WHERE usuario_id = ? AND penalizado_hasta > ?) AS total
      `,
      args: [usuarioId, usuarioId, usuarioId, ahoraIso],
    });
    return Number(res.rows[0].total);
  }

  async hasPrestamoVencido(usuarioId: number, ahoraIso: string): Promise<boolean> {
    const res = await this.db.execute({
      sql: "SELECT COUNT(*) AS total FROM prestamo WHERE usuario_id = ? AND devuelto_en IS NULL AND vence_en < ?",
      args: [usuarioId, ahoraIso],
    });
    return Number(res.rows[0].total) > 0;
  }

  async findById(reservaId: number): Promise<ReservaRecord | null> {
    const res = await this.db.execute({
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
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapReserva(res.rows[0] as Record<string, unknown>);
  }

  async createConfirmadaEnTransaccion(input: {
    usuarioId: number;
    tituloId: number;
    creadaEn: string;
    venceRetiroEn: string;
    corrimientoInformado: string | null;
    maxCupo: number;
    ahoraIso: string;
  }): Promise<ReservaRecord> {
    let tx: Awaited<ReturnType<Client["transaction"]>> | null = null;
    try {
      tx = await this.db.transaction("write");

      const cupoRes = await tx.execute({
        sql: `
          SELECT
            (SELECT COUNT(*) FROM reserva WHERE usuario_id = ? AND estado IN ('confirmada', 'desactivada')) +
            (SELECT COUNT(*) FROM prestamo WHERE usuario_id = ? AND devuelto_en IS NULL) +
            (SELECT COUNT(*) FROM cupo_penalizado WHERE usuario_id = ? AND penalizado_hasta > ?) AS total
        `,
        args: [input.usuarioId, input.usuarioId, input.usuarioId, input.ahoraIso],
      });
      if (Number(cupoRes.rows[0].total) >= input.maxCupo) {
        await tx.rollback();
        throw new ConflictError("Alcanzaste tu cupo máximo disponible.");
      }

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
        throw new ConflictError("No hay ejemplares prestables disponibles para este título.");
      }

      const ejRes = await tx.execute({
        sql: "SELECT id, codigo FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible' ORDER BY id ASC LIMIT 1",
        args: [input.tituloId],
      });
      if (ejRes.rows.length === 0) {
        await tx.rollback();
        throw new ConflictError("No hay ejemplares prestables disponibles para este título.");
      }

      const ejemplarId = Number(ejRes.rows[0].id);
      const ejemplarCodigo = String(ejRes.rows[0].codigo);

      const upd = await tx.execute({
        sql: "UPDATE ejemplar SET estado = 'reservado' WHERE id = ? AND estado = 'disponible'",
        args: [ejemplarId],
      });
      if (upd.rowsAffected === 0) {
        await tx.rollback();
        throw new ConflictError("El ejemplar acaba de ser reservado por otro usuario.");
      }

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

      const reservaId = Number(ins.lastInsertRowid);
      const rowRes = await tx.execute({
        sql: `
          SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre
          FROM reserva r
          LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
          INNER JOIN titulo t ON t.id = r.titulo_id
          WHERE r.id = ?
        `,
        args: [reservaId],
      });

      await tx.commit();
      const mapped = this.mapReserva(rowRes.rows[0] as Record<string, unknown>);
      mapped.ejemplarCodigo = ejemplarCodigo;
      return mapped;
    } catch (err) {
      if (tx) {
        try {
          await tx.rollback();
        } catch {
          // ignore
        }
      }
      if (err instanceof ConflictError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("SQLITE_BUSY")) {
        throw new ConflictError("No hay ejemplares prestables disponibles para este título.");
      }
      throw err;
    }
  }

  async cancelarEnTransaccion(reservaId: number, ejemplarId: number | null): Promise<ReservaRecord> {
    const tx = await this.db.transaction("write");
    try {
      await tx.execute({
        sql: "UPDATE reserva SET estado = 'cancelada', ejemplar_id = NULL WHERE id = ? AND estado IN ('confirmada', 'desactivada')",
        args: [reservaId],
      });
      if (ejemplarId !== null) {
        await tx.execute({
          sql: "UPDATE ejemplar SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'",
          args: [ejemplarId],
        });
      }
      await tx.execute({
        sql: "UPDATE lista_espera SET estado = 'cancelado' WHERE reserva_desactivada_id = ? AND estado IN ('esperando', 'avisado')",
        args: [reservaId],
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const updated = await this.findById(reservaId);
    if (!updated) {
      throw new Error("No se pudo leer la reserva cancelada.");
    }
    return updated;
  }

  async listConfirmadasVencidas(ahoraIso: string): Promise<ReservaRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre, u.email AS usuario_email
        FROM reserva r
        LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
        INNER JOIN titulo t ON t.id = r.titulo_id
        INNER JOIN usuario u ON u.id = r.usuario_id
        WHERE r.estado = 'confirmada' AND r.vence_retiro_en IS NOT NULL AND r.vence_retiro_en < ?
        ORDER BY r.vence_retiro_en ASC
      `,
      args: [ahoraIso],
    });
    return res.rows.map((r) => this.mapReserva(r as Record<string, unknown>));
  }

  async marcarVencidaYPenalizarEnTransaccion(input: {
    reservaId: number;
    usuarioId: number;
    ejemplarId: number | null;
    penalizadoHasta: string;
    creadoEn: string;
  }): Promise<boolean> {
    const tx = await this.db.transaction("write");
    try {
      const upd = await tx.execute({
        sql: "UPDATE reserva SET estado = 'vencida' WHERE id = ? AND estado = 'confirmada'",
        args: [input.reservaId],
      });
      if (upd.rowsAffected === 0) {
        await tx.rollback();
        return false;
      }
      if (input.ejemplarId !== null) {
        await tx.execute({
          sql: "UPDATE ejemplar SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'",
          args: [input.ejemplarId],
        });
      }
      await tx.execute({
        sql: "INSERT INTO cupo_penalizado (usuario_id, reserva_id, penalizado_hasta, creado_en) VALUES (?, ?, ?, ?)",
        args: [input.usuarioId, input.reservaId, input.penalizadoHasta, input.creadoEn],
      });
      await tx.commit();
      return true;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async listByUsuario(usuarioId: number): Promise<ReservaRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre
        FROM reserva r
        LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
        INNER JOIN titulo t ON t.id = r.titulo_id
        WHERE r.usuario_id = ?
        ORDER BY r.id DESC
      `,
      args: [usuarioId],
    });
    return res.rows.map((r) => this.mapReserva(r as Record<string, unknown>));
  }

  async listAll(): Promise<ReservaRecord[]> {
    const res = await this.db.execute(`
      SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre, u.email AS usuario_email
      FROM reserva r
      LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
      INNER JOIN titulo t ON t.id = r.titulo_id
      INNER JOIN usuario u ON u.id = r.usuario_id
      ORDER BY r.id DESC
    `);
    return res.rows.map((r) => this.mapReserva(r as Record<string, unknown>));
  }

  async listPenalidadesVigentes(usuarioId: number, ahoraIso: string): Promise<CupoPenalizadoRecord[]> {
    const res = await this.db.execute({
      sql: "SELECT id, usuario_id, reserva_id, penalizado_hasta, creado_en FROM cupo_penalizado WHERE usuario_id = ? AND penalizado_hasta > ? ORDER BY penalizado_hasta ASC",
      args: [usuarioId, ahoraIso],
    });
    return res.rows.map((r) => ({
      id: Number(r.id),
      usuarioId: Number(r.usuario_id),
      reservaId: Number(r.reserva_id),
      penalizadoHasta: String(r.penalizado_hasta),
      creadoEn: String(r.creado_en),
    }));
  }
}
