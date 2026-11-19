import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-06 — Registro, sesión Bearer, middlewares y cambio de rol", () => {
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
    return { app, db };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("POST /usuarios registra Alumno sin devolver contraseña/hash y rechaza email repetido (409) o faltante (400)", async () => {
    const { app, db } = await setupApp();

    const ok = await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "secreta123",
    });

    expect(ok.status).toBe(201);
    expect(ok.body.rol).toBe("Alumno");
    expect(ok.body.email).toBe("ana@test.com");
    expect(ok.body.contrasena).toBeUndefined();
    expect(ok.body.contrasenaHash).toBeUndefined();
    expect(ok.body.contrasena_hash).toBeUndefined();

    const enBase = await db.execute({
      sql: "SELECT contrasena_hash FROM usuario WHERE email = ?",
      args: ["ana@test.com"],
    });
    expect(String(enBase.rows[0].contrasena_hash)).not.toBe("secreta123");

    const dup = await request(app).post("/usuarios").send({
      nombre: "Otra Ana",
      email: "ANA@test.com",
      contrasena: "otra",
    });
    expect(dup.status).toBe(409);

    const faltaEmail = await request(app).post("/usuarios").send({
      nombre: "Sin Email",
      contrasena: "123",
    });
    expect(faltaEmail.status).toBe(400);
  });

  it("POST /entrada entrega Bearer token y distingue 401 sin token vs 403 sin rol Bibliotecario", async () => {
    const { app } = await setupApp();

    await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "secreta123",
    });

    const badLogin = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "mal",
    });
    expect(badLogin.status).toBe(401);

    const sinToken = await request(app).get("/yo");
    expect(sinToken.status).toBe(401);

    const loginAna = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "secreta123",
    });
    expect(loginAna.status).toBe(200);
    expect(typeof loginAna.body.token).toBe("string");

    const yoAna = await request(app)
      .get("/yo")
      .set("Authorization", `Bearer ${loginAna.body.token}`);
    expect(yoAna.status).toBe(200);
    expect(yoAna.body.rol).toBe("Alumno");
    expect(yoAna.body.cupoMaximo).toBe(2);

    const listaComoAlumno = await request(app)
      .get("/usuarios")
      .set("Authorization", `Bearer ${loginAna.body.token}`);
    expect(listaComoAlumno.status).toBe(403);
  });

  it("Bibliotecario puede listar usuarios y cambiar el rol de Alumno a Docente (cupo 5)", async () => {
    const { app } = await setupApp();

    const reg = await request(app).post("/usuarios").send({
      nombre: "Luis",
      email: "luis@test.com",
      contrasena: "clave",
    });

    const loginAdmin = await request(app).post("/entrada").send({
      email: "admin@bibliocampus.local",
      contrasena: "AdminPassword123!",
    });
    expect(loginAdmin.status).toBe(200);

    const listado = await request(app)
      .get("/usuarios")
      .set("Authorization", `Bearer ${loginAdmin.body.token}`);
    expect(listado.status).toBe(200);
    expect(listado.body.length).toBe(2);

    const cambio = await request(app)
      .patch(`/usuarios/${reg.body.id}/rol`)
      .set("Authorization", `Bearer ${loginAdmin.body.token}`)
      .send({ rol: "Docente" });
    expect(cambio.status).toBe(200);
    expect(cambio.body.rol).toBe("Docente");

    const loginLuis = await request(app).post("/entrada").send({
      email: "luis@test.com",
      contrasena: "clave",
    });
    const yoLuis = await request(app)
      .get("/yo")
      .set("Authorization", `Bearer ${loginLuis.body.token}`);
    expect(yoLuis.body.cupoMaximo).toBe(5);
  });
});
