try {
  process.loadEnvFile?.();
} catch {
  // En producción (Render) las variables ya llegan en process.env
}

import { createApp } from "./app.js";
import { SystemReloj } from "./components/Reloj.js";
import { createDatabaseClient } from "./database/client.js";
import { runMigrations } from "./database/migrate.js";
import { loadInitialData, seedCatalogoInicial } from "./seed/loadInitialData.js";

async function start(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const frontendUrl = process.env.FRONTEND_URL;
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "";

  const db = createDatabaseClient();
  const reloj = new SystemReloj();

  await runMigrations(db);
  if (adminEmail && adminPassword) {
    await loadInitialData(db, reloj, { adminEmail, adminPassword });
  }
  await seedCatalogoInicial(db, reloj);

  const app = createApp(frontendUrl, { db, reloj });
  app.listen(port, () => {
    console.log(`BiblioCampus backend listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Error al iniciar el backend:", err);
  process.exit(1);
});
