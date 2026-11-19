import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";

function resolveMigrationPath(): string {
  const localPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
    "001_initial_schema.sql"
  );
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return path.resolve(process.cwd(), "src/database/migrations/001_initial_schema.sql");
}

/**
 * Ejecuta la migración inicial sobre el cliente SQLite/Turso provisto.
 */
export async function runMigrations(db: Client): Promise<void> {
  const sql = fs.readFileSync(resolveMigrationPath(), "utf8");
  await db.executeMultiple(sql);
}
