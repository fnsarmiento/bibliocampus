import type { Client } from "@libsql/client";
import cors from "cors";
import express, { type Express } from "express";
import { SystemReloj, type Reloj } from "./components/Reloj.js";
import { UsuarioController } from "./controller/UsuarioController.js";
import { crearAutenticar, soloBibliotecario } from "./middleware/auth.js";
import { SesionRepository } from "./repository/SesionRepository.js";
import { UsuarioRepository } from "./repository/UsuarioRepository.js";
import { UsuarioService } from "./service/UsuarioService.js";

export interface AppDependencies {
  db: Client;
  reloj?: Reloj;
}

/**
 * Crea la instancia de la aplicación Express cableando repositorios, servicios, middlewares y controllers.
 */
export function createApp(allowedOrigin?: string, deps?: AppDependencies): Express {
  const app = express();

  app.use(
    cors({
      origin: allowedOrigin ? [allowedOrigin] : true,
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  if (deps) {
    const reloj = deps.reloj ?? new SystemReloj();
    const usuarioRepo = new UsuarioRepository(deps.db);
    const sesionRepo = new SesionRepository(deps.db);
    const usuarioService = new UsuarioService(usuarioRepo, reloj, sesionRepo);
    const usuarioController = new UsuarioController(usuarioService);
    const autenticar = crearAutenticar(usuarioService);

    app.post("/usuarios", usuarioController.registrar);
    app.post("/entrada", usuarioController.entrar);
    app.get("/yo", autenticar, usuarioController.yo);
    app.get("/usuarios", autenticar, soloBibliotecario, usuarioController.listar);
    app.patch("/usuarios/:usuarioId/rol", autenticar, soloBibliotecario, usuarioController.cambiarRol);
  }

  return app;
}
