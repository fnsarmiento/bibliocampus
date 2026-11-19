import type { NextFunction, Request, Response } from "express";
import { handleControllerError, ForbiddenError, UnauthorizedError } from "../domain/errors.js";
import type { UsuarioPublico, UsuarioService } from "../service/UsuarioService.js";

export interface AuthenticatedRequest extends Request {
  usuario?: UsuarioPublico;
}

export function crearAutenticar(usuarioService: UsuarioService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header("authorization") || "";
      if (!header.startsWith("Bearer ")) {
        throw new UnauthorizedError();
      }
      const token = header.slice("Bearer ".length).trim();
      req.usuario = await usuarioService.autenticarToken(token);
      next();
    } catch (err) {
      handleControllerError(res, err);
    }
  };
}

export function soloBibliotecario(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.usuario) {
    handleControllerError(res, new UnauthorizedError());
    return;
  }
  if (req.usuario.rol !== "Bibliotecario") {
    handleControllerError(res, new ForbiddenError("Solo el bibliotecario puede realizar esta acción."));
    return;
  }
  next();
}
