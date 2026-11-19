import type { Client } from "@libsql/client";
import type { Reloj } from "../components/Reloj.js";
import { UsuarioRepository } from "../repository/UsuarioRepository.js";
import { UsuarioService } from "../service/UsuarioService.js";

export interface InitialDataConfig {
  adminEmail: string;
  adminPassword: string;
}

/**
 * Orquesta la carga inicial delegando toda lógica de dominio a UsuarioService (RN-06).
 */
export async function loadInitialData(
  db: Client,
  reloj: Reloj,
  config: InitialDataConfig
): Promise<void> {
  const usuarioRepo = new UsuarioRepository(db);
  const usuarioService = new UsuarioService(usuarioRepo, reloj);
  await usuarioService.asegurarBibliotecarioInicial(config.adminEmail, config.adminPassword);
}
