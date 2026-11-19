import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-14 — Reparación de ejemplares y reactivación de reservas", () => {
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

    const crearUsuarioYEntrar = async (nombre: string, email: string) => {
      const reg = await request(app).post("/usuarios").send({ nombre, email, contrasena: "clave" });
      const login = await request(app).post("/entrada").send({ email, contrasena: "clave" });
      return { id: reg.body.id as number, token: login.body.token as string };
    };

    const t = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Clean Architecture", autor: "Robert C. Martin" });

    return {
      app,
      reloj,
      correo,
      adminToken,
      tituloId: t.body.id as number,
      crearUsuarioYEntrar,
    };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("solo Bibliotecario puede reparar (403 a Alumno); si hay otro ejemplar disponible reasigna automáticamente y avisa por correo (RN-20, RN-28)", async () => {
    const { app, correo, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario();
    const ej1 = await request(app)
      .post(`/titulos/${tituloId}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CA-1", soloEnSala: false });
    const ej2 = await request(app)
      .post(`/titulos/${tituloId}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CA-2", soloEnSala: false });

    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");

    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });
    expect(rAna.status).toBe(201);
    expect(rAna.body.ejemplarId).toBe(ej1.body.id);

    // Alumno no autorizado
    const forbidden = await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ enReparacion: true });
    expect(forbidden.status).toBe(403);

    // Bibliotecario pasa ej1 a reparación -> reasigna a ej2
    const rep = await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: true });
    expect(rep.status).toBe(200);
    expect(rep.body.ejemplar.estado).toBe("en_reparacion");
    expect(rep.body.reservaAfectada.estado).toBe("confirmada");
    expect(rep.body.reservaAfectada.ejemplarId).toBe(ej2.body.id);
    expect(rep.body.reservaAfectada.ejemplarCodigo).toBe("CA-2");

    const mails = correo
      .listSentMails()
      .filter((m) => m.type === "reparacion" && m.to === "ana@test.com");
    expect(mails).toHaveLength(1);
  });

  it("si no hay otro ejemplar disponible pasa la reserva a desactivada conservando cupo y, al salir de reparación, permite reactivarla dentro de 24 h hábiles (RN-21, RN-24..26)", async () => {
    const { app, reloj, correo, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-22T11:00:00-03:00"
    );
    const ej1 = await request(app)
      .post(`/titulos/${tituloId}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CA-UNICO", soloEnSala: false });

    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");
    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });

    // No hay otro ejemplar -> reserva pasa a desactivada con motivo reparacion y conserva cupo=1
    const rep = await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: true });
    expect(rep.status).toBe(200);
    expect(rep.body.reservaAfectada.estado).toBe("desactivada");
    expect(rep.body.reservaAfectada.desactivadaMotivo).toBe("reparacion");

    const misAntes = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${ana.token}`);
    expect(misAntes.body.cupoOcupado).toBe(1);

    // Mientras sigue en reparación no puede reactivarse (409)
    const reactPrematura = await request(app)
      .post(`/reservas/${rAna.body.id}/reactivar`)
      .set("Authorization", `Bearer ${ana.token}`);
    expect(reactPrematura.status).toBe(409);

    // Viernes 10:00: sale de reparación -> se avisa a Ana con 24 h hábiles (hasta lunes 10:00)
    reloj.advanceTo("2026-10-23T10:00:00-03:00");
    const finRep = await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: false });
    expect(finRep.status).toBe(200);
    expect(finRep.body.ejemplar.estado).toBe("disponible");

    const avisos = correo
      .listSentMails()
      .filter((m) => m.type === "turno disponible en lista de espera" && m.to === "ana@test.com");
    expect(avisos).toHaveLength(1);

    // Lunes 09:30 (aún dentro de las 24 h hábiles): Ana reactiva su reserva
    reloj.advanceTo("2026-10-26T09:30:00-03:00");
    const reactivada = await request(app)
      .post(`/reservas/${rAna.body.id}/reactivar`)
      .set("Authorization", `Bearer ${ana.token}`);
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.estado).toBe("confirmada");
    expect(reactivada.body.ejemplarId).toBe(ej1.body.id);
    expect(reactivada.body.desactivadaMotivo).toBeNull();

    const misDespues = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${ana.token}`);
    expect(misDespues.body.cupoOcupado).toBe(1);
  });

  it("si deja vencer las 24 h hábiles tras salir de reparación, se cancela definitivamente liberando cupo y pasa al 2.º; no se puede reparar un ejemplar prestado (RN-27)", async () => {
    const { app, reloj, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-22T11:00:00-03:00"
    );
    const ej1 = await request(app)
      .post(`/titulos/${tituloId}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CA-ONLY", soloEnSala: false });

    const ana = await crearUsuarioYEntrar("Ana", "ana2@test.com");
    const bruno = await crearUsuarioYEntrar("Bruno", "bruno2@test.com");

    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });

    await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: true });

    // Bruno se anota después en lista de espera
    await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${bruno.token}`)
      .send({ tituloId });

    // Viernes 10:00 sale de reparación -> avisa primero a Ana (hasta lunes 10:00)
    reloj.advanceTo("2026-10-23T10:00:00-03:00");
    await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: false });

    // Lunes 10:05 vencen las 24 h hábiles -> Ana no puede reactivar, cupo=0 y Bruno recibe aviso
    reloj.advanceTo("2026-10-26T10:05:00-03:00");
    const reactTarde = await request(app)
      .post(`/reservas/${rAna.body.id}/reactivar`)
      .set("Authorization", `Bearer ${ana.token}`);
    expect(reactTarde.status).toBe(409);

    const misAna = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${ana.token}`);
    expect(misAna.body.cupoOcupado).toBe(0);

    const listasBruno = await request(app)
      .get("/mis-listas-espera")
      .set("Authorization", `Bearer ${bruno.token}`);
    expect(listasBruno.body[0].estado).toBe("avisado");

    // Bruno confirma y retira -> mientras está prestado no puede enviarse a reparación (409)
    const rBruno = await request(app)
      .post(`/listas-espera/${listasBruno.body[0].id}/confirmar`)
      .set("Authorization", `Bearer ${bruno.token}`);
    await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: rBruno.body.id });

    const repPrestado = await request(app)
      .patch(`/ejemplares/${ej1.body.id}/reparacion`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enReparacion: true });
    expect(repPrestado.status).toBe(409);
  });
});
