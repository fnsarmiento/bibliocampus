import type { Request, Response } from "express";
import { handleControllerError, ValidationError } from "../domain/errors.js";
import type { CatalogoService } from "../service/CatalogoService.js";
import type { ReparacionService } from "../service/ReparacionService.js";

export class CatalogoController {
  constructor(
    private readonly catalogoService: CatalogoService,
    private readonly beforeList?: () => Promise<void>,
    private readonly reparacionService?: ReparacionService
  ) {}

  listar = async (_req: Request, res: Response): Promise<void> => {
    try {
      if (this.beforeList) {
        await this.beforeList();
      }
      const catalogo = await this.catalogoService.listarCatalogo();
      res.status(200).json(catalogo);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  crearTitulo = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const titulo = await this.catalogoService.crearTitulo({
        nombre: body.nombre,
        autor: body.autor,
        isbn: body.isbn,
      });
      res.status(201).json(titulo);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  agregarEjemplar = async (req: Request, res: Response): Promise<void> => {
    try {
      const tituloId = Number(req.params.tituloId);
      if (!Number.isInteger(tituloId) || tituloId <= 0) {
        throw new ValidationError("Identificador de título inválido.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const ejemplar = await this.catalogoService.agregarEjemplar(tituloId, {
        codigo: body.codigo,
        soloEnSala: body.soloEnSala,
      });
      res.status(201).json(ejemplar);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  cambiarReparacion = async (req: Request, res: Response): Promise<void> => {
    try {
      const ejemplarId = Number(req.params.ejemplarId);
      if (!Number.isInteger(ejemplarId) || ejemplarId <= 0) {
        throw new ValidationError("Identificador de ejemplar inválido.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.enReparacion !== "boolean") {
        throw new ValidationError("El campo booleano enReparacion es obligatorio.");
      }
      if (!this.reparacionService) {
        throw new Error("ReparacionService no configurado.");
      }
      const resultado = await this.reparacionService.cambiarReparacion(
        ejemplarId,
        body.enReparacion
      );
      res.status(200).json(resultado);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
