import type { Response } from "express";

export class DomainError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "No autenticado.") {
    super(401, message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "No tenés permisos para esta acción.") {
    super(403, message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(409, message);
  }
}

export function handleControllerError(res: Response, err: unknown): void {
  if (err instanceof DomainError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
}
