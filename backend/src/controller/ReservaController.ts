import type { Response } from "express";
import { handleControllerError, UnauthorizedError, ValidationError } from "../domain/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { ListaEsperaService } from "../service/ListaEsperaService.js";
import type { ReservaService } from "../service/ReservaService.js";

export class ReservaController {
  constructor(
    private readonly reservaService: ReservaService,
    private readonly listaEsperaService?: ListaEsperaService
  ) {}

  crear = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const tituloId = Number(body.tituloId);
      if (!Number.isInteger(tituloId) || tituloId <= 0) {
        throw new ValidationError("El campo tituloId es obligatorio.");
      }
      const reserva = await this.reservaService.crearReserva(req.usuario, tituloId);
      res.status(201).json(reserva);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  mias = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const resultado = await this.reservaService.listarMisReservas(req.usuario.id);
      res.status(200).json(resultado);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  listarTodas = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const todas = await this.reservaService.listarTodas();
      res.status(200).json(todas);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  cancelar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const reservaId = Number(req.params.reservaId);
      if (!Number.isInteger(reservaId) || reservaId <= 0) {
        throw new ValidationError("Identificador de reserva inválido.");
      }
      const cancelada = await this.reservaService.cancelarReserva(req.usuario.id, reservaId);
      res.status(200).json(cancelada);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  reactivar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.usuario) {
        throw new UnauthorizedError();
      }
      const reservaId = Number(req.params.reservaId);
      if (!Number.isInteger(reservaId) || reservaId <= 0) {
        throw new ValidationError("Identificador de reserva inválido.");
      }
      if (!this.listaEsperaService) {
        throw new Error("ListaEsperaService no configurado.");
      }
      const reactivada = await this.listaEsperaService.confirmarPorReservaDesactivada(
        req.usuario,
        reservaId
      );
      res.status(200).json(reactivada);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
