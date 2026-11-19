import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { createApp } from "../src/app.js";

describe("T-18 — Configuración de producción (CORS FRONTEND_URL y healthcheck con BD)", () => {
  const clients: Client[] = [];

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("normaliza FRONTEND_URL (sin barra final y múltiples orígenes) y bloquea orígenes no autorizados", async () => {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);

    const app = createApp("https://bibliocampus.netlify.app/, http://localhost:5173", { db });

    const okNetlify = await request(app)
      .get("/titulos")
      .set("Origin", "https://bibliocampus.netlify.app");
    expect(okNetlify.status).toBe(200);
    expect(okNetlify.headers["access-control-allow-origin"]).toBe(
      "https://bibliocampus.netlify.app"
    );

    const okLocal = await request(app)
      .get("/titulos")
      .set("Origin", "http://localhost:5173");
    expect(okLocal.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const blocked = await request(app)
      .get("/titulos")
      .set("Origin", "https://sitio-malicioso.example");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("GET /health verifica conectividad con la base de datos cuando está configurada", async () => {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);

    const app = createApp(undefined, { db });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: "ok" });
  });
});
