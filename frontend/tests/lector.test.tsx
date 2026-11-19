import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

const lectorUser = {
  id: 2,
  nombre: "Bruno Diaz",
  email: "bruno@campus.edu",
  rol: "Alumno" as const,
  cupoMaximo: 2,
  suspendidoHasta: "2099-01-10T12:00:00Z",
  creadoEn: "2026-10-19T10:00:00Z",
};

const titulosMock = [
  {
    id: 1,
    nombre: "Refactoring",
    autor: "Martin Fowler",
    isbn: null,
    creadoEn: "2026-10-19T10:00:00Z",
    prestablesTotales: 1,
    prestablesDisponibles: 1,
    ejemplaresSoloEnSala: 0,
    ejemplares: [{ id: 10, tituloId: 1, codigo: "REF-1", soloEnSala: false, estado: "disponible" }],
  },
  {
    id: 2,
    nombre: "DDIA",
    autor: "Martin Kleppmann",
    isbn: null,
    creadoEn: "2026-10-19T10:00:00Z",
    prestablesTotales: 1,
    prestablesDisponibles: 0,
    ejemplaresSoloEnSala: 0,
    ejemplares: [{ id: 20, tituloId: 2, codigo: "DDIA-1", soloEnSala: false, estado: "prestado" }],
  },
];

describe("T-16 — Pantallas de lector (reservas, préstamos y lista de espera)", () => {
  it("permite reservar con aviso de corrimiento de 48 h hábiles y anotarse en lista de espera sin stock", async () => {
    const user = userEvent.setup();
    localStorage.setItem("bibliocampus_token", "tok-lector");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/yo")) {
        return new Response(JSON.stringify(lectorUser), { status: 200 });
      }
      if (url.endsWith("/titulos")) {
        return new Response(JSON.stringify(titulosMock), { status: 200 });
      }
      if (url.endsWith("/reservas") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 50,
            usuarioId: 2,
            tituloId: 1,
            ejemplarId: 10,
            ejemplarCodigo: "REF-1",
            tituloNombre: "Refactoring",
            estado: "confirmada",
            creadaEn: "2026-10-23T15:00:00-03:00",
            venceRetiroEn: "2026-10-27T15:00:00-03:00",
            corrimientoInformado: "Se saltaron sábado/domingo hasta 2026-10-27",
            desactivadaMotivo: null,
            ordenColaEn: null,
          }),
          { status: 201 }
        );
      }
      if (url.endsWith("/listas-espera") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 60,
            tituloId: 2,
            tituloNombre: "DDIA",
            usuarioId: 2,
            reservaDesactivadaId: null,
            estado: "esperando",
            ordenEn: "2026-10-23T15:05:00-03:00",
            avisadoEn: null,
            confirmarHasta: null,
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ reservas: [], penalidadesVigentes: [], cupoOcupado: 0 }), {
        status: 200,
      });
    });

    render(<App />);
    await screen.findByText("Refactoring");

    await user.click(screen.getByRole("button", { name: /^Reservar$/i }));
    expect(
      await screen.findByText(/Se saltaron sábado\/domingo hasta 2026-10-27/i)
    ).toBeInTheDocument();

    const btnEspera = screen.getByRole("button", { name: /Anotarme en lista de espera/i });
    expect(btnEspera).toHaveClass("btn-waitlist");
    await user.click(btnEspera);
    expect(await screen.findByText(/Anotado en la lista de espera/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("muestra cupo ocupado, penalidad, reservas desactivadas reactivables, avisos 24 h y renovación de préstamo", async () => {
    const user = userEvent.setup();
    localStorage.setItem("bibliocampus_token", "tok-lector");

    let reactivated = false;
    let renewed = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/yo")) {
        return new Response(JSON.stringify(lectorUser), { status: 200 });
      }
      if (url.endsWith("/titulos")) {
        return new Response(JSON.stringify(titulosMock), { status: 200 });
      }
      if (url.endsWith("/mis-reservas")) {
        return new Response(
          JSON.stringify({
            cupoOcupado: 1,
            penalidadesVigentes: [
              {
                id: 9,
                usuarioId: 2,
                reservaId: 40,
                penalizadoHasta: "2099-01-15T10:00:00Z",
                creadoEn: "2099-01-08T10:00:00Z",
              },
            ],
            reservas: [
              {
                id: 51,
                usuarioId: 2,
                tituloId: 2,
                ejemplarId: reactivated ? 20 : null,
                ejemplarCodigo: reactivated ? "DDIA-1" : null,
                tituloNombre: "DDIA",
                estado: reactivated ? "confirmada" : "desactivada",
                creadaEn: "2026-10-19T10:00:00Z",
                venceRetiroEn: reactivated ? "2026-10-28T10:00:00Z" : null,
                corrimientoInformado: null,
                desactivadaMotivo: reactivated ? null : "reparacion",
                ordenColaEn: "2026-10-19T10:00:00Z",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/mis-listas-espera")) {
        return new Response(
          JSON.stringify([
            {
              id: 71,
              tituloId: 2,
              tituloNombre: "DDIA",
              usuarioId: 2,
              reservaDesactivadaId: 51,
              estado: reactivated ? "confirmado" : "avisado",
              ordenEn: "2026-10-19T10:00:00Z",
              avisadoEn: "2026-10-26T10:00:00Z",
              confirmarHasta: "2026-10-27T10:00:00Z",
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith("/prestamos") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: 81,
              reservaId: 49,
              usuarioId: 2,
              ejemplarId: 10,
              ejemplarCodigo: "REF-1",
              tituloId: 1,
              tituloNombre: "Refactoring",
              retiradoEn: "2026-10-20T10:00:00Z",
              venceEn: renewed ? "2026-11-02T10:00:00Z" : "2026-10-27T10:00:00Z",
              renovado: renewed,
              devueltoEn: null,
              diasAtraso: 0,
              vencido: false,
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith("/reservas/51/reactivar") && method === "POST") {
        reactivated = true;
        return new Response(
          JSON.stringify({
            id: 51,
            usuarioId: 2,
            tituloId: 2,
            ejemplarId: 20,
            ejemplarCodigo: "DDIA-1",
            tituloNombre: "DDIA",
            estado: "confirmada",
            creadaEn: "2026-10-19T10:00:00Z",
            venceRetiroEn: "2026-10-28T10:00:00Z",
            corrimientoInformado: null,
            desactivadaMotivo: null,
            ordenColaEn: "2026-10-19T10:00:00Z",
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/prestamos/81/renovar") && method === "POST") {
        renewed = true;
        return new Response(
          JSON.stringify({
            id: 81,
            reservaId: 49,
            usuarioId: 2,
            ejemplarId: 10,
            ejemplarCodigo: "REF-1",
            tituloId: 1,
            tituloNombre: "Refactoring",
            retiradoEn: "2026-10-20T10:00:00Z",
            venceEn: "2026-11-02T10:00:00Z",
            renovado: true,
            devueltoEn: null,
            diasAtraso: 0,
            corrimientoInformado: null,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    await screen.findByText("Bruno Diaz");

    await user.click(screen.getByRole("button", { name: /Mis reservas y préstamos/i }));

    expect(await screen.findByText(/Cupo ocupado:\s*1\s*\/\s*2/i)).toBeInTheDocument();
    expect(screen.getByText(/Suspendido hasta/i)).toBeInTheDocument();
    expect(screen.getByText(/1 cupo\(s\) penalizado/i)).toBeInTheDocument();
    expect(screen.getByText(/desactivada/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Reactivar$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Reserva reactivada/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Renovar préstamo/i }));
    await waitFor(() => {
      expect(screen.getByText(/Préstamo renovado/i)).toBeInTheDocument();
    });
  });
});
