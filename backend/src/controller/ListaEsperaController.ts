import type { Response } from "express";
import { handleControllerError, UnauthorizedError, ValidationError } from "../domain/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { ListaEsperaService } from "../service/ListaEsperaService.js";

export class ListaEsperaController {
  constructor(private readonly listaEsperaService: ListaEsperaService) {}

  anotarse = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const tituloId = Number(body.tituloId);
      if (!Number.isInteger(tituloId) || tituloId <= 0) {
        throw new ValidationError("El campo tituloId es obligatorio.");
      }
      const entry = await this.listaEsperaService.anotarse(req.usuario, tituloId);
      res.status(201).json(entry);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  mias = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const entries = await this.listaEsperaService.listarMisListas(req.usuario.id);
      res.status(200).json(entries);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  confirmar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const esperaId = Number(req.params.esperaId);
      if (!Number.isInteger(esperaId) || esperaId <= 0) {
        throw new ValidationError("Identificador de lista de espera inválido.");
      }
      const reserva = await this.listaEsperaService.confirmarTurno(req.usuario, esperaId);
      res.status(201).json(reserva);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  rechazar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const esperaId = Number(req.params.esperaId);
      if (!Number.isInteger(esperaId) || esperaId <= 0) {
        throw new ValidationError("Identificador de lista de espera inválido.");
      }
      const updated = await this.listaEsperaService.rechazarTurno(req.usuario, esperaId);
      res.status(200).json(updated);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
