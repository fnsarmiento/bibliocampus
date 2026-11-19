import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-11 — Retiro físico, devolución y suspensión por atraso", () => {
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

    return { app, db, reloj, correo, adminToken, crearUsuarioYEntrar };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("retirar reserva de Docente crea préstamo a 15 días trasladado al siguiente día hábil si cae sábado/domingo/feriado (RN-14, RN-15)", async () => {
    // Lunes 19/10 + 15 días = martes 03/11; si martes 03/11 es feriado -> miércoles 04/11
    const { app, adminToken, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );

    const doc = await crearUsuarioYEntrar("Docente", "doc@test.com");
    await request(app)
      .patch(`/usuarios/${doc.id}/rol`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: "Docente" });

    await request(app)
      .post("/feriados")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fecha: "2026-11-03", descripcion: "Feriado prueba" });

    const t = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Sistemas Operativos", autor: "Tanenbaum" });
    await request(app)
      .post(`/titulos/${t.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "SO-1", soloEnSala: false });

    const res = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${doc.token}`)
      .send({ tituloId: t.body.id });
    expect(res.status).toBe(201);

    const ret = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: res.body.id });
    expect(ret.status).toBe(201);
    expect(ret.body.venceEn.startsWith("2026-11-04")).toBe(true);
    expect(ret.body.corrimientoInformado).toBeTruthy();

    const prestamos = await request(app)
      .get("/prestamos")
      .set("Authorization", `Bearer ${doc.token}`);
    expect(prestamos.status).toBe(200);
    expect(prestamos.body).toHaveLength(1);
  });

  it("devolver con 10 días de atraso suspende máximo 7 días y un préstamo vencido bloquea nuevas reservas (RN-17, RN-18, RN-28)", async () => {
    const { app, reloj, correo, adminToken, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );

    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");

    const t1 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Libro Uno", autor: "Autor 1" });
    await request(app)
      .post(`/titulos/${t1.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "L1-1", soloEnSala: false });

    const t3 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Libro Tres", autor: "Autor 3" });
    await request(app)
      .post(`/titulos/${t3.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "L3-1", soloEnSala: false });

    const r1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId: t1.body.id });
    const p1 = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: r1.body.id });
    expect(p1.status).toBe(201);

    // El 27/10 p1 ya está vencido -> no puede sacar un libro nuevo
    reloj.advanceTo("2026-10-27T12:00:00-03:00");
    const bloqueadaPorVencido = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId: t3.body.id });
    expect(bloqueadaPorVencido.status).toBe(409);

    // Devuelve p1 el 05/11 (10 días después del 26/10 -> tope 7 días de suspensión, hasta 12/11)
    reloj.advanceTo("2026-11-05T10:00:00-03:00");
    const dev = await request(app)
      .post(`/prestamos/${p1.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dev.status).toBe(200);
    expect(dev.body.diasAtraso).toBe(10);
    expect(dev.body.diasSuspension).toBe(7);
    expect(dev.body.suspendidoHasta).toBe(new Date("2026-11-12T10:00:00-03:00").toISOString());

    // Durante la suspensión (06/11) sigue bloqueada para nuevas reservas
    reloj.advanceTo("2026-11-06T10:00:00-03:00");
    const duranteSusp = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId: t3.body.id });
    expect(duranteSusp.status).toBe(409);

    const mailsSusp = correo.listSentMails().filter((m) => m.type === "suspension aplicada");
    expect(mailsSusp).toHaveLength(1);
  });

  it("al quedar suspendido por devolución tardía, una reserva confirmada vigente pasa a desactivada liberando ejemplar y conservando cupo (RN-19)", async () => {
    const { app, reloj, adminToken, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );
    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");

    const t1 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Libro Uno", autor: "Autor 1" });
    await request(app)
      .post(`/titulos/${t1.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "L1-1", soloEnSala: false });

    const t2 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Libro Dos", autor: "Autor 2" });
    await request(app)
      .post(`/titulos/${t2.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "L2-1", soloEnSala: false });

    const r1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId: t1.body.id });
    const p1 = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: r1.body.id });

    // El 26/10 09:00 (1 h antes de que venza p1), reserva t2 (vigente hasta mié 28/10 09:00)
    reloj.advanceTo("2026-10-26T09:00:00-03:00");
    const r2 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId: t2.body.id });
    expect(r2.status).toBe(201);

    // Devuelve p1 el 27/10 10:00 (1 día de atraso -> suspensión 1 día; r2 sigue vigente -> pasa a desactivada)
    reloj.advanceTo("2026-10-27T10:00:00-03:00");
    const dev = await request(app)
      .post(`/prestamos/${p1.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dev.status).toBe(200);
    expect(dev.body.diasAtraso).toBe(1);
    expect(dev.body.diasSuspension).toBe(1);

    const mis = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${ana.token}`);
    const r2Actual = mis.body.reservas.find((r: { id: number }) => r.id === r2.body.id);
    expect(r2Actual.estado).toBe("desactivada");
    expect(r2Actual.desactivadaMotivo).toBe("suspension");
    expect(mis.body.cupoOcupado).toBe(1);

    const cat = await request(app).get("/titulos");
    const libro2 = cat.body.find((t: { id: number }) => t.id === t2.body.id);
    expect(libro2.prestablesDisponibles).toBe(1);
  });
});
