import type { Request, Response } from "express";
import { handleControllerError } from "../domain/errors.js";
import type { FeriadoService } from "../service/FeriadoService.js";

export class FeriadoController {
  constructor(private readonly feriadoService: FeriadoService) {}

  listar = async (_req: Request, res: Response): Promise<void> => {
    try {
      const feriados = await this.feriadoService.listar();
      res.status(200).json(feriados);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  cargar = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { feriado, creado } = await this.feriadoService.cargar({
        fecha: body.fecha,
        descripcion: body.descripcion,
      });
      res.status(creado ? 201 : 200).json(feriado);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
