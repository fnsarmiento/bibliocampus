import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

const alumnoUser = {
  id: 2,
  nombre: "Bruno Diaz",
  email: "bruno@campus.edu",
  rol: "Alumno" as const,
  cupoMaximo: 2,
  suspendidoHasta: null,
  creadoEn: "2026-10-19T10:00:00Z",
};

const adminUser = {
  id: 1,
  nombre: "Admin Biblio",
  email: "admin@bibliocampus.local",
  rol: "Bibliotecario" as const,
  cupoMaximo: 5,
  suspendidoHasta: null,
  creadoEn: "2026-10-19T10:00:00Z",
};

const titulosMock = [
  {
    id: 1,
    nombre: "Patterns",
    autor: "GoF",
    isbn: null,
    creadoEn: "2026-10-19T10:00:00Z",
    prestablesTotales: 1,
    prestablesDisponibles: 1,
    ejemplaresSoloEnSala: 0,
    ejemplares: [{ id: 10, tituloId: 1, codigo: "PAT-1", soloEnSala: false, estado: "disponible" }],
  },
];

describe("T-17 — Panel de Bibliotecario", () => {
  it("oculta el Panel Bibliotecario a usuarios con rol Alumno", async () => {
    localStorage.setItem("bibliocampus_token", "tok-alumno");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/yo")) {
        return new Response(JSON.stringify(alumnoUser), { status: 200 });
      }
      if (url.endsWith("/titulos")) {
        return new Response(JSON.stringify(titulosMock), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<App />);
    await screen.findByText("Bruno Diaz");
    expect(screen.queryByRole("button", { name: /Panel Bibliotecario/i })).not.toBeInTheDocument();
  });

  it("permite al Bibliotecario registrar retiro, devolución, reparación, feriado y cambio de rol", async () => {
    const user = userEvent.setup();
    localStorage.setItem("bibliocampus_token", "tok-admin");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/yo")) {
        return new Response(JSON.stringify(adminUser), { status: 200 });
      }
      if (url.endsWith("/titulos") && method === "GET") {
        return new Response(JSON.stringify(titulosMock), { status: 200 });
      }
      if (url.endsWith("/reservas") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: 30,
              usuarioId: 2,
              usuarioEmail: "bruno@campus.edu",
              tituloId: 1,
              tituloNombre: "Patterns",
              ejemplarId: 10,
              ejemplarCodigo: "PAT-1",
              estado: "confirmada",
              creadaEn: "2026-10-19T10:00:00Z",
              venceRetiroEn: "2026-10-21T10:00:00Z",
              corrimientoInformado: null,
              desactivadaMotivo: null,
              ordenColaEn: null,
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith("/prestamos") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: 40,
              reservaId: 29,
              usuarioId: 2,
              usuarioNombre: "Bruno Diaz",
              usuarioEmail: "bruno@campus.edu",
              ejemplarId: 11,
              ejemplarCodigo: "PAT-2",
              tituloId: 1,
              tituloNombre: "Patterns",
              retiradoEn: "2026-10-10T10:00:00Z",
              venceEn: "2026-10-17T10:00:00Z",
              renovado: false,
              devueltoEn: null,
              diasAtraso: 0,
              vencido: true,
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith("/feriados") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith("/usuarios") && method === "GET") {
        return new Response(JSON.stringify([adminUser, alumnoUser]), { status: 200 });
      }
      if (url.endsWith("/prestamos/retiro") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 41,
            reservaId: 30,
            usuarioId: 2,
            ejemplarId: 10,
            ejemplarCodigo: "PAT-1",
            retiradoEn: "2026-10-19T12:00:00Z",
            venceEn: "2026-10-26T12:00:00Z",
            renovado: false,
            devueltoEn: null,
            diasAtraso: 0,
          }),
          { status: 201 }
        );
      }
      if (url.endsWith("/prestamos/40/devolucion") && method === "POST") {
        return new Response(
          JSON.stringify({
            prestamo: { id: 40, devueltoEn: "2026-10-20T10:00:00Z" },
            diasAtraso: 3,
            diasSuspension: 3,
            suspendidoHasta: "2026-10-23T10:00:00Z",
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/ejemplares/10/reparacion") && method === "PATCH") {
        return new Response(
          JSON.stringify({
            ejemplar: { id: 10, tituloId: 1, codigo: "PAT-1", soloEnSala: false, estado: "en_reparacion" },
            accion: "sin_reserva",
            reservaAfectada: null,
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/feriados") && method === "POST") {
        return new Response(
          JSON.stringify({ fecha: "2026-12-25", descripcion: "Navidad" }),
          { status: 201 }
        );
      }
      if (url.endsWith("/usuarios/2/rol") && method === "PATCH") {
        return new Response(
          JSON.stringify({ ...alumnoUser, rol: "Docente", cupoMaximo: 5 }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    await screen.findByText("Admin Biblio");

    await user.click(screen.getByRole("button", { name: /Panel Bibliotecario/i }));
    await screen.findByRole("button", { name: /Registrar retiro/i });

    await user.click(screen.getByRole("button", { name: /Registrar retiro/i }));
    await waitFor(() => {
      expect(screen.getByText(/Retiro registrado/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Registrar devolución/i }));
    await waitFor(() => {
      expect(screen.getByText(/Devolución registrada/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Enviar a reparación/i }));
    await waitFor(() => {
      expect(screen.getByText(/Ejemplar PAT-1 enviado a reparación/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Fecha del feriado/i), "2026-12-25");
    await user.type(screen.getByLabelText(/Descripción del feriado/i), "Navidad");
    await user.click(screen.getByRole("button", { name: /Cargar feriado/i }));
    await waitFor(() => {
      expect(screen.getByText(/Feriado 2026-12-25 guardado/i)).toBeInTheDocument();
    });

    const rolSelect = screen.getByLabelText(/Rol de Bruno Diaz/i);
    await user.selectOptions(rolSelect, "Docente");
    await user.click(screen.getByRole("button", { name: /Guardar rol/i }));
    await waitFor(() => {
      expect(screen.getByText(/Rol de Bruno Diaz actualizado a Docente/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
