import type { Client } from "@libsql/client";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { ReservaRecord } from "./ReservaRepository.js";

export type EstadoEjemplar = "disponible" | "reservado" | "prestado" | "en_reparacion";

export interface TituloRecord {
  id: number;
  nombre: string;
  autor: string;
  isbn: string | null;
  creadoEn: string;
}

export interface EjemplarRecord {
  id: number;
  tituloId: number;
  codigo: string;
  soloEnSala: boolean;
  estado: EstadoEjemplar;
}

export class CatalogoRepository {
  constructor(private readonly db: Client) {}

  private mapTitulo(row: Record<string, unknown>): TituloRecord {
    return {
      id: Number(row.id),
      nombre: String(row.nombre),
      autor: String(row.autor),
      isbn: row.isbn === null ? null : String(row.isbn),
      creadoEn: String(row.creado_en),
    };
  }

  private mapEjemplar(row: Record<string, unknown>): EjemplarRecord {
    return {
      id: Number(row.id),
      tituloId: Number(row.titulo_id),
      codigo: String(row.codigo),
      soloEnSala: Number(row.solo_en_sala) === 1,
      estado: String(row.estado) as EstadoEjemplar,
    };
  }

  async listTitulos(): Promise<TituloRecord[]> {
    const res = await this.db.execute(
      "SELECT id, nombre, autor, isbn, creado_en FROM titulo ORDER BY id ASC"
    );
    return res.rows.map((r) => this.mapTitulo(r as Record<string, unknown>));
  }

  async findTituloById(id: number): Promise<TituloRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT id, nombre, autor, isbn, creado_en FROM titulo WHERE id = ?",
      args: [id],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapTitulo(res.rows[0] as Record<string, unknown>);
  }

  async createTitulo(input: {
    nombre: string;
    autor: string;
    isbn: string | null;
    creadoEn: string;
  }): Promise<TituloRecord> {
    const res = await this.db.execute({
      sql: "INSERT INTO titulo (nombre, autor, isbn, creado_en) VALUES (?, ?, ?, ?)",
      args: [input.nombre.trim(), input.autor.trim(), input.isbn, input.creadoEn],
    });
    const created = await this.findTituloById(Number(res.lastInsertRowid));
    if (!created) {
      throw new Error("No se pudo recuperar el título creado.");
    }
    return created;
  }

  async listAllEjemplares(): Promise<EjemplarRecord[]> {
    const res = await this.db.execute(
      "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar ORDER BY id ASC"
    );
    return res.rows.map((r) => this.mapEjemplar(r as Record<string, unknown>));
  }

  async findEjemplarByCodigo(codigo: string): Promise<EjemplarRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar WHERE lower(codigo) = lower(?)",
      args: [codigo.trim()],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapEjemplar(res.rows[0] as Record<string, unknown>);
  }

  async createEjemplar(input: {
    tituloId: number;
    codigo: string;
    soloEnSala: boolean;
  }): Promise<EjemplarRecord> {
    const res = await this.db.execute({
      sql: "INSERT INTO ejemplar (titulo_id, codigo, solo_en_sala, estado) VALUES (?, ?, ?, 'disponible')",
      args: [input.tituloId, input.codigo.trim(), input.soloEnSala ? 1 : 0],
    });
    const created = await this.db.execute({
      sql: "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar WHERE id = ?",
      args: [Number(res.lastInsertRowid)],
    });
    return this.mapEjemplar(created.rows[0] as Record<string, unknown>);
  }

  async findEjemplarById(ejemplarId: number): Promise<EjemplarRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar WHERE id = ?",
      args: [ejemplarId],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapEjemplar(res.rows[0] as Record<string, unknown>);
  }

  async pasarAReparacionEnTransaccion(ejemplarId: number): Promise<{
    ejemplar: EjemplarRecord;
    accion: "sin_reserva" | "reasignada" | "desactivada";
    reservaAfectada: ReservaRecord | null;
    ejemplarReemplazoCodigo: string | null;
  }> {
    const tx = await this.db.transaction("write");
    try {
      const ejRes = await tx.execute({
        sql: "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar WHERE id = ?",
        args: [ejemplarId],
      });
      if (ejRes.rows.length === 0) {
        await tx.rollback();
        throw new NotFoundError("Ejemplar no encontrado.");
      }

      const ejemplar = this.mapEjemplar(ejRes.rows[0] as Record<string, unknown>);
      if (ejemplar.estado === "prestado") {
        await tx.rollback();
        throw new ConflictError("No se puede enviar a reparación un ejemplar actualmente prestado.");
      }
      if (ejemplar.estado === "en_reparacion") {
        await tx.rollback();
        throw new ConflictError("El ejemplar ya se encuentra en reparación.");
      }

      await tx.execute({
        sql: "UPDATE ejemplar SET estado = 'en_reparacion' WHERE id = ?",
        args: [ejemplarId],
      });

      let accion: "sin_reserva" | "reasignada" | "desactivada" = "sin_reserva";
      let reservaAfectadaId: number | null = null;
      let ejemplarReemplazoCodigo: string | null = null;

      if (ejemplar.estado === "reservado") {
        const rRes = await tx.execute({
          sql: "SELECT id, titulo_id, usuario_id, creada_en FROM reserva WHERE ejemplar_id = ? AND estado = 'confirmada' LIMIT 1",
          args: [ejemplarId],
        });

        if (rRes.rows.length > 0) {
          const reservaRow = rRes.rows[0];
          reservaAfectadaId = Number(reservaRow.id);
          const tituloId = Number(reservaRow.titulo_id);
          const usuarioId = Number(reservaRow.usuario_id);
          const creadaEn = String(reservaRow.creada_en);

          const stockRes = await tx.execute({
            sql: `
              SELECT
                (SELECT COUNT(*) FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible' AND id != ?) AS disponibles,
                (SELECT COUNT(*) FROM lista_espera WHERE titulo_id = ? AND estado = 'avisado') AS avisados
            `,
            args: [tituloId, ejemplarId, tituloId],
          });

          const disponibles = Number(stockRes.rows[0].disponibles);
          const avisados = Number(stockRes.rows[0].avisados);

          if (disponibles > avisados) {
            const altRes = await tx.execute({
              sql: "SELECT id, codigo FROM ejemplar WHERE titulo_id = ? AND solo_en_sala = 0 AND estado = 'disponible' AND id != ? ORDER BY id ASC LIMIT 1",
              args: [tituloId, ejemplarId],
            });
            if (altRes.rows.length > 0) {
              const reemplazoId = Number(altRes.rows[0].id);
              ejemplarReemplazoCodigo = String(altRes.rows[0].codigo);

              await tx.execute({
                sql: "UPDATE ejemplar SET estado = 'reservado' WHERE id = ?",
                args: [reemplazoId],
              });
              await tx.execute({
                sql: "UPDATE reserva SET ejemplar_id = ? WHERE id = ? AND estado = 'confirmada'",
                args: [reemplazoId, reservaAfectadaId],
              });
              accion = "reasignada";
            }
          }

          if (accion === "sin_reserva") {
            await tx.execute({
              sql: `
                UPDATE reserva
                SET estado = 'desactivada',
                    ejemplar_id = NULL,
                    desactivada_motivo = 'reparacion',
                    orden_cola_en = ?
                WHERE id = ? AND estado = 'confirmada'
              `,
              args: [creadaEn, reservaAfectadaId],
            });
            await tx.execute({
              sql: `
                INSERT INTO lista_espera (titulo_id, usuario_id, reserva_desactivada_id, estado, orden_en)
                VALUES (?, ?, ?, 'esperando', ?)
              `,
              args: [tituloId, usuarioId, reservaAfectadaId, creadaEn],
            });
            accion = "desactivada";
          }
        }
      }

      let reservaAfectada: ReservaRecord | null = null;
      if (reservaAfectadaId !== null) {
        const resRow = await tx.execute({
          sql: `
            SELECT r.*, e.codigo AS ejemplar_codigo, t.nombre AS titulo_nombre, u.email AS usuario_email
            FROM reserva r
            LEFT JOIN ejemplar e ON e.id = r.ejemplar_id
            INNER JOIN titulo t ON t.id = r.titulo_id
            INNER JOIN usuario u ON u.id = r.usuario_id
            WHERE r.id = ?
          `,
          args: [reservaAfectadaId],
        });
        if (resRow.rows.length > 0) {
          const row = resRow.rows[0] as Record<string, unknown>;
          reservaAfectada = {
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
        }
      }

      const ejFinalRes = await tx.execute({
        sql: "SELECT id, titulo_id, codigo, solo_en_sala, estado FROM ejemplar WHERE id = ?",
        args: [ejemplarId],
      });
      await tx.commit();

      return {
        ejemplar: this.mapEjemplar(ejFinalRes.rows[0] as Record<string, unknown>),
        accion,
        reservaAfectada,
        ejemplarReemplazoCodigo,
      };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async sacarDeReparacionEnTransaccion(ejemplarId: number): Promise<EjemplarRecord> {
    const existing = await this.findEjemplarById(ejemplarId);
    if (!existing) {
      throw new NotFoundError("Ejemplar no encontrado.");
    }
    if (existing.estado !== "en_reparacion") {
      throw new ConflictError("El ejemplar no está en reparación.");
    }
    await this.db.execute({
      sql: "UPDATE ejemplar SET estado = 'disponible' WHERE id = ? AND estado = 'en_reparacion'",
      args: [ejemplarId],
    });
    const updated = await this.findEjemplarById(ejemplarId);
    if (!updated) {
      throw new Error("No se pudo recuperar el ejemplar actualizado.");
    }
    return updated;
  }
}
