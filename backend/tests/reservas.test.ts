import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-09 — Crear reserva online con cupos, días hábiles, concurrencia y avisos", () => {
  const clients: Client[] = [];

  async function setupEscenario(fechaInicial = "2026-10-23T15:00:00-03:00") {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);
    const reloj = new FixedReloj(fechaInicial);
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
      await request(app).post("/usuarios").send({ nombre, email, contrasena: "clave" });
      const login = await request(app).post("/entrada").send({ email, contrasena: "clave" });
      return login.body.token as string;
    };

    return { app, db, reloj, correo, adminToken, crearUsuarioYEntrar };
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("respeta cupo máximo de Alumno (2), excluye solo_en_sala, informa corrimiento viernes->martes y envía correo (RN-02, RN-07..10, RN-28)", async () => {
    const { app, correo, adminToken, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-23T15:00:00-03:00" // viernes
    );

    const tSoloSala = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Diccionario Enciclopédico", autor: "RAE" });
    await request(app)
      .post(`/titulos/${tSoloSala.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "DIC-SALA", soloEnSala: true });

    const t1 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Clean Code", autor: "Robert Martin" });
    await request(app)
      .post(`/titulos/${t1.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CC-1", soloEnSala: false });
    await request(app)
      .post(`/titulos/${t1.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CC-2", soloEnSala: false });
    await request(app)
      .post(`/titulos/${t1.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "CC-3", soloEnSala: false });

    const t2 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "DDIA", autor: "Martin Kleppmann" });
    await request(app)
      .post(`/titulos/${t2.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "DDIA-1", soloEnSala: false });

    const t3 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Refactoring", autor: "Martin Fowler" });
    await request(app)
      .post(`/titulos/${t3.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "REF-1", soloEnSala: false });

    const anaToken = await crearUsuarioYEntrar("Ana", "ana@test.com");

    // Título solo en sala -> rechazado sin consumir cupo
    const salaRes = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId: tSoloSala.body.id });
    expect(salaRes.status).toBe(409);

    // 1.ª reserva el viernes 15:00 -> vence martes 15:00 con corrimiento informado
    const r1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId: t1.body.id });
    expect(r1.status).toBe(201);
    expect(r1.body.estado).toBe("confirmada");
    expect(r1.body.venceRetiroEn).toBe(new Date("2026-10-27T15:00:00-03:00").toISOString());
    expect(r1.body.corrimientoInformado).toBeTruthy();

    // Alumno NO puede pedir una segunda copia del mismo título (RN-07)
    const copiaRepetida = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId: t1.body.id });
    expect(copiaRepetida.status).toBe(409);

    // 2.ª reserva sobre un título distinto -> ocupa cupo 2/2
    const r2 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId: t2.body.id });
    expect(r2.status).toBe(201);

    // 3.ª reserva -> supera cupo de Alumno (2)
    const r3 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${anaToken}`)
      .send({ tituloId: t3.body.id });
    expect(r3.status).toBe(409);

    const mis = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${anaToken}`);
    expect(mis.status).toBe(200);
    expect(mis.body.reservas).toHaveLength(2);

    const mails = correo.listSentMails();
    expect(mails).toHaveLength(2);
    expect(mails[0].to).toBe("ana@test.com");
    expect(mails[0].type).toBe("reserva confirmada");
  });

  it("ante dos reservas simultáneas sobre el último ejemplar disponible, solo una se confirma y la otra recibe 409 (RN-12)", async () => {
    const { app, adminToken, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-21T10:00:00-03:00"
    );

    const titulo = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Refactoring", autor: "Martin Fowler" });
    await request(app)
      .post(`/titulos/${titulo.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "REF-01", soloEnSala: false });

    const tok1 = await crearUsuarioYEntrar("Ana", "ana@test.com");
    const tok2 = await crearUsuarioYEntrar("Luis", "luis@test.com");

    const [res1, res2] = await Promise.all([
      request(app)
        .post("/reservas")
        .set("Authorization", `Bearer ${tok1}`)
        .send({ tituloId: titulo.body.id }),
      request(app)
        .post("/reservas")
        .set("Authorization", `Bearer ${tok2}`)
        .send({ tituloId: titulo.body.id }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
  });

  it("Docente y Bibliotecario sí pueden reservar múltiples copias del mismo título (RN-07)", async () => {
    const { app, adminToken, crearUsuarioYEntrar } = await setupEscenario();

    const titulo = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Clean Code", autor: "Robert Martin" });
    for (const codigo of ["CC-1", "CC-2", "CC-3", "CC-4"]) {
      await request(app)
        .post(`/titulos/${titulo.body.id}/ejemplares`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ codigo, soloEnSala: false });
    }

    const docenteToken = await crearUsuarioYEntrar("Profe", "profe@test.com");
    const usuarios = await request(app)
      .get("/usuarios")
      .set("Authorization", `Bearer ${adminToken}`);
    const profe = usuarios.body.find((u: { email: string }) => u.email === "profe@test.com");
    await request(app)
      .patch(`/usuarios/${profe.id}/rol`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: "Docente" });

    const d1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${docenteToken}`)
      .send({ tituloId: titulo.body.id });
    const d2 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${docenteToken}`)
      .send({ tituloId: titulo.body.id });
    expect(d1.status).toBe(201);
    expect(d2.status).toBe(201);

    const b1 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tituloId: titulo.body.id });
    const b2 = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tituloId: titulo.body.id });
    expect(b1.status).toBe(201);
    expect(b2.status).toBe(201);
  });
});
