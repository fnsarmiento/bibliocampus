import type { Client } from "@libsql/client";

export interface PrestamoRecord {
  id: number;
  reservaId: number;
  usuarioId: number;
  ejemplarId: number;
  retiradoEn: string;
  venceEn: string;
  renovado: boolean;
  devueltoEn: string | null;
  diasAtraso: number;
  vencido?: boolean;
  usuarioNombre?: string;
  usuarioEmail?: string;
  ejemplarCodigo?: string;
  tituloId?: number;
  tituloNombre?: string;
}

export class PrestamoRepository {
  constructor(private readonly db: Client) {}

  private mapRow(row: Record<string, unknown>, ahoraIso?: string): PrestamoRecord {
    const devueltoEn = row.devuelto_en === null ? null : String(row.devuelto_en);
    const venceEn = String(row.vence_en);
    return {
      id: Number(row.id),
      reservaId: Number(row.reserva_id),
      usuarioId: Number(row.usuario_id),
      ejemplarId: Number(row.ejemplar_id),
      retiradoEn: String(row.retirado_en),
      venceEn,
      renovado: Number(row.renovado) === 1,
      devueltoEn,
      diasAtraso: Number(row.dias_atraso),
      vencido: ahoraIso ? devueltoEn === null && venceEn < ahoraIso : undefined,
      usuarioNombre: row.usuario_nombre === undefined ? undefined : String(row.usuario_nombre),
      usuarioEmail: row.usuario_email === undefined ? undefined : String(row.usuario_email),
      ejemplarCodigo: row.ejemplar_codigo === undefined ? undefined : String(row.ejemplar_codigo),
      tituloId: row.titulo_id === undefined ? undefined : Number(row.titulo_id),
      tituloNombre: row.titulo_nombre === undefined ? undefined : String(row.titulo_nombre),
    };
  }

  async findById(id: number, ahoraIso?: string): Promise<PrestamoRecord | null> {
    const res = await this.db.execute({
      sql: `
        SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
               e.codigo AS ejemplar_codigo, e.titulo_id AS titulo_id, t.nombre AS titulo_nombre
        FROM prestamo p
        INNER JOIN usuario u ON u.id = p.usuario_id
        INNER JOIN ejemplar e ON e.id = p.ejemplar_id
        INNER JOIN titulo t ON t.id = e.titulo_id
        WHERE p.id = ?
      `,
      args: [id],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapRow(res.rows[0] as Record<string, unknown>, ahoraIso);
  }

  async listAll(ahoraIso: string): Promise<PrestamoRecord[]> {
    const res = await this.db.execute(`
      SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
             e.codigo AS ejemplar_codigo, e.titulo_id AS titulo_id, t.nombre AS titulo_nombre
      FROM prestamo p
      INNER JOIN usuario u ON u.id = p.usuario_id
      INNER JOIN ejemplar e ON e.id = p.ejemplar_id
      INNER JOIN titulo t ON t.id = e.titulo_id
      ORDER BY p.id DESC
    `);
    return res.rows.map((r) => this.mapRow(r as Record<string, unknown>, ahoraIso));
  }

  async listByUsuario(usuarioId: number, ahoraIso: string): Promise<PrestamoRecord[]> {
    const res = await this.db.execute({
      sql: `
        SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
               e.codigo AS ejemplar_codigo, e.titulo_id AS titulo_id, t.nombre AS titulo_nombre
        FROM prestamo p
        INNER JOIN usuario u ON u.id = p.usuario_id
        INNER JOIN ejemplar e ON e.id = p.ejemplar_id
        INNER JOIN titulo t ON t.id = e.titulo_id
        WHERE p.usuario_id = ?
        ORDER BY p.id DESC
      `,
      args: [usuarioId],
    });
    return res.rows.map((r) => this.mapRow(r as Record<string, unknown>, ahoraIso));
  }

  async registrarRetiroEnTransaccion(input: {
    reservaId: number;
    usuarioId: number;
    ejemplarId: number;
    retiradoEn: string;
    venceEn: string;
  }): Promise<PrestamoRecord> {
    const tx = await this.db.transaction("write");
    try {
      const updRes = await tx.execute({
        sql: "UPDATE reserva SET estado = 'retirada' WHERE id = ? AND estado = 'confirmada'",
        args: [input.reservaId],
      });
      if (updRes.rowsAffected === 0) {
        throw new Error("No se pudo marcar la reserva como retirada.");
      }

      await tx.execute({
        sql: "UPDATE ejemplar SET estado = 'prestado' WHERE id = ?",
        args: [input.ejemplarId],
      });

      const ins = await tx.execute({
        sql: `
          INSERT INTO prestamo (reserva_id, usuario_id, ejemplar_id, retirado_en, vence_en, renovado, dias_atraso)
          VALUES (?, ?, ?, ?, ?, 0, 0)
        `,
        args: [input.reservaId, input.usuarioId, input.ejemplarId, input.retiradoEn, input.venceEn],
      });

      const prestamoId = Number(ins.lastInsertRowid);
      await tx.commit();

      const created = await this.findById(prestamoId, input.retiradoEn);
      if (!created) {
        throw new Error("No se pudo recuperar el préstamo recién creado.");
      }
      return created;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async registrarDevolucionEnTransaccion(input: {
    prestamoId: number;
    ejemplarId: number;
    usuarioId: number;
    devueltoEn: string;
    diasAtraso: number;
    nuevoSuspendidoHasta: string | null;
  }): Promise<PrestamoRecord> {
    const tx = await this.db.transaction("write");
    try {
      const updP = await tx.execute({
        sql: "UPDATE prestamo SET devuelto_en = ?, dias_atraso = ? WHERE id = ? AND devuelto_en IS NULL",
        args: [input.devueltoEn, input.diasAtraso, input.prestamoId],
      });
      if (updP.rowsAffected === 0) {
        throw new Error("El préstamo ya fue devuelto.");
      }

      await tx.execute({
        sql: "UPDATE ejemplar SET estado = 'disponible' WHERE id = ?",
        args: [input.ejemplarId],
      });

      if (input.nuevoSuspendidoHasta) {
        await tx.execute({
          sql: "UPDATE usuario SET suspendido_hasta = ? WHERE id = ?",
          args: [input.nuevoSuspendidoHasta, input.usuarioId],
        });

        const pendientes = await tx.execute({
          sql: "SELECT id, titulo_id, ejemplar_id, creada_en FROM reserva WHERE usuario_id = ? AND estado = 'confirmada'",
          args: [input.usuarioId],
        });

        for (const r of pendientes.rows) {
          const reservaId = Number(r.id);
          const tituloId = Number(r.titulo_id);
          const ejId = r.ejemplar_id === null ? null : Number(r.ejemplar_id);
          const creadaEn = String(r.creada_en);

          await tx.execute({
            sql: `
              UPDATE reserva
              SET estado = 'desactivada', ejemplar_id = NULL, desactivada_motivo = 'suspension', orden_cola_en = ?
              WHERE id = ?
            `,
            args: [creadaEn, reservaId],
          });

          if (ejId !== null) {
            await tx.execute({
              sql: "UPDATE ejemplar SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'",
              args: [ejId],
            });
          }

          await tx.execute({
            sql: `
              INSERT INTO lista_espera (titulo_id, usuario_id, reserva_desactivada_id, estado, orden_en)
              VALUES (?, ?, ?, 'esperando', ?)
            `,
            args: [tituloId, input.usuarioId, reservaId, creadaEn],
          });
        }
      }

      await tx.commit();
      const updated = await this.findById(input.prestamoId, input.devueltoEn);
      if (!updated) {
        throw new Error("No se pudo recuperar el préstamo devuelto.");
      }
      return updated;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async hasActiveListaEsperaForTitulo(tituloId: number): Promise<boolean> {
    const res = await this.db.execute({
      sql: "SELECT COUNT(*) AS total FROM lista_espera WHERE titulo_id = ? AND estado IN ('esperando', 'avisado')",
      args: [tituloId],
    });
    return Number(res.rows[0].total) > 0;
  }

  async marcarRenovado(prestamoId: number, nuevoVenceEn: string, ahoraIso: string): Promise<PrestamoRecord> {
    const upd = await this.db.execute({
      sql: "UPDATE prestamo SET vence_en = ?, renovado = 1 WHERE id = ? AND renovado = 0 AND devuelto_en IS NULL",
      args: [nuevoVenceEn, prestamoId],
    });
    if (upd.rowsAffected === 0) {
      throw new Error("No se pudo renovar el préstamo.");
    }
    const updated = await this.findById(prestamoId, ahoraIso);
    if (!updated) {
      throw new Error("No se pudo recuperar el préstamo renovado.");
    }
    return updated;
  }
}
