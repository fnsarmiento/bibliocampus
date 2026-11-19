import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { FixedReloj } from "../src/components/Reloj.js";
import { HashPassword } from "../src/components/HashPassword.js";
import { loadInitialData, seedCatalogoInicial } from "../src/seed/loadInitialData.js";

describe("T-05 — Carga inicial idempotente de bibliotecario administrador", () => {
  const clients: Client[] = [];

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("crea el bibliotecario inicial con contraseña hasheada e idempotencia al repetir (RN-06)", async () => {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);

    const reloj = new FixedReloj("2026-10-20T09:00:00-03:00");

    await loadInitialData(db, reloj, {
      adminEmail: "admin@bibliocampus.local",
      adminPassword: "AdminPassword123!",
    });

    await loadInitialData(db, reloj, {
      adminEmail: "admin@bibliocampus.local",
      adminPassword: "AdminPassword123!",
    });

    const res = await db.execute({
      sql: "SELECT id, nombre, email, contrasena_hash, rol FROM usuario WHERE email = ?",
      args: ["admin@bibliocampus.local"],
    });

    expect(res.rows).toHaveLength(1);
    const admin = res.rows[0];
    expect(admin.rol).toBe("Bibliotecario");
    expect(String(admin.contrasena_hash)).not.toBe("AdminPassword123!");
    expect(HashPassword.verify("AdminPassword123!", String(admin.contrasena_hash))).toBe(true);
  });

  it("siembra un catálogo inicial con múltiples libros y ejemplares (prestables y solo en sala) de forma idempotente", async () => {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);

    const reloj = new FixedReloj("2026-10-20T09:00:00-03:00");

    await seedCatalogoInicial(db, reloj);
    await seedCatalogoInicial(db, reloj);

    const titulos = await db.execute("SELECT id, nombre FROM titulo ORDER BY id ASC");
    const ejemplares = await db.execute("SELECT id, solo_en_sala FROM ejemplar");

    expect(titulos.rows.length).toBeGreaterThanOrEqual(6);
    expect(ejemplares.rows.some((r) => Number(r.solo_en_sala) === 0)).toBe(true);
    expect(ejemplares.rows.some((r) => Number(r.solo_en_sala) === 1)).toBe(true);
  });
});
