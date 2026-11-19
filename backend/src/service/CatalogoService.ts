import type { Reloj } from "../components/Reloj.js";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  CatalogoRepository,
  EjemplarRecord,
  TituloRecord,
} from "../repository/CatalogoRepository.js";

export interface TituloConEjemplares extends TituloRecord {
  prestablesTotales: number;
  prestablesDisponibles: number;
  ejemplaresSoloEnSala: number;
  ejemplares: EjemplarRecord[];
}

export class CatalogoService {
  constructor(
    private readonly catalogoRepo: CatalogoRepository,
    private readonly reloj: Reloj
  ) {}

  async listarCatalogo(): Promise<TituloConEjemplares[]> {
    const [titulos, ejemplares] = await Promise.all([
      this.catalogoRepo.listTitulos(),
      this.catalogoRepo.listAllEjemplares(),
    ]);

    const porTitulo = new Map<number, EjemplarRecord[]>();
    for (const ej of ejemplares) {
      const lista = porTitulo.get(ej.tituloId) ?? [];
      lista.push(ej);
      porTitulo.set(ej.tituloId, lista);
    }

    return titulos.map((t) => {
      const lista = porTitulo.get(t.id) ?? [];
      const prestables = lista.filter((e) => !e.soloEnSala);
      const prestablesDisponibles = prestables.filter((e) => e.estado === "disponible").length;
      const ejemplaresSoloEnSala = lista.filter((e) => e.soloEnSala).length;

      return {
        ...t,
        prestablesTotales: prestables.length,
        prestablesDisponibles,
        ejemplaresSoloEnSala,
        ejemplares: lista,
      };
    });
  }

  async crearTitulo(input: {
    nombre?: unknown;
    autor?: unknown;
    isbn?: unknown;
  }): Promise<TituloRecord> {
    const nombre = typeof input.nombre === "string" ? input.nombre.trim() : "";
    const autor = typeof input.autor === "string" ? input.autor.trim() : "";
    const isbn = typeof input.isbn === "string" && input.isbn.trim() ? input.isbn.trim() : null;

    if (!nombre || !autor) {
      throw new ValidationError("Los campos nombre y autor son obligatorios.");
    }

    return this.catalogoRepo.createTitulo({
      nombre,
      autor,
      isbn,
      creadoEn: this.reloj.now().toISOString(),
    });
  }

  async agregarEjemplar(
    tituloId: number,
    input: { codigo?: unknown; soloEnSala?: unknown }
  ): Promise<EjemplarRecord> {
    const titulo = await this.catalogoRepo.findTituloById(tituloId);
    if (!titulo) {
      throw new NotFoundError("Título no encontrado.");
    }

    const codigo = typeof input.codigo === "string" ? input.codigo.trim() : "";
    if (!codigo) {
      throw new ValidationError("El código del ejemplar es obligatorio.");
    }

    const existing = await this.catalogoRepo.findEjemplarByCodigo(codigo);
    if (existing) {
      throw new ConflictError("Ya existe un ejemplar con ese código.");
    }

    return this.catalogoRepo.createEjemplar({
      tituloId,
      codigo,
      soloEnSala: Boolean(input.soloEnSala),
    });
  }
}
