import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-12 — Renovación de préstamo activo", () => {
  const clients: Client[] = [];

  async function setupEscenario(fecha = "2026-10-19T10:00:00-03:00") {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);
    const reloj = new FixedReloj(fecha);
    const correo = new FakeCorreo(reloj);
    await loadInitialData(db, reloj, {
      adminEmail: "admin@bibliocampus.local",
      adminPassword: "AdminPassword123!",
    });
    const app = createApp(undefined, { db, reloj, correo });

    const loginAdmin = await request(app).post("/entrada").send({
      email: "admin@bibliocampus.local",
      contrasena: "AdminPassword123!",
    });
    const adminToken = loginAdmin.body.token as string;

    await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "clave",
    });
    const loginAna = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "clave",
    });

    const t = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Patterns of Enterprise", autor: "Martin Fowler" });
    await request(app)
      .post(`/titulos/${t.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "PE-1", soloEnSala: false });

    const res = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${loginAna.body.token}`)
      .send({ tituloId: t.body.id });
    const prestamo = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: res.body.id });

    return {
      app,
      db,
      reloj,
      adminToken,
      anaToken: loginAna.body.token as string,
      tituloId: t.body.id as number,
      prestamoId: prestamo.body.id as number,
    };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("permite renovar 1 sola vez por 5 días hábiles antes del vencimiento y rechaza una segunda renovación (RN-15, RN-16)", async () => {
    // Préstamo alumno del lun 19/10 vence lun 26/10 10:00. +5 días = sábado 31/10 -> salta al lunes 02/11
    const { app, reloj, anaToken, prestamoId } = await setupEscenario("2026-10-19T10:00:00-03:00");

    reloj.advanceTo("2026-10-25T10:00:00-03:00");
    const ren1 = await request(app)
      .post(`/prestamos/${prestamoId}/renovar`)
      .set("Authorization", `Bearer ${anaToken}`);
    expect(ren1.status).toBe(200);
    expect(ren1.body.renovado).toBe(true);
    expect(ren1.body.venceEn.startsWith("2026-11-02")).toBe(true);
    expect(ren1.body.corrimientoInformado).toBeTruthy();

    const ren2 = await request(app)
      .post(`/prestamos/${prestamoId}/renovar`)
      .set("Authorization", `Bearer ${anaToken}`);
    expect(ren2.status).toBe(409);
  });

  it("rechaza renovar si hay alguien esperando en lista de espera o si el préstamo ya venció (RN-16, RN-17)", async () => {
    const { app, db, reloj, anaToken, tituloId, prestamoId } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );

    // Insertamos usuario en lista de espera del título
    await db.execute({
      sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, 'Alumno', ?)",
      args: ["Luis", "luis@test.com", "h", "2026-10-19T10:00:00Z"],
    });
    await db.execute({
      sql: "INSERT INTO lista_espera (titulo_id, usuario_id, estado, orden_en) VALUES (?, 3, 'esperando', ?)",
      args: [tituloId, "2026-10-20T10:00:00Z"],
    });

    const conEspera = await request(app)
      .post(`/prestamos/${prestamoId}/renovar`)
      .set("Authorization", `Bearer ${anaToken}`);
    expect(conEspera.status).toBe(409);

    // Quitamos la lista de espera pero vencemos el préstamo (27/10 > 26/10)
    await db.execute("DELETE FROM lista_espera");
    reloj.advanceTo("2026-10-27T10:01:00-03:00");

    const yaVencido = await request(app)
      .post(`/prestamos/${prestamoId}/renovar`)
      .set("Authorization", `Bearer ${anaToken}`);
    expect(yaVencido.status).toBe(409);
  });
});
