import type { Response } from "express";
import { handleControllerError, UnauthorizedError, ValidationError } from "../domain/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { PrestamoService } from "../service/PrestamoService.js";

export class PrestamoController {
  constructor(private readonly prestamoService: PrestamoService) {}

  listar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const lista = await this.prestamoService.listarPrestamos(req.usuario);
      res.status(200).json(lista);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  retiro = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const reservaId = Number(body.reservaId);
      if (!Number.isInteger(reservaId) || reservaId <= 0) {
        throw new ValidationError("El campo reservaId es obligatorio.");
      }
      const prestamo = await this.prestamoService.registrarRetiro(reservaId);
      res.status(201).json(prestamo);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  devolucion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const prestamoId = Number(req.params.prestamoId);
      if (!Number.isInteger(prestamoId) || prestamoId <= 0) {
        throw new ValidationError("Identificador de préstamo inválido.");
      }
      const resultado = await this.prestamoService.registrarDevolucion(prestamoId);
      res.status(200).json(resultado);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
