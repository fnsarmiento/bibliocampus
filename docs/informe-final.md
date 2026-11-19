# Informe Final de Implementación — BiblioCampus

## 1. Resumen de cumplimiento

Todas las etapas planificadas (`T-01` a `T-18` en `docs/tasks.md`) quedaron completadas bajo desarrollo guiado por especificación y TDD estricto: cada funcionalidad partió de pruebas en rojo derivadas de `docs/spec.md` (`RN-01` a `RN-28` y `HU-01` a `HU-07`) antes de implementarse en sus capas correspondientes.

## 2. Cobertura funcional verificada

- **Identidad, roles y datos iniciales (`RN-04`–`RN-06`, `HU-01`, `HU-07`):** Registro público como `Alumno`, hash criptográfico `scryptSync` + `timingSafeEqual` en `HashPassword`, tokens Bearer persistidos en `sesion`, semilla idempotente del `Bibliotecario` desde variables de entorno y gestión de roles protegida.
- **Catálogo y feriados (`RN-01`–`RN-03`, `HU-02`, `HU-07`):** Diferenciación de ejemplares prestables y «solo en sala» (rechazando reservas online sobre estos últimos) más calendario hábil sobre `America/Argentina/Buenos_Aires` excluyendo fines de semana y feriados configurables.
- **Reservas, concurrencia y vencimiento (`RN-07`–`RN-13`, `HU-03`):** Cupo máximo por rol (`Alumno: 2`, `Docente: 5`), control de concurrencia sobre el último ejemplar mediante transacción de escritura e índice único parcial (`idx_reserva_ejemplar_activa` -> `409` al segundo pedido), vencimiento automático a 48 h hábiles con penalidad de 1 cupo por 7 días y cancelación voluntaria.
- **Préstamos, suspensiones y renovación (`RN-14`–`RN-19`, `HU-04`, `HU-05`):** Retiros a 7/15 días corridos al siguiente día hábil, devolución con suspensión por atraso (1 día por día de demora, tope 7 días), desactivación de reservas pendientes conservando cupo y orden de cola, y renovación única (+5 días hábiles) bloqueada si hay lista de espera activa.
- **Lista de espera unificada y reparaciones (`RN-20`–`RN-28`, `HU-06`, `HU-07`):** Cola unificada sin consumo inicial de cupo, protección de ejemplares mientras hay aviso de 24 h hábiles vigente, expiración en cadena (cancelando definitivamente reservas `desactivada` vencidas y liberando cupo), reasignación o desactivación ante reparación de ejemplares y reactivación dentro de las 24 h hábiles. Todos los eventos notifican mediante `Correo`.
- **Frontend e infraestructura (`T-15`–`T-18`):** SPA en React + Vite + TypeScript con vistas de catálogo público, autenticación, cuenta de lector y panel protegido de `Bibliotecario`, además de configuración para Netlify (`netlify.toml`, `frontend/public/_redirects`), Render (`render.yaml`, CORS por `FRONTEND_URL`, `/health` con chequeo de BD) y Turso (`@libsql/client` + `npm run migrate`).

## 3. Evidencia de verificación

Ejecución final posterior al último cambio de código (`backend/` y `frontend/`):

- **Backend (`cd backend && npm test && npm run build`):**
  - `15/15` archivos de test pasaron (`34/34` tests: `health`, `schema`, `relojCalendario`, `correoHash`, `initialData`, `usuariosEntrada`, `catalogo`, `feriados`, `reservas`, `reservasCancelacionVencimiento`, `prestamosDevolucion`, `renovacion`, `listaEspera`, `reparacionReactivacion`, `productionConfig`).
  - Compilación TypeScript (`tsc`) y copia de migraciones SQL a `dist/database/migrations` sin errores.
  - Verificación de `npm run migrate` contra SQLite local ejecutada correctamente.
- **Frontend (`cd frontend && npm test && npm run build`):**
  - `3/3` archivos de test pasaron (`6/6` tests: `catalogoAuth`, `lector`, `bibliotecario`).
  - Compilación `tsc -b` y bundle Vite (`dist/index.html`, `dist/assets/*`, `dist/_redirects`) sin errores.
- **Higiene del repositorio:** `.gitignore` excluye `node_modules/`, `dist/`, `.env*` (salvo `.env.example`) y `*.tsbuildinfo`; ningún secreto fue versionado.
