import { HashPassword } from "../components/HashPassword.js";
import type { Reloj } from "../components/Reloj.js";
import type { UsuarioRecord, UsuarioRepository } from "../repository/UsuarioRepository.js";

export class UsuarioService {
  constructor(
    private readonly usuarioRepo: UsuarioRepository,
    private readonly reloj: Reloj
  ) {}

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
}
