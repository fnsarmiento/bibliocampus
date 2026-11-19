import type {
  EjemplarRecord,
  FeriadoRecord,
  ListaEsperaRecord,
  MisReservasResponse,
  PrestamoRecord,
  ReservaRecord,
  ResultadoDevolucion,
  ResultadoReparacion,
  RolUsuario,
  TituloConEjemplares,
  UsuarioPublico,
} from "../types/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/+$/, "");

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }

  if (!res.ok) {
    const errObj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<
      string,
      unknown
    >;
    const msg =
      typeof errObj.error === "string"
        ? errObj.error
        : typeof errObj.message === "string"
          ? errObj.message
          : `Error HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }

  return parsed as T;
}

export const api = {
  registrarUsuario(input: { nombre: string; email: string; contrasena: string }) {
    return requestJson<UsuarioPublico>("/usuarios", { method: "POST", body: input });
  },

  entrar(input: { email: string; contrasena: string }) {
    return requestJson<{ token: string; usuario: UsuarioPublico }>("/entrada", {
      method: "POST",
      body: input,
    });
  },

  yo(token: string) {
    return requestJson<UsuarioPublico>("/yo", { token });
  },

  listarTitulos() {
    return requestJson<TituloConEjemplares[]>("/titulos");
  },

  crearTitulo(token: string, input: { nombre: string; autor: string; isbn?: string }) {
    return requestJson<TituloConEjemplares>("/titulos", {
      method: "POST",
      token,
      body: input,
    });
  },

  agregarEjemplar(
    token: string,
    tituloId: number,
    input: { codigo: string; soloEnSala: boolean }
  ) {
    return requestJson<EjemplarRecord>(`/titulos/${tituloId}/ejemplares`, {
      method: "POST",
      token,
      body: input,
    });
  },

  cambiarReparacion(token: string, ejemplarId: number, enReparacion: boolean) {
    return requestJson<ResultadoReparacion>(`/ejemplares/${ejemplarId}/reparacion`, {
      method: "PATCH",
      token,
      body: { enReparacion },
    });
  },

  crearReserva(token: string, tituloId: number) {
    return requestJson<ReservaRecord>("/reservas", {
      method: "POST",
      token,
      body: { tituloId },
    });
  },

  misReservas(token: string) {
    return requestJson<MisReservasResponse>("/mis-reservas", { token });
  },

  todasReservas(token: string) {
    return requestJson<ReservaRecord[]>("/reservas", { token });
  },

  cancelarReserva(token: string, reservaId: number) {
    return requestJson<ReservaRecord>(`/reservas/${reservaId}`, {
      method: "DELETE",
      token,
    });
  },

  reactivarReserva(token: string, reservaId: number) {
    return requestJson<ReservaRecord>(`/reservas/${reservaId}/reactivar`, {
      method: "POST",
      token,
    });
  },

  anotarseListaEspera(token: string, tituloId: number) {
    return requestJson<ListaEsperaRecord>("/listas-espera", {
      method: "POST",
      token,
      body: { tituloId },
    });
  },

  misListasEspera(token: string) {
    return requestJson<ListaEsperaRecord[]>("/mis-listas-espera", { token });
  },

  confirmarListaEspera(token: string, esperaId: number) {
    return requestJson<ReservaRecord>(`/listas-espera/${esperaId}/confirmar`, {
      method: "POST",
      token,
    });
  },

  rechazarListaEspera(token: string, esperaId: number) {
    return requestJson<ListaEsperaRecord>(`/listas-espera/${esperaId}/rechazar`, {
      method: "POST",
      token,
    });
  },

  listarPrestamos(token: string) {
    return requestJson<PrestamoRecord[]>("/prestamos", { token });
  },

  registrarRetiro(token: string, reservaId: number) {
    return requestJson<PrestamoRecord>("/prestamos/retiro", {
      method: "POST",
      token,
      body: { reservaId },
    });
  },

  registrarDevolucion(token: string, prestamoId: number) {
    return requestJson<ResultadoDevolucion>(`/prestamos/${prestamoId}/devolucion`, {
      method: "POST",
      token,
    });
  },

  renovarPrestamo(token: string, prestamoId: number) {
    return requestJson<PrestamoRecord>(`/prestamos/${prestamoId}/renovar`, {
      method: "POST",
      token,
    });
  },

  listarFeriados() {
    return requestJson<FeriadoRecord[]>("/feriados");
  },

  cargarFeriado(token: string, input: { fecha: string; descripcion: string }) {
    return requestJson<FeriadoRecord>("/feriados", {
      method: "POST",
      token,
      body: input,
    });
  },

  listarUsuarios(token: string) {
    return requestJson<UsuarioPublico[]>("/usuarios", { token });
  },

  cambiarRolUsuario(token: string, usuarioId: number, rol: RolUsuario) {
    return requestJson<UsuarioPublico>(`/usuarios/${usuarioId}/rol`, {
      method: "PATCH",
      token,
      body: { rol },
    });
  },
};
