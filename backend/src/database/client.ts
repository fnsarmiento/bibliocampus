import { createClient, type Client } from "@libsql/client";

/**
 * Crea un cliente libSQL/SQLite compatible con almacenamiento local (:memory: / archivo) y Turso remoto.
 */
export function createDatabaseClient(
  url = process.env.DATABASE_URL || "file:local.db",
  authToken = process.env.DATABASE_AUTH_TOKEN
): Client {
  return createClient({
    url,
    authToken: authToken || undefined,
  });
}
