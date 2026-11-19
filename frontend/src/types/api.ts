export type RolUsuario = "Alumno" | "Docente" | "Bibliotecario";
export type EstadoEjemplar = "disponible" | "reservado" | "prestado" | "en_reparacion";
export type EstadoReserva = "confirmada" | "desactivada" | "retirada" | "vencida" | "cancelada";
export type EstadoListaEspera = "esperando" | "avisado" | "confirmado" | "expirado" | "cancelado";

export interface UsuarioPublico {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
  cupoMaximo: number;
  suspendidoHasta: string | null;
  creadoEn: string;
}

export interface EjemplarRecord {
  id: number;
  tituloId: number;
  codigo: string;
  soloEnSala: boolean;
  estado: EstadoEjemplar;
}

export interface TituloConEjemplares {
  id: number;
  nombre: string;
  autor: string;
  isbn: string | null;
  creadoEn: string;
  prestablesTotales: number;
  prestablesDisponibles: number;
  ejemplaresSoloEnSala: number;
  ejemplares: EjemplarRecord[];
}

export interface ReservaRecord {
  id: number;
  usuarioId: number;
  tituloId: number;
  ejemplarId: number | null;
  estado: EstadoReserva;
  creadaEn: string;
  venceRetiroEn: string | null;
  corrimientoInformado: string | null;
  desactivadaMotivo: "suspension" | "reparacion" | null;
  ordenColaEn: string | null;
  ejemplarCodigo?: string | null;
  tituloNombre?: string;
  usuarioEmail?: string;
}

export interface CupoPenalizadoRecord {
  id: number;
  usuarioId: number;
  reservaId: number;
  penalizadoHasta: string;
  creadoEn: string;
}

export interface MisReservasResponse {
  reservas: ReservaRecord[];
  penalidadesVigentes: CupoPenalizadoRecord[];
  cupoOcupado: number;
}

export interface PrestamoRecord {
  id: number;
  reservaId: number;
  usuarioId: number;
  ejemplarId: number;
  retiradoEn: string;
  venceEn: string;
  renovado: boolean;
  devueltoEn: string | null;
  diasAtraso: number;
  vencido?: boolean;
  corrimientoInformado?: string | null;
  usuarioNombre?: string;
  usuarioEmail?: string;
  ejemplarCodigo?: string;
  tituloId?: number;
  tituloNombre?: string;
}

export interface ListaEsperaRecord {
  id: number;
  tituloId: number;
  tituloNombre?: string;
  usuarioId: number;
  reservaDesactivadaId: number | null;
  estado: EstadoListaEspera;
  ordenEn: string;
  avisadoEn: string | null;
  confirmarHasta: string | null;
}

export interface FeriadoRecord {
  fecha: string;
  descripcion: string;
}

export interface ResultadoDevolucion {
  prestamo: PrestamoRecord;
  diasAtraso: number;
  diasSuspension: number;
  suspendidoHasta: string | null;
}

export interface ResultadoReparacion {
  ejemplar: EjemplarRecord;
  accion: "disponible" | "sin_reserva" | "reasignada" | "desactivada";
  reservaAfectada: ReservaRecord | null;
}
