import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-10 — Cancelación voluntaria y vencimiento de 48 h con penalidad de 7 días", () => {
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

    const crearTituloConDos = async (nombre: string, prefijo: string) => {
      const t = await request(app)
        .post("/titulos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ nombre, autor: "Autor Test" });
      await request(app)
        .post(`/titulos/${t.body.id}/ejemplares`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ codigo: `${prefijo}-1`, soloEnSala: false });
      await request(app)
        .post(`/titulos/${t.body.id}/ejemplares`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ codigo: `${prefijo}-2`, soloEnSala: false });
      return t.body.id as number;
    };

    await request(app).post("/usuarios").send({
      nombre: "Ana",
      email: "ana@test.com",
      contrasena: "clave",
    });
    const loginAna = await request(app).post("/entrada").send({
      email: "ana@test.com",
      contrasena: "clave",
    });

    await request(app).post("/usuarios").send({
      nombre: "Luis",
      email: "luis@test.com",
      contrasena: "clave",
    });
    const loginLuis = await request(app).post("/entrada").send({
      email: "luis@test.com",
      contrasena: "clave",
    });

    return {
      app,
      reloj,
      correo,
      crearTituloConDos,
      anaToken: loginAna.body.token as string,
      luisToken: loginLuis.body.token as string,
    };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("cancelar voluntariamente libera ejemplar y cupo; otro usuario no puede cancelar reserva ajena (RN-13)", async () => {
    const { app, crearTituloConDos, anaToken, luisToken } = await setupEscenario();
    const tituloId = await crearTituloConDos("TDD", "TDD");

    const r = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId });
    expect(r.status).toBe(201);

    const ajena = await request(app)
      .delete(`/reservas/${r.body.id}`)
      .set("Authorization", `Bearer ${luisToken}`);
    expect(ajena.status).toBe(403);

    const cancel = await request(app)
      .delete(`/reservas/${r.body.id}`)
      .set("Authorization", `Bearer ${anaToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.estado).toBe("cancelada");

    const mis = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${anaToken}`);
    expect(mis.body.cupoOcupado).toBe(0);

    const cat = await request(app).get("/titulos");
    expect(cat.body[0].prestablesDisponibles).toBe(2);
  });

  it("vencer las 48 h hábiles sin retiro libera el ejemplar, penaliza el cupo 7 días y envía aviso (RN-08, RN-11, RN-28)", async () => {
    // Lunes 19/10 10:00 -> vence miércoles 21/10 10:00
    const { app, reloj, correo, crearTituloConDos, anaToken } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );
    const tituloId = await crearTituloConDos("Clean Architecture", "CA");

    const r1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId });
    expect(r1.status).toBe(201);

    // Avanzamos 48h 01m -> miércoles 21/10 10:01 (reserva vencida)
    reloj.advanceTo("2026-10-21T10:01:00-03:00");

    const mis = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${anaToken}`);
    expect(mis.status).toBe(200);
    expect(mis.body.reservas[0].estado).toBe("vencida");
    expect(mis.body.penalidadesVigentes).toHaveLength(1);
    expect(mis.body.cupoOcupado).toBe(1); // 1 cupo penalizado

    const cat = await request(app).get("/titulos");
    expect(cat.body[0].prestablesDisponibles).toBe(2); // ejemplar liberado

    // Alumno tiene cupo máx 2: con 1 penalizado puede pedir 1 más, pero NO 2 más
    const r2 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId });
    expect(r2.status).toBe(201);

    const r3 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId });
    expect(r3.status).toBe(409);

    const mailsVencidos = correo.listSentMails().filter((m) => m.type === "reserva vencida");
    expect(mailsVencidos).toHaveLength(1);

    // Pasados 7 días desde el vencimiento de r1 (mié 28/10 10:01) expira la penalidad de r1; sigue vigente la de r2 (hasta 30/10)
    reloj.advanceTo("2026-10-28T10:01:00-03:00");
    const misDespues = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${anaToken}`);
    expect(misDespues.body.penalidadesVigentes).toHaveLength(1);
    expect(misDespues.body.cupoOcupado).toBe(1);

    // Pasados 7 días desde el vencimiento de r2 (vie 30/10 10:02) se libera también ese cupo penalizado
    reloj.advanceTo("2026-10-30T10:02:00-03:00");
    const misSinPenalidad = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${anaToken}`);
    expect(misSinPenalidad.body.penalidadesVigentes).toHaveLength(0);
    expect(misSinPenalidad.body.cupoOcupado).toBe(0);
  });
});
