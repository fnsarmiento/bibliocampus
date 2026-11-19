import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

const mockTitulos = [
  {
    id: 1,
    nombre: "Clean Code",
    autor: "Robert C. Martin",
    isbn: "9780132350884",
    creadoEn: "2026-10-19T10:00:00Z",
    prestablesTotales: 2,
    prestablesDisponibles: 1,
    ejemplaresSoloEnSala: 1,
    ejemplares: [
      { id: 10, tituloId: 1, codigo: "CC-1", soloEnSala: false, estado: "disponible" },
      { id: 11, tituloId: 1, codigo: "CC-2", soloEnSala: false, estado: "prestado" },
      { id: 12, tituloId: 1, codigo: "CC-SALA", soloEnSala: true, estado: "disponible" },
    ],
  },
];

describe("T-15 — Setup frontend, autenticación y catálogo público", () => {
  it("muestra el catálogo público diferenciando prestables disponibles y ejemplares solo en sala (RN-01, RN-02, HU-02)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockTitulos), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<App />);

    expect(await screen.findByText("Clean Code")).toBeInTheDocument();
    expect(screen.getByText(/Robert C\. Martin/)).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 prestables disponibles/i)).toBeInTheDocument();
    expect(screen.getByText(/1 solo en sala/i)).toBeInTheDocument();
  });

  it("permite registrar un usuario como Alumno e iniciar sesión mostrando su perfil y cerrar sesión (HU-01)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/titulos") && method === "GET") {
        return new Response(JSON.stringify(mockTitulos), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/usuarios") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 7,
            nombre: "Lucia Perez",
            email: "lucia@campus.edu",
            rol: "Alumno",
            cupoMaximo: 2,
            suspendidoHasta: null,
            creadoEn: "2026-10-19T10:00:00Z",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/entrada") && method === "POST") {
        return new Response(
          JSON.stringify({
            token: "tok-123",
            usuario: {
              id: 7,
              nombre: "Lucia Perez",
              email: "lucia@campus.edu",
              rol: "Alumno",
              cupoMaximo: 2,
              suspendidoHasta: null,
              creadoEn: "2026-10-19T10:00:00Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(<App />);
    await screen.findByText("Clean Code");

    await user.click(screen.getByRole("button", { name: /Ingresar \/ Registrarse/i }));
    await user.click(screen.getByRole("button", { name: /^Crear cuenta$/i }));

    await user.type(screen.getByLabelText(/Nombre/i), "Lucia Perez");
    await user.type(screen.getByLabelText(/Email/i), "lucia@campus.edu");
    await user.type(screen.getByLabelText(/Contraseña/i), "secreto123");
    await user.click(screen.getByRole("button", { name: /Registrarme/i }));

    expect(await screen.findByText(/Cuenta creada como Alumno/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Iniciar sesión$/i }));
    await user.clear(screen.getByLabelText(/Email/i));
    await user.type(screen.getByLabelText(/Email/i), "lucia@campus.edu");
    await user.clear(screen.getByLabelText(/Contraseña/i));
    await user.type(screen.getByLabelText(/Contraseña/i), "secreto123");
    await user.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Lucia Perez/i)).toBeInTheDocument();
      expect(screen.getByText(/Alumno/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/i }));
    expect(screen.getByRole("button", { name: /Ingresar \/ Registrarse/i })).toBeInTheDocument();
  });
});
