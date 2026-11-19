import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { CalendarioHabil } from "../src/components/CalendarioHabil.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-08 — Gestión de feriados", () => {
  const clients: Client[] = [];

  async function setupApp() {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);
    const reloj = new FixedReloj("2026-10-20T10:00:00-03:00");
    await loadInitialData(db, reloj, {
      adminEmail: "admin@bibliocampus.local",
      adminPassword: "AdminPassword123!",
    });
    const app = createApp(undefined, { db, reloj });
    return { app };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("un lector común recibe 403 al intentar cargar un feriado y Bibliotecario puede cargarlo de forma idempotente", async () => {
    const { app } = await setupApp();

    await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "clave",
    });
    const loginAna = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "clave",
    });

    const prohibido = await request(app)
      .post("/feriados")
      .set("Authorization", `Bearer ${loginAna.body.token}`)
      .send({ fecha: "2026-10-26", descripcion: "Día institucional" });
    expect(prohibido.status).toBe(403);

    const loginAdmin = await request(app).post("/entrada").send({
      email: "admin@bibliocampus.local",
      contrasena: "AdminPassword123!",
    });

    const f1 = await request(app)
      .post("/feriados")
      .set("Authorization", `Bearer ${loginAdmin.body.token}`)
      .send({ fecha: "2026-10-26", descripcion: "Día institucional" });
    expect(f1.status).toBe(201);

    // Idempotente en la misma fecha
    const f2 = await request(app)
      .post("/feriados")
      .set("Authorization", `Bearer ${loginAdmin.body.token}`)
      .send({ fecha: "2026-10-26", descripcion: "Día institucional actualizado" });
    expect(f2.status).toBe(200);

    const lista = await request(app).get("/feriados");
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].fecha).toBe("2026-10-26");

    const fechas = lista.body.map((f: { fecha: string }) => f.fecha);
    const calendario = new CalendarioHabil();
    const res = calendario.sumarHorasHabiles(new Date("2026-10-23T11:00:00-03:00"), 24, fechas);
    expect(calendario.toClubDay(res.fechaLimite)).toBe("2026-10-27");
  });
});
