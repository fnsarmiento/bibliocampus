import type { Client } from "@libsql/client";
import type { Reloj } from "../components/Reloj.js";
import { CatalogoRepository } from "../repository/CatalogoRepository.js";
import { UsuarioRepository } from "../repository/UsuarioRepository.js";
import { CatalogoService } from "../service/CatalogoService.js";
import { UsuarioService } from "../service/UsuarioService.js";

export interface InitialDataConfig {
  adminEmail: string;
  adminPassword: string;
}

const CATALOGO_INICIAL: Array<{
  nombre: string;
  autor: string;
  isbn: string;
  ejemplares: Array<{ codigo: string; soloEnSala: boolean }>;
}> = [
  {
    nombre: "Clean Code",
    autor: "Robert C. Martin",
    isbn: "9780132350884",
    ejemplares: [
      { codigo: "CC-01", soloEnSala: false },
      { codigo: "CC-02", soloEnSala: false },
      { codigo: "CC-SALA", soloEnSala: true },
    ],
  },
  {
    nombre: "Designing Data-Intensive Applications",
    autor: "Martin Kleppmann",
    isbn: "9781449373320",
    ejemplares: [
      { codigo: "DDIA-01", soloEnSala: false },
      { codigo: "DDIA-02", soloEnSala: false },
    ],
  },
  {
    nombre: "Refactoring",
    autor: "Martin Fowler",
    isbn: "9780134757599",
    ejemplares: [
      { codigo: "REF-01", soloEnSala: false },
      { codigo: "REF-SALA", soloEnSala: true },
    ],
  },
  {
    nombre: "Introducción a los Algoritmos",
    autor: "Thomas H. Cormen",
    isbn: "9780262046305",
    ejemplares: [
      { codigo: "CLRS-01", soloEnSala: false },
      { codigo: "CLRS-02", soloEnSala: false },
      { codigo: "CLRS-SALA", soloEnSala: true },
    ],
  },
  {
    nombre: "The Pragmatic Programmer",
    autor: "Andrew Hunt y David Thomas",
    isbn: "9780135957059",
    ejemplares: [
      { codigo: "PRAG-01", soloEnSala: false },
      { codigo: "PRAG-02", soloEnSala: false },
    ],
  },
  {
    nombre: "Eloquent JavaScript",
    autor: "Marijn Haverbeke",
    isbn: "9781593279509",
    ejemplares: [
      { codigo: "EJS-01", soloEnSala: false },
      { codigo: "EJS-02", soloEnSala: false },
    ],
  },
  {
    nombre: "Sistemas Operativos Modernos",
    autor: "Andrew S. Tanenbaum",
    isbn: "9786073203098",
    ejemplares: [
      { codigo: "SO-01", soloEnSala: false },
      { codigo: "SO-SALA", soloEnSala: true },
    ],
  },
  {
    nombre: "Rayuela",
    autor: "Julio Cortázar",
    isbn: "9788420471891",
    ejemplares: [
      { codigo: "RAY-01", soloEnSala: false },
      { codigo: "RAY-02", soloEnSala: false },
    ],
  },
];

/**
 * Orquesta la carga inicial delegando toda lógica de dominio a UsuarioService (RN-06).
 */
export async function loadInitialData(
  db: Client,
  reloj: Reloj,
  config: InitialDataConfig
): Promise<void> {
  const usuarioRepo = new UsuarioRepository(db);
  const usuarioService = new UsuarioService(usuarioRepo, reloj);
  await usuarioService.asegurarBibliotecarioInicial(config.adminEmail, config.adminPassword);
}

/**
 * Siembra un catálogo inicial de libros y ejemplares si la base aún no tiene títulos cargados.
 */
export async function seedCatalogoInicial(db: Client, reloj: Reloj): Promise<void> {
  const catalogoRepo = new CatalogoRepository(db);
  const existentes = await catalogoRepo.listTitulos();
  if (existentes.length > 0) {
    return;
  }

  const catalogoService = new CatalogoService(catalogoRepo, reloj);
  for (const libro of CATALOGO_INICIAL) {
    const titulo = await catalogoService.crearTitulo({
      nombre: libro.nombre,
      autor: libro.autor,
      isbn: libro.isbn,
    });
    for (const ej of libro.ejemplares) {
      await catalogoService.agregarEjemplar(titulo.id, {
        codigo: ej.codigo,
        soloEnSala: ej.soloEnSala,
      });
    }
  }
}
