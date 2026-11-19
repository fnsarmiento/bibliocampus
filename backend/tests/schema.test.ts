import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";

describe("T-02 — Esquema SQLite/Turso, migraciones y restricciones únicas", () => {
  const clients: Client[] = [];

  async function setupDb(): Promise<Client> {
    const db = createDatabaseClient(":memory:");
    clients.push(db);
    await runMigrations(db);
    return db;
  }

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  it("crea las 9 tablas del modelo de datos tras la migración limpia", async () => {
    const db = await setupDb();
    const res = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    const names = res.rows.map((r) => String(r.name)).sort();

    expect(names).toEqual([
      "cupo_penalizado",
      "ejemplar",
      "feriado",
      "lista_espera",
      "prestamo",
      "reserva",
      "sesion",
      "titulo",
      "usuario",
    ]);
  });

  it("impide dos reservas confirmadas sobre el mismo ejemplar pero permite múltiples canceladas (RN-12)", async () => {
    const db = await setupDb();

    await db.execute({
      sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)",
      args: ["Ana", "ana@test.com", "h1", "Alumno", "2026-10-20T10:00:00Z"],
    });
    await db.execute({
      sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)",
      args: ["Luis", "luis@test.com", "h2", "Alumno", "2026-10-20T10:00:00Z"],
    });
    await db.execute({
      sql: "INSERT INTO titulo (nombre, autor, isbn, creado_en) VALUES (?, ?, ?, ?)",
      args: ["Clean Code", "Robert Martin", "9780132350884", "2026-10-20T10:00:00Z"],
    });
    await db.execute({
      sql: "INSERT INTO ejemplar (titulo_id, codigo, solo_en_sala, estado) VALUES (?, ?, ?, ?)",
      args: [1, "CC-01", 0, "disponible"],
    });

    await db.execute({
      sql: "INSERT INTO reserva (usuario_id, titulo_id, ejemplar_id, estado, creada_en) VALUES (?, ?, ?, 'confirmada', ?)",
      args: [1, 1, 1, "2026-10-20T11:00:00Z"],
    });

    await expect(
      db.execute({
        sql: "INSERT INTO reserva (usuario_id, titulo_id, ejemplar_id, estado, creada_en) VALUES (?, ?, ?, 'confirmada', ?)",
        args: [2, 1, 1, "2026-10-20T11:00:01Z"],
      })
    ).rejects.toThrow();

    await db.execute({
      sql: "INSERT INTO reserva (usuario_id, titulo_id, ejemplar_id, estado, creada_en) VALUES (?, ?, ?, 'cancelada', ?)",
      args: [2, 1, 1, "2026-10-20T09:00:00Z"],
    });
    await db.execute({
      sql: "INSERT INTO reserva (usuario_id, titulo_id, ejemplar_id, estado, creada_en) VALUES (?, ?, ?, 'cancelada', ?)",
      args: [2, 1, 1, "2026-10-20T09:30:00Z"],
    });

    const canceladas = await db.execute(
      "SELECT COUNT(*) AS total FROM reserva WHERE ejemplar_id = 1 AND estado = 'cancelada'"
    );
    expect(Number(canceladas.rows[0].total)).toBe(2);
  });

  it("impide email duplicado (RN-05) y dos entradas activas en lista de espera del mismo usuario/título (RN-22)", async () => {
    const db = await setupDb();

    await db.execute({
      sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)",
      args: ["Ana", "ana@test.com", "h1", "Alumno", "2026-10-20T10:00:00Z"],
    });

    await expect(
      db.execute({
        sql: "INSERT INTO usuario (nombre, email, contrasena_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)",
        args: ["Otra Ana", "ana@test.com", "h2", "Alumno", "2026-10-20T10:05:00Z"],
      })
    ).rejects.toThrow();

    await db.execute({
      sql: "INSERT INTO titulo (nombre, autor, isbn, creado_en) VALUES (?, ?, ?, ?)",
      args: ["DDD", "Eric Evans", null, "2026-10-20T10:00:00Z"],
    });

    await db.execute({
      sql: "INSERT INTO lista_espera (titulo_id, usuario_id, estado, orden_en) VALUES (?, ?, 'esperando', ?)",
      args: [1, 1, "2026-10-20T12:00:00Z"],
    });

    await expect(
      db.execute({
        sql: "INSERT INTO lista_espera (titulo_id, usuario_id, estado, orden_en) VALUES (?, ?, 'avisado', ?)",
        args: [1, 1, "2026-10-20T12:05:00Z"],
      })
    ).rejects.toThrow();
  });
});
