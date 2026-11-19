import type { Client } from "@libsql/client";
import type { RolUsuario, UsuarioRecord } from "./UsuarioRepository.js";

export class SesionRepository {
  constructor(private readonly db: Client) {}

  async create(token: string, usuarioId: number, creadaEn: string): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO sesion (token, usuario_id, creada_en) VALUES (?, ?, ?)",
      args: [token, usuarioId, creadaEn],
    });
  }

  async findUserByToken(token: string): Promise<UsuarioRecord | null> {
    const res = await this.db.execute({
      sql: `
        SELECT u.id, u.nombre, u.email, u.contrasena_hash, u.rol, u.suspendido_hasta, u.creado_en
        FROM sesion s
        INNER JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token = ?
      `,
      args: [token],
    });
    if (res.rows.length === 0) {
      return null;
    }
    const row = res.rows[0] as Record<string, unknown>;
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
}
