import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo } from "../src/components/Correo.js";
import { loadInitialData } from "../src/seed/loadInitialData.js";
import { createApp } from "../src/app.js";

describe("T-13 — Lista de espera unificada, avisos de 24 h hábiles y expiración en cadena", () => {
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
      .send({ nombre: "Designing Data-Intensive Applications", autor: "Martin Kleppmann" });
    await request(app)
      .post(`/titulos/${t.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "DDIA-1", soloEnSala: false });

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

  it("anotarse sin stock no consume cupo ni permite duplicados; al devolver avisa al 1.º y si confirma obtiene reserva 48 h (RN-22..26, RN-28)", async () => {
    const { app, correo, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario();
    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");
    const luis = await crearUsuarioYEntrar("Luis", "luis@test.com");

    // Mientras hay disponible, no hace falta lista de espera (409)
    const conStock = await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${luis.token}`)
      .send({ tituloId });
    expect(conStock.status).toBe(409);

    // Ana reserva y retira el único ejemplar
    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });
    const pAna = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: rAna.body.id });

    // Luis se anota en lista de espera: no consume cupo, rechaza duplicado
    const e1 = await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${luis.token}`)
      .send({ tituloId });
    expect(e1.status).toBe(201);
    expect(e1.body.estado).toBe("esperando");

    const misResLuis = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${luis.token}`);
    expect(misResLuis.body.cupoOcupado).toBe(0);

    const dup = await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${luis.token}`)
      .send({ tituloId });
    expect(dup.status).toBe(409);

    // Ana devuelve -> se avisa automáticamente a Luis con 24 h hábiles
    await request(app)
      .post(`/prestamos/${pAna.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);

    const misListas = await request(app)
      .get("/mis-listas-espera")
      .set("Authorization", `Bearer ${luis.token}`);
    expect(misListas.body[0].estado).toBe("avisado");

    const mailsEspera = correo
      .listSentMails()
      .filter((m) => m.type === "turno disponible en lista de espera" && m.to === "luis@test.com");
    expect(mailsEspera).toHaveLength(1);

    // Luis confirma -> se transforma en reserva normal con 48 h y ocupa cupo
    const conf = await request(app)
      .post(`/listas-espera/${e1.body.id}/confirmar`)
      .set("Authorization", `Bearer ${luis.token}`);
    expect(conf.status).toBe(201);
    expect(conf.body.estado).toBe("confirmada");

    const misDespues = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${luis.token}`);
    expect(misDespues.body.cupoOcupado).toBe(1);
  });

  it("si el 1.º deja vencer las 24 h hábiles (o tenía reserva desactivada), se cancela definitivamente liberando cupo y pasa al 2.º (RN-24, RN-27)", async () => {
    const { app, reloj, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario(
      "2026-10-19T10:00:00-03:00"
    );
    const ana = await crearUsuarioYEntrar("Ana", "ana@test.com");
    const bruno = await crearUsuarioYEntrar("Bruno", "bruno@test.com");
    const carla = await crearUsuarioYEntrar("Carla", "carla@test.com");

    // Crear un segundo título para provocarle una suspensión corta a Bruno mientras tiene una reserva sobre tituloId
    const t2 = await request(app)
      .post("/titulos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Otro Libro", autor: "Autor" });
    await request(app)
      .post(`/titulos/${t2.body.id}/ejemplares`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "OT-1", soloEnSala: false });

    // Bruno saca OT-1 (vence lun 26/10)
    const rBrunoOtro = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${bruno.token}`)
      .send({ tituloId: t2.body.id });
    const pBrunoOtro = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: rBrunoOtro.body.id });

    // El 26/10 09:00 Bruno reserva DDIA-1 (su 2.º cupo)
    reloj.advanceTo("2026-10-26T09:00:00-03:00");
    const rBrunoDdia = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${bruno.token}`)
      .send({ tituloId });
    expect(rBrunoDdia.status).toBe(201);

    // El 27/10 10:00 Bruno devuelve OT-1 con 1 día de atraso -> queda suspendido hasta 28/10 10:00
    // Su reserva rBrunoDdia pasa a desactivada (conservando cupo=1 y su orden_cola_en = 26/10 09:00)
    reloj.advanceTo("2026-10-27T10:00:00-03:00");
    await request(app)
      .post(`/prestamos/${pBrunoOtro.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Como Bruno está suspendido hasta el 28/10 y nadie más estaba anotado aún, Ana toma DDIA-1 el 27/10
    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });
    expect(rAna.status).toBe(201);
    const pAna = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: rAna.body.id });

    // El 27/10 11:00 Carla se anota en lista de espera (orden 27/10 > orden de Bruno 26/10)
    reloj.advanceTo("2026-10-27T11:00:00-03:00");
    const eCarla = await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${carla.token}`)
      .send({ tituloId });
    expect(eCarla.status).toBe(201);

    // El 30/10 (viernes 10:00, Bruno ya cumplió su suspensión), Ana devuelve DDIA-1
    reloj.advanceTo("2026-10-30T10:00:00-03:00");
    await request(app)
      .post(`/prestamos/${pAna.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Como Bruno reservó primero (26/10) antes que Carla, el 1.º avisado es Bruno (24 h hábiles = hasta lun 02/11 10:00)
    const listasBruno = await request(app)
      .get("/mis-listas-espera")
      .set("Authorization", `Bearer ${bruno.token}`);
    expect(listasBruno.body[0].estado).toBe("avisado");
    expect(listasBruno.body[0].reservaDesactivadaId).toBe(rBrunoDdia.body.id);

    // Avanzamos al 02/11 10:01 (Bruno no reactivó en 24 h hábiles) -> su reserva se cancela definitivamente liberando cupo y pasa a Carla
    reloj.advanceTo("2026-11-02T10:01:00-03:00");

    const listasCarla = await request(app)
      .get("/mis-listas-espera")
      .set("Authorization", `Bearer ${carla.token}`);
    expect(listasCarla.body[0].estado).toBe("avisado");

    const misBruno = await request(app)
      .get("/mis-reservas")
      .set("Authorization", `Bearer ${bruno.token}`);
    const rBrunoFinal = misBruno.body.reservas.find(
      (r: { id: number }) => r.id === rBrunoDdia.body.id
    );
    expect(rBrunoFinal.estado).toBe("cancelada");
    expect(misBruno.body.cupoOcupado).toBe(0);
  });

  it("mientras el turno está avisado protege el ejemplar de reservas externas; si el 1.º rechaza, avisa al 2.º", async () => {
    const { app, adminToken, tituloId, crearUsuarioYEntrar } = await setupEscenario();
    const ana = await crearUsuarioYEntrar("Ana", "ana2@test.com");
    const bruno = await crearUsuarioYEntrar("Bruno", "bruno2@test.com");
    const carla = await crearUsuarioYEntrar("Carla", "carla2@test.com");
    const dario = await crearUsuarioYEntrar("Dario", "dario2@test.com");

    const rAna = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${ana.token}`)
      .send({ tituloId });
    const pAna = await request(app)
      .post("/prestamos/retiro")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reservaId: rAna.body.id });

    const eBruno = await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${bruno.token}`)
      .send({ tituloId });
    await request(app)
      .post("/listas-espera")
      .set("Authorization", `Bearer ${carla.token}`)
      .send({ tituloId });

    await request(app)
      .post(`/prestamos/${pAna.body.id}/devolucion`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Dario (fuera de lista) no puede robar el ejemplar reservado por aviso a Bruno
    const robo = await request(app)
      .post("/reservas")
      .set("Authorization", `Bearer ${dario.token}`)
      .send({ tituloId });
    expect(robo.status).toBe(409);

    // Bruno rechaza -> pasa inmediatamente a Carla
    const rej = await request(app)
      .post(`/listas-espera/${eBruno.body.id}/rechazar`)
      .set("Authorization", `Bearer ${bruno.token}`);
    expect(rej.status).toBe(200);
    expect(rej.body.estado).toBe("cancelado");

    const listasCarla = await request(app)
      .get("/mis-listas-espera")
      .set("Authorization", `Bearer ${carla.token}`);
    expect(listasCarla.body[0].estado).toBe("avisado");
  });
});
