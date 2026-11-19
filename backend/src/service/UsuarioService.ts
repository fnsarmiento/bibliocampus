import crypto from "node:crypto";
import { HashPassword } from "../components/HashPassword.js";
import type { Reloj } from "../components/Reloj.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../domain/errors.js";
import type { SesionRepository } from "../repository/SesionRepository.js";
import type { RolUsuario, UsuarioRecord, UsuarioRepository } from "../repository/UsuarioRepository.js";

const ROLES_VALIDOS: RolUsuario[] = ["Alumno", "Docente", "Bibliotecario"];

export interface UsuarioPublico {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
  cupoMaximo: number;
  suspendidoHasta: string | null;
  creadoEn: string;
}

export class UsuarioService {
  constructor(
    private readonly usuarioRepo: UsuarioRepository,
    private readonly reloj: Reloj,
    private readonly sesionRepo?: SesionRepository
  ) {}

  cupoMaximoPara(rol: RolUsuario): number {
    return rol === "Alumno" ? 2 : 5;
  }

  toPublico(record: UsuarioRecord): UsuarioPublico {
    return {
      id: record.id,
      nombre: record.nombre,
      email: record.email,
      rol: record.rol,
      cupoMaximo: this.cupoMaximoPara(record.rol),
      suspendidoHasta: record.suspendidoHasta,
      creadoEn: record.creadoEn,
    };
  }

  /**
   * Crea de forma idempotente al bibliotecario inicial (RN-06).
   */
  async asegurarBibliotecarioInicial(email: string, plainPassword: string): Promise<UsuarioRecord> {
    if (!email.trim() || !plainPassword) {
      throw new Error("INITIAL_ADMIN_EMAIL y INITIAL_ADMIN_PASSWORD son obligatorios.");
    }

    const existing = await this.usuarioRepo.findByEmail(email);
    if (existing) {
      return existing;
    }

    const contrasenaHash = HashPassword.hash(plainPassword);
    return this.usuarioRepo.create({
      nombre: "Bibliotecario Inicial",
      email,
      contrasenaHash,
      rol: "Bibliotecario",
      creadoEn: this.reloj.now().toISOString(),
    });
  }

  /**
   * Registra un usuario público con rol Alumno por defecto (RN-04, RN-05).
   */
  async registrar(input: {
    nombre?: unknown;
    email?: unknown;
    contrasena?: unknown;
  }): Promise<UsuarioPublico> {
    const nombre = typeof input.nombre === "string" ? input.nombre.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const contrasena = typeof input.contrasena === "string" ? input.contrasena : "";

    if (!nombre || !email || !contrasena) {
      throw new ValidationError("Los campos nombre, email y contrasena son obligatorios.");
    }

    const existing = await this.usuarioRepo.findByEmail(email);
    if (existing) {
      throw new ConflictError("Ya existe un usuario registrado con ese email.");
    }

    const created = await this.usuarioRepo.create({
      nombre,
      email,
      contrasenaHash: HashPassword.hash(contrasena),
      rol: "Alumno",
      creadoEn: this.reloj.now().toISOString(),
    });

    return this.toPublico(created);
  }

  /**
   * Valida credenciales y emite un token Bearer de sesión (RN-04, HU-01).
   */
  async entrar(input: { email?: unknown; contrasena?: unknown }): Promise<{ token: string; usuario: UsuarioPublico }> {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const contrasena = typeof input.contrasena === "string" ? input.contrasena : "";

    if (!email || !contrasena) {
      throw new ValidationError("Los campos email y contrasena son obligatorios.");
    }

    if (!this.sesionRepo) {
      throw new Error("SesionRepository no configurado en UsuarioService.");
    }

    const user = await this.usuarioRepo.findByEmail(email);
    if (!user || !HashPassword.verify(contrasena, user.contrasenaHash)) {
      throw new UnauthorizedError("Credenciales inválidas.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    await this.sesionRepo.create(token, user.id, this.reloj.now().toISOString());

    return {
      token,
      usuario: this.toPublico(user),
    };
  }

  async autenticarToken(token: string): Promise<UsuarioPublico> {
    if (!this.sesionRepo || !token) {
      throw new UnauthorizedError();
    }
    const user = await this.sesionRepo.findUserByToken(token);
    if (!user) {
      throw new UnauthorizedError();
    }
    return this.toPublico(user);
  }

  async listarUsuarios(): Promise<UsuarioPublico[]> {
    const users = await this.usuarioRepo.listAll();
    return users.map((u) => this.toPublico(u));
  }

  /**
   * Permite al bibliotecario cambiar el rol de un usuario (RN-06, RN-07).
   */
  async cambiarRol(usuarioId: number, rolInput: unknown): Promise<UsuarioPublico> {
    if (typeof rolInput !== "string" || !ROLES_VALIDOS.includes(rolInput as RolUsuario)) {
      throw new ValidationError("Rol inválido. Debe ser Alumno, Docente o Bibliotecario.");
    }
    const existing = await this.usuarioRepo.findById(usuarioId);
    if (!existing) {
      throw new NotFoundError("Usuario no encontrado.");
    }
    const updated = await this.usuarioRepo.updateRol(usuarioId, rolInput as RolUsuario);
    if (!updated) {
      throw new NotFoundError("Usuario no encontrado.");
    }
    return this.toPublico(updated);
  }
}
