import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-07 — Catálogo de títulos y ejemplares (prestables y solo en sala)", () => {
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

  it("solo el Bibliotecario puede crear títulos y ejemplares (403 si intenta Alumno)", async () => {
    const { app } = await setupApp();

    await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "clave",
    });
    const loginAlumno = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "clave",
    });

    const prohibidoTitulo = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${loginAlumno.body.token}`)
      .send({ nombre: "Clean Code", autor: "Robert Martin" });
    expect(prohibidoTitulo.status).toBe(403);

    const loginAdmin = await request(app).post("/entrada").send({
      email: "admin@bibliocampus.local",
      contrasena: "AdminPassword123!",
    });

    const tituloRes = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${loginAdmin.body.token}`)
      .send({ nombre: "Clean Code", autor: "Robert Martin", isbn: "9780132350884" });
    expect(tituloRes.status).toBe(201);
    expect(tituloRes.body.nombre).toBe("Clean Code");

    const prohibidoEjemplar = await request(app)
      .post(`/titulos/${tituloRes.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${loginAlumno.body.token}`)
      .send({ codigo: "CC-01", soloEnSala: false });
    expect(prohibidoEjemplar.status).toBe(403);
  });

  it("GET /titulos público informa prestables disponibles y ejemplares solo en sala (RN-01, RN-02, RN-03)", async () => {
    const { app } = await setupApp();

    const loginAdmin = await request(app).post("/entrada").send({
      email: "admin@bibliocampus.local",
      contrasena: "AdminPassword123!",
    });
    const token = loginAdmin.body.token;

    const titulo = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "Domain-Driven Design", autor: "Eric Evans" });

    const e1 = await request(app)
      .post(`/titulos/${titulo.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "DDD-01", soloEnSala: false });
    expect(e1.status).toBe(201);

    const e2 = await request(app)
      .post(`/titulos/${titulo.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "DDD-SALA", soloEnSala: true });
    expect(e2.status).toBe(201);

    const dup = await request(app)
      .post(`/titulos/${titulo.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "DDD-01", soloEnSala: false });
    expect(dup.status).toBe(409);

    const catalogo = await request(app).get("/titulos");
    expect(catalogo.status).toBe(200);
    expect(catalogo.body).toHaveLength(1);
    expect(catalogo.body[0].prestablesDisponibles).toBe(1);
    expect(catalogo.body[0].ejemplaresSoloEnSala).toBe(1);
    expect(catalogo.body[0].ejemplares).toHaveLength(2);
    expect(
      catalogo.body[0].ejemplares.find((e: { codigo: string }) => e.codigo === "DDD-SALA").soloEnSala
    ).toBe(true);
  });
});
