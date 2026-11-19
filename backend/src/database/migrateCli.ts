try {
  process.loadEnvFile?.();
} catch {
  // En producción las variables ya llegan en process.env
}

import { createDatabaseClient } from "./client.js";
import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const db = createDatabaseClient();
  try {
    await runMigrations(db);
    console.log("Migraciones ejecutadas correctamente.");
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("Error ejecutando migraciones:", err);
  process.exit(1);
});
