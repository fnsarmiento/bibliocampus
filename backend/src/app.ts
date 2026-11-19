import type { Client } from "@libsql/client";
import cors from "cors";
import express, { type Express } from "express";
import { CalendarioHabil } from "./components/CalendarioHabil.js";
import { FakeCorreo, type Correo } from "./components/Correo.js";
import { SystemReloj, type Reloj } from "./components/Reloj.js";
import { CatalogoController } from "./controller/CatalogoController.js";
import { FeriadoController } from "./controller/FeriadoController.js";
import { ListaEsperaController } from "./controller/ListaEsperaController.js";
import { PrestamoController } from "./controller/PrestamoController.js";
import { ReservaController } from "./controller/ReservaController.js";
import { UsuarioController } from "./controller/UsuarioController.js";
import { crearAutenticar, soloBibliotecario } from "./middleware/auth.js";
import { CatalogoRepository } from "./repository/CatalogoRepository.js";
import { FeriadoRepository } from "./repository/FeriadoRepository.js";
import { ListaEsperaRepository } from "./repository/ListaEsperaRepository.js";
import { PrestamoRepository } from "./repository/PrestamoRepository.js";
import { ReservaRepository } from "./repository/ReservaRepository.js";
import { SesionRepository } from "./repository/SesionRepository.js";
import { UsuarioRepository } from "./repository/UsuarioRepository.js";
import { CatalogoService } from "./service/CatalogoService.js";
import { FeriadoService } from "./service/FeriadoService.js";
import { ListaEsperaService } from "./service/ListaEsperaService.js";
import { PrestamoService } from "./service/PrestamoService.js";
import { ReparacionService } from "./service/ReparacionService.js";
import { ReservaService } from "./service/ReservaService.js";
import { UsuarioService } from "./service/UsuarioService.js";

export interface AppDependencies {
  db: Client;
  reloj?: Reloj;
  correo?: Correo;
}

function parseAllowedOrigins(allowedOrigin?: string): string[] {
  if (!allowedOrigin) {
    return [];
  }
  return allowedOrigin
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o.length > 0);
}

/**
 * Crea la instancia de la aplicación Express cableando repositorios, servicios, middlewares y controllers.
 */
export function createApp(allowedOrigin?: string, deps?: AppDependencies): Express {
  const app = express();
  const origins = parseAllowedOrigins(allowedOrigin);

  app.use(
    cors({
      origin: origins.length > 0 ? origins : true,
    })
  );
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    if (!deps?.db) {
      res.status(200).json({ ok: true });
      return;
    }
    try {
      await deps.db.execute("SELECT 1");
      res.status(200).json({ ok: true, db: "ok" });
    } catch {
      res.status(503).json({ ok: false, db: "error" });
    }
  });

  if (deps) {
    const reloj = deps.reloj ?? new SystemReloj();
    const correo = deps.correo ?? new FakeCorreo(reloj);
    const calendario = new CalendarioHabil();

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

    const catalogoRepo = new CatalogoRepository(deps.db);
    const feriadoRepo = new FeriadoRepository(deps.db);
    const reservaRepo = new ReservaRepository(deps.db);
    const listaEsperaRepo = new ListaEsperaRepository(deps.db);

    const catalogoService = new CatalogoService(catalogoRepo, reloj);
    const feriadoService = new FeriadoService(feriadoRepo);
    const reservaService = new ReservaService(
      reservaRepo,
      catalogoRepo,
      feriadoRepo,
      calendario,
      reloj,
      correo
    );
    const listaEsperaService = new ListaEsperaService(
      listaEsperaRepo,
      reservaRepo,
      catalogoRepo,
      feriadoRepo,
      calendario,
      reloj,
      correo,
      () => reservaService.procesarVencimientos()
    );
    reservaService.setListaEsperaProcessor((titulosLiberados) =>
      listaEsperaService.procesarVencimientosYAsignar(titulosLiberados)
    );
    const reparacionService = new ReparacionService(catalogoRepo, correo, () =>
      reservaService.procesarVencimientos()
    );

    const catalogoController = new CatalogoController(
      catalogoService,
      () => reservaService.procesarVencimientos(),
      reparacionService
    );
    const feriadoController = new FeriadoController(feriadoService);
    const reservaController = new ReservaController(reservaService, listaEsperaService);

    app.get("/titulos", catalogoController.listar);
    app.post("/titulos", autenticar, soloBibliotecario, catalogoController.crearTitulo);
    app.post(
      "/titulos/:tituloId/ejemplares",
      autenticar,
      soloBibliotecario,
      catalogoController.agregarEjemplar
    );
    app.patch(
      "/ejemplares/:ejemplarId/reparacion",
      autenticar,
      soloBibliotecario,
      catalogoController.cambiarReparacion
    );

    app.get("/feriados", feriadoController.listar);
    app.post("/feriados", autenticar, soloBibliotecario, feriadoController.cargar);

    app.post("/reservas", autenticar, reservaController.crear);
    app.get("/mis-reservas", autenticar, reservaController.mias);
    app.get("/reservas", autenticar, soloBibliotecario, reservaController.listarTodas);
    app.delete("/reservas/:reservaId", autenticar, reservaController.cancelar);
    app.post("/reservas/:reservaId/reactivar", autenticar, reservaController.reactivar);

    const prestamoRepo = new PrestamoRepository(deps.db);
    const prestamoService = new PrestamoService(
      prestamoRepo,
      reservaRepo,
      usuarioRepo,
      feriadoRepo,
      reservaService,
      calendario,
      reloj,
      correo
    );
    const prestamoController = new PrestamoController(prestamoService);

    app.get("/prestamos", autenticar, prestamoController.listar);
    app.post("/prestamos/retiro", autenticar, soloBibliotecario, prestamoController.retiro);
    app.post(
      "/prestamos/:prestamoId/devolucion",
      autenticar,
      soloBibliotecario,
      prestamoController.devolucion
    );
    app.post("/prestamos/:prestamoId/renovar", autenticar, prestamoController.renovar);

    const listaEsperaController = new ListaEsperaController(listaEsperaService);

    app.post("/listas-espera", autenticar, listaEsperaController.anotarse);
    app.get("/mis-listas-espera", autenticar, listaEsperaController.mias);
    app.post("/listas-espera/:esperaId/confirmar", autenticar, listaEsperaController.confirmar);
    app.post("/listas-espera/:esperaId/rechazar", autenticar, listaEsperaController.rechazar);
  }

  return app;
}
