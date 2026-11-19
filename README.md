# BiblioCampus

Sistema web para gestionar el catálogo, reservas online de 48 h hábiles, préstamos a domicilio, lista de espera unificada (24 h hábiles), reparaciones y suspensiones por atraso de una biblioteca educativa.

## Despliegue en vivo

- **Aplicación web (Frontend en Netlify):** https://bibliocampus.netlify.app/
- **API (Backend en Render):** https://bibliocampus-backend.onrender.com/ (healthcheck: https://bibliocampus-backend.onrender.com/health)
- **Repositorio:** https://github.com/fnsarmiento/bibliocampus

> **Nota para pruebas:** En el plan gratuito de Render el servidor entra en reposo tras inactividad, por lo que la primera consulta puede demorar ~30 segundos en responder.
> - **Usuario `Bibliotecario` de prueba:** `bibliotecario@bibliocampus.local` / contraseña `1234` (habilita el **Panel Bibliotecario** para cargar libros, registrar retiros/devoluciones, gestionar reparaciones, feriados y cambiar roles).
> - **Lector (`Alumno`):** podés crear cualquier cuenta nueva desde **Ingresar / Registrarse → Crear cuenta**.

## Estructura del repositorio

- `docs/`: especificación funcional (`spec.md`), decisiones (`decisiones.md`), glosario (`glosario.md`), diseño técnico (`plan.md`), plan de tareas (`tasks.md`) e informe final (`informe-final.md`).
- `backend/`: API REST en Node.js + TypeScript + Express en 3 capas (`controller/`, `service/`, `repository/`), base SQLite/`@libsql/client` (Turso en producción) y suite Vitest + Supertest.
- `frontend/`: aplicación web React + Vite + TypeScript desplegable en Netlify (`public/_redirects`, `netlify.toml`), testeada con Vitest + Testing Library.
- `netlify.toml` y `render.yaml`: configuración declarativa de despliegue en Netlify y Render.

## Requisitos y ejecución local

- Node.js 20+ (verificado con Node 26).

### 1. Backend (`backend/`)

```bash
cd backend
cp .env.example .env
npm install
npm run build
npm run migrate
npm run dev
```

Variables de entorno requeridas en `backend/.env` (ejemplo sin secretos en `backend/.env.example`):

| Variable | Uso |
| :--- | :--- |
| `PORT` | Puerto HTTP del servidor (por defecto `3000`) |
| `DATABASE_URL` | `file:local.db` en desarrollo o URL `libsql://...` de Turso en producción |
| `DATABASE_AUTH_TOKEN` | Token de Turso (vacío en local) |
| `INITIAL_ADMIN_EMAIL` | Email del usuario `Bibliotecario` inicial sembrado al arrancar |
| `INITIAL_ADMIN_PASSWORD` | Contraseña del `Bibliotecario` inicial (definir fuera del repo) |
| `FRONTEND_URL` | Origen permitido por CORS (en producción, URL de Netlify sin barra final) |

### 2. Frontend (`frontend/`)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Variable de entorno en `frontend/`:

| Variable | Uso |
| :--- | :--- |
| `VITE_API_URL` | URL base del backend (por defecto `http://localhost:3000`; en Netlify apuntar al servicio de Render) |

## Pruebas y compilación

```bash
# Backend (15 archivos de test, 36 tests)
cd backend && npm test && npm run build

# Frontend (3 archivos de test, 6 tests)
cd frontend && npm test && npm run build
```

## Despliegue en producción (Turso + Render + Netlify)

1. **Base de datos en Turso:**
   - Crear una base con `turso db create bibliocampus`.
   - Obtener URL (`turso db show --url bibliocampus`) y token (`turso db tokens create bibliocampus`).
2. **Backend en Render (`render.yaml`):**
   - Conectar el repositorio o usar el Blueprint con `rootDir: backend`, `buildCommand: npm install && npm run build`, `startCommand: npm start` y `healthCheckPath: /health`.
   - Configurar `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` y `FRONTEND_URL` (URL HTTPS del sitio en Netlify).
   - Al arrancar (`src/index.ts`), el servidor corre automáticamente `runMigrations` y el seed inicial idempotente; también está disponible `npm run migrate` para ejecutar migraciones explícitamente.
3. **Frontend en Netlify (`netlify.toml`):**
   - Conectar el repositorio (usa `base = "frontend"`, `command = "npm run build"`, `publish = "dist"` y `public/_redirects` para SPA).
   - Configurar la variable de entorno `VITE_API_URL` con la URL pública del backend en Render y redesplegar.
   - Si el plan gratuito de Render estuvo dormido, el catálogo informa automáticamente la espera de conexión inicial al usuario.
