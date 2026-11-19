import cors from "cors";
import express, { type Express } from "express";

/**
 * Crea la instancia de la aplicación Express sin efectos secundarios de red.
 */
export function createApp(allowedOrigin?: string): Express {
  const app = express();

  app.use(
    cors({
      origin: allowedOrigin ? [allowedOrigin] : true,
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}
