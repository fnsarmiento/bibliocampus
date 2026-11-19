import type { Request, Response } from "express";
import { handleControllerError, ValidationError } from "../domain/errors.js";
import type { CatalogoService } from "../service/CatalogoService.js";

export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  listar = async (_req: Request, res: Response): Promise<void> => {
    try {
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
}
