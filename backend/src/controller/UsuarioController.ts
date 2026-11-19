import type { Response } from "express";
import { handleControllerError, ValidationError } from "../domain/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { UsuarioService } from "../service/UsuarioService.js";

export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  registrar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const usuario = await this.usuarioService.registrar({
        nombre: body.nombre,
        email: body.email,
        contrasena: body.contrasena,
      });
      res.status(201).json(usuario);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  entrar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const sesion = await this.usuarioService.entrar({
        email: body.email,
        contrasena: body.contrasena,
      });
      res.status(200).json(sesion);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  yo = (req: AuthenticatedRequest, res: Response): void => {
    res.status(200).json(req.usuario);
  };

  listar = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const usuarios = await this.usuarioService.listarUsuarios();
      res.status(200).json(usuarios);
    } catch (err) {
      handleControllerError(res, err);
    }
  };

  cambiarRol = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const usuarioId = Number(req.params.usuarioId);
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        throw new ValidationError("Identificador de usuario inválido.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const actualizado = await this.usuarioService.cambiarRol(usuarioId, body.rol);
      res.status(200).json(actualizado);
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}
