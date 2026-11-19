import type { Client } from "@libsql/client";

export type RolUsuario = "Alumno" | "Docente" | "Bibliotecario";

export interface UsuarioRecord {
  id: number;
  nombre: string;
  email: string;
  contrasenaHash: string;
  rol: RolUsuario;
  suspendidoHasta: string | null;
  creadoEn: string;
}

export class UsuarioRepository {
  constructor(private readonly db: Client) {}

  private mapRow(row: Record<string, unknown>): UsuarioRecord {
    return {
      id: Number(row.id),
      nombre: String(row.nombre),
      email: String(row.email),
      contrasenaHash: String(row.contrasena_hash),
      rol: String(row.rol) as RolUsuario,
      suspendidoHasta: row.suspendido_hasta === null ? null : String(row.suspendido_hasta),
      creadoEn: String(row.creado_en),
    };
  }

  async findByEmail(email: string): Promise<UsuarioRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT id, nombre, email, contrasena_hash, rol, suspendido_hasta, creado_en FROM usuario WHERE lower(email) = lower(?)",
      args: [email.trim()],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapRow(res.rows[0] as Record<string, unknown>);
  }

  async findById(id: number): Promise<UsuarioRecord | null> {
    const res = await this.db.execute({
      sql: "SELECT id, nombre, email, contrasena_hash, rol, suspendido_hasta, creado_en FROM usuario WHERE id = ?",
      args: [id],
    });
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapRow(res.rows[0] as Record<string, unknown>);
  }

  async listAll(): Promise<UsuarioRecord[]> {
    const res = await this.db.execute(
      "SELECT id, nombre, email, contrasena_hash, rol, suspendido_hasta, creado_en FROM usuario ORDER BY id ASC"
    );
    return res.rows.map((r) => this.mapRow(r as Record<string, unknown>));
  }

  async create(input: {
    nombre: string;
    email: string;
    contrasenaHash: string;
    rol: RolUsuario;
    creadoEn: string;
  }): Promise<UsuarioRecord> {
    const res = await this.db.execute({
      sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)",
      args: [input.nombre.trim(), input.email.trim().toLowerCase(), input.contrasenaHash, input.rol, input.creadoEn],
    });
    const inserted = await this.findById(Number(res.lastInsertRowid));
    if (!inserted) {
      throw new Error("No se pudo recuperar el usuario recién creado.");
    }
    return inserted;
  }

  async updateRol(id: number, rol: RolUsuario): Promise<UsuarioRecord | null> {
    await this.db.execute({
      sql: "UPDATE usuario SET rol = ? WHERE id = ?",
      args: [rol, id],
    });
    return this.findById(id);
  }
}
