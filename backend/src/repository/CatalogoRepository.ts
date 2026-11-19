import type { Client } from "@libsql/client";

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
}
