import { ValidationError } from "../domain/errors.js";
import type { FeriadoRecord, FeriadoRepository } from "../repository/FeriadoRepository.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class FeriadoService {
  constructor(private readonly feriadoRepo: FeriadoRepository) {}

  async listar(): Promise<FeriadoRecord[]> {
    return this.feriadoRepo.listAll();
  }

  async listarFechas(): Promise<string[]> {
    return this.feriadoRepo.listFechas();
  }

  async cargar(input: {
    fecha?: unknown;
    descripcion?: unknown;
  }): Promise<{ feriado: FeriadoRecord; creado: boolean }> {
    const fecha = typeof input.fecha === "string" ? input.fecha.trim() : "";
    const descripcion = typeof input.descripcion === "string" ? input.descripcion.trim() : "";

    if (!DATE_RE.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) {
      throw new ValidationError("La fecha del feriado debe tener formato YYYY-MM-DD válido.");
    }
    if (!descripcion) {
      throw new ValidationError("La descripción del feriado es obligatoria.");
    }

    return this.feriadoRepo.upsert(fecha, descripcion);
  }
}
