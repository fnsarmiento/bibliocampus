import type { Client } from "@libsql/client";

export interface FeriadoRecord {
  fecha: string;
  descripcion: string;
}

export class FeriadoRepository {
  constructor(private readonly db: Client) {}

  async listAll(): Promise<FeriadoRecord[]> {
    const res = await this.db.execute("SELECT fecha, descripcion FROM feriado ORDER BY fecha ASC");
    return res.rows.map((r) => ({
      fecha: String(r.fecha),
      descripcion: String(r.descripcion),
    }));
  }

  async listFechas(): Promise<string[]> {
    const rows = await this.listAll();
    return rows.map((f) => f.fecha);
  }

  async findByFecha(fecha: string): Promise<FeriadoRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT fecha, descripcion FROM feriado WHERE fecha = ?",
      args: [fecha],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return {
      fecha: String(res.rows[0].fecha),
      descripcion: String(res.rows[0].descripcion),
    };
  }

  async upsert(fecha: string, descripcion: string): Promise<{ feriado: FeriadoRecord; creado: boolean }> {
    const existing = await this.findByFecha(fecha);
    if (existing) {
      await this.db.execute({
        sql: "UPDATE feriado SET descripcion = ? WHERE fecha = ?",
        args: [descripcion, fecha],
      });
      return { feriado: { fecha, descripcion }, creado: false };
    }

    await this.db.execute({
      sql: "INSERT INTO feriado (fecha, descripcion) VALUES (?, ?)",
      args: [fecha, descripcion],
    });
    return { feriado: { fecha, descripcion }, creado: true };
  }
}
