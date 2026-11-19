# Plan Técnico — BiblioCampus

## 1. Arquitectura del sistema

- **Backend (`backend/`):** Node.js + TypeScript + Express organizado en **3 capas** más componentes transversales:
  - `controller/`: recibe pedidos HTTP (`req.body`, `req.params`, `req.query`), valida formato mínimo (`400`), delega al `Service` y traduce errores de dominio (`401`, `403`, `404`, `409`, `422`). **No contiene reglas de negocio.**
  - `service/`: implementa todas las reglas de negocio (`RN-01` a `RN-28`) y coordina transacciones.
  - `repository/`: ejecuta únicamente consultas SQL sobre `@libsql/client`.
  - `components/`: `Reloj` (`SystemReloj` / `FixedReloj`), `CalendarioHabil`, `Correo` (`FakeCorreo`), `HashPassword` (`node:crypto` `scryptSync` + `timingSafeEqual`).
  - `middleware/`: `autenticar` (`401`) y `soloBibliotecario` (`403`).
- **Frontend (`frontend/`):** React + Vite + TypeScript como cliente HTTP del backend (`src/api/`, `src/pages/`, `src/components/`). **No duplica reglas de negocio.**

---

## 2. Base de datos y justificación

Se utiliza **SQLite** mediante **`@libsql/client`**: en desarrollo y tests corre contra archivo local o `:memory:` (sin instalar motores externos) y en producción contra **Turso** (SQLite gestionado y persistente en la nube, evitando la pérdida de datos por disco efímero en Render). Permite transacciones de escritura e índices únicos parciales para garantizar concurrencia (`RN-12`).

---

## 3. Modelo de datos

1. **`usuario`**
   - `id` (INTEGER PK AUTOINCREMENT), `nombre` (TEXT), `email` (TEXT UNIQUE NOT NULL), `contrasena_hash` (TEXT NOT NULL), `rol` (TEXT NOT NULL: `'Alumno' | 'Docente' | 'Bibliotecario'`), `suspendido_hasta` (TEXT NULL ISO-8601), `creado_en` (TEXT NOT NULL).
2. **`sesion`**
   - `token` (TEXT PRIMARY KEY), `usuario_id` (INTEGER NOT NULL FK -> `usuario.id`), `creada_en` (TEXT NOT NULL).
3. **`titulo`**
   - `id` (INTEGER PK AUTOINCREMENT), `nombre` (TEXT NOT NULL), `autor` (TEXT NOT NULL), `isbn` (TEXT NULL), `creado_en` (TEXT NOT NULL).
4. **`ejemplar`**
   - `id` (INTEGER PK AUTOINCREMENT), `titulo_id` (INTEGER NOT NULL FK -> `titulo.id`), `codigo` (TEXT UNIQUE NOT NULL), `solo_en_sala` (INTEGER NOT NULL DEFAULT 0), `estado` (TEXT NOT NULL: `'disponible' | 'reservado' | 'prestado' | 'en_reparacion'`).
5. **`feriado`**
   - `fecha` (TEXT PRIMARY KEY, formato `YYYY-MM-DD`), `descripcion` (TEXT NOT NULL).
6. **`reserva`**
   - `id` (INTEGER PK AUTOINCREMENT), `usuario_id` (INTEGER NOT NULL FK), `titulo_id` (INTEGER NOT NULL FK), `ejemplar_id` (INTEGER NULL FK), `estado` (TEXT NOT NULL: `'confirmada' | 'desactivada' | 'retirada' | 'vencida' | 'cancelada'`), `creada_en` (TEXT NOT NULL), `vence_retiro_en` (TEXT NULL), `corrimiento_informado` (TEXT NULL), `desactivada_motivo` (TEXT NULL: `'suspension' | 'reparacion'`), `orden_cola_en` (TEXT NULL).
   - **Restricción crítica (`RN-12`):** `CREATE UNIQUE INDEX idx_reserva_ejemplar_activa ON reserva(ejemplar_id) WHERE estado = 'confirmada' AND ejemplar_id IS NOT NULL;`
7. **`cupo_penalizado`**
   - `id` (INTEGER PK AUTOINCREMENT), `usuario_id` (INTEGER NOT NULL FK), `reserva_id` (INTEGER UNIQUE NOT NULL FK), `penalizado_hasta` (TEXT NOT NULL), `creado_en` (TEXT NOT NULL).
8. **`prestamo`**
   - `id` (INTEGER PK AUTOINCREMENT), `reserva_id` (INTEGER UNIQUE NOT NULL FK), `usuario_id` (INTEGER NOT NULL FK), `ejemplar_id` (INTEGER NOT NULL FK), `retirado_en` (TEXT NOT NULL), `vence_en` (TEXT NOT NULL), `renovado` (INTEGER NOT NULL DEFAULT 0), `devuelto_en` (TEXT NULL), `dias_atraso` (INTEGER NOT NULL DEFAULT 0).
9. **`lista_espera`**
   - `id` (INTEGER PK AUTOINCREMENT), `titulo_id` (INTEGER NOT NULL FK), `usuario_id` (INTEGER NOT NULL FK), `reserva_desactivada_id` (INTEGER NULL FK -> `reserva.id`), `estado` (TEXT NOT NULL: `'esperando' | 'avisado' | 'confirmado' | 'expirado' | 'cancelado'`), `orden_en` (TEXT NOT NULL), `avisado_en` (TEXT NULL), `confirmar_hasta` (TEXT NULL).
   - **Restricción crítica (`RN-22`):** `CREATE UNIQUE INDEX idx_espera_usuario_titulo_activa ON lista_espera(titulo_id, usuario_id) WHERE estado IN ('esperando', 'avisado') AND reserva_desactivada_id IS NULL;`

---

## 4. API (Comunicación Frontend ↔ Backend)

| Método | Ruta | Qué hace | Acceso | HU |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Estado del servidor y BD | Público | Base |
| `POST` | `/usuarios` | Registro como `Alumno` | Público | `HU-01` |
| `POST` | `/entrada` | Login y entrega de token Bearer | Público | `HU-01` |
| `GET` | `/yo` | Perfil, rol, cupo usado y suspensión | Autenticado | `HU-01`, `HU-03` |
| `PATCH` | `/usuarios/:usuarioId/rol` | Cambia rol (`Alumno`/`Docente`/`Bibliotecario`) | Bibliotecario | `HU-07` |
| `GET` | `/usuarios` | Lista lectores para gestión admin | Bibliotecario | `HU-07` |
| `GET` | `/titulos` | Catálogo con disponibilidad y ejemplares en sala | Público | `HU-02` |
| `POST` | `/titulos` | Crea un título | Bibliotecario | `HU-07` |
| `POST` | `/titulos/:tituloId/ejemplares` | Agrega ejemplar prestable o solo en sala | Bibliotecario | `HU-07` |
| `PATCH` | `/ejemplares/:ejemplarId/reparacion` | Pasa ejemplar a/desde `en_reparacion` | Bibliotecario | `HU-07` |
| `GET` | `/feriados` | Lista feriados cargados | Público | `HU-07` |
| `POST` | `/feriados` | Carga un feriado (`YYYY-MM-DD`) | Bibliotecario | `HU-07` |
| `POST` | `/reservas` | Crea reserva online (48 h hábiles) | Autenticado | `HU-03` |
| `GET` | `/mis-reservas` | Reservas propias (incluye desactivadas) y penalidades | Autenticado | `HU-03`, `HU-06` |
| `DELETE` | `/reservas/:reservaId` | Cancela reserva propia confirmada o desactivada | Autenticado | `HU-03`, `HU-06` |
| `POST` | `/reservas/:reservaId/reactivar` | Reactiva reserva desactivada dentro de las 24 h hábiles | Autenticado | `HU-06` |
| `POST` | `/listas-espera` | Anota al usuario en lista de espera del título | Autenticado | `HU-06` |
| `GET` | `/mis-listas-espera` | Entradas y avisos pendientes de 24 h hábiles | Autenticado | `HU-06` |
| `POST` | `/listas-espera/:id/confirmar` | Confirma turno avisado (genera reserva de 48 h hábiles) | Autenticado | `HU-06` |
| `POST` | `/listas-espera/:id/rechazar` | Rechaza turno avisado y pasa al siguiente | Autenticado | `HU-06` |
| `GET` | `/reservas` | Lista reservas activas/pendientes para retiro | Bibliotecario | `HU-04` |
| `POST` | `/prestamos/retiro` | Registra retiro físico de reserva (`7`/`15` días hábiles) | Bibliotecario | `HU-04` |
| `GET` | `/prestamos` | Lista préstamos propios (lector) o todos/vencidos (admin) | Autenticado / Admin | `HU-04`, `HU-05` |
| `POST` | `/prestamos/:prestamoId/devolucion` | Registra devolución, calcula atraso y suspensión | Bibliotecario | `HU-04` |
| `POST` | `/prestamos/:prestamoId/renovar` | Renueva préstamo único (+5 días hábiles) | Autenticado | `HU-05` |

---

## 5. Dónde vive cada regla (`RN-01` a `RN-28`)

| Regla | Dónde vive |
| :--- | :--- |
| `RN-01`, `RN-02`, `RN-03` | `CatalogoService` + `TituloRepository` / `EjemplarRepository` |
| `RN-04`, `RN-05`, `RN-06` | `UsuarioService` + `HashPassword` + `UsuarioRepository` (email `UNIQUE`) + `loadInitialData` |
| `RN-07`, `RN-08` | `UsuarioService` / `CupoService` (tope 2/5 y suma de confirmadas + desactivadas + préstamos activos + penalidades) |
| `RN-09`, `RN-10`, `RN-11` | `ReservaService` + `CalendarioHabil` + `CupoPenalizadoRepository` + `ListaEsperaService` |
| `RN-12` | `ReservaRepository` (transacción write + índice único parcial `idx_reserva_ejemplar_activa`) + `ReservaService` (`409`) |
| `RN-13` | `ReservaService.cancelar` + `ListaEsperaService` |
| `RN-14`, `RN-15`, `RN-16` | `PrestamoService` + `CalendarioHabil` + `ListaEsperaRepository` |
| `RN-17`, `RN-18`, `RN-19` | `PrestamoService.devolver` + `UsuarioService` (suspensión tope 7 días) + `ReservaService.desactivarPorSuspension` |
| `RN-20`, `RN-21` | `ReparacionService` (reasigna otro disponible o pasa a `desactivada` + encola/notifica) + `Correo` |
| `RN-22`, `RN-23`, `RN-24`, `RN-25`, `RN-26`, `RN-27` | `ListaEsperaService` + `ListaEsperaRepository` + `CalendarioHabil` + `ReservaService` |
| `RN-28` | `Correo` (`FakeCorreo`) invocado por `ReservaService`, `PrestamoService`, `ReparacionService`, `ListaEsperaService` con `Reloj` |

---

## 6. Decisiones técnicas difíciles

1. **Concurrencia (`RN-12`):** Toda confirmación de reserva usa transacción de escritura en `@libsql/client` seleccionando un ejemplar `disponible` no `solo_en_sala` junto con el índice único parcial en `reserva(ejemplar_id)` para reservas `'confirmada'`. Si dos pedidos compiten por el último ejemplar, solo el primero logra insertarlo y cambiar el estado; el segundo recibe `409 Conflict`.
2. **Reloj y Calendario Hábil (`RN-10`, `RN-11`, `RN-15`, `RN-25`):**
   - `Reloj` usa `Intl.DateTimeFormat` con `timeZone: "America/Argentina/Buenos_Aires"` (nunca suma/resta `-3` manual). `FixedReloj` permite fijar y adelantar instantes en 1 ms en tests.
   - `CalendarioHabil` considera días no hábiles a sábados, domingos y fechas de la tabla `feriado`. Para ventanas de `24 h` o `48 h` hábiles avanza de a días hábiles (`1 día hábil` = +24 h saltando días no hábiles; `2 días hábiles` = +48 h saltando días no hábiles); para préstamos (`7`, `15` o `+5` días), si la fecha final cae en día no hábil la traslada al siguiente día hábil. Siempre devuelve `{ fechaLimite, corrimientoInformado, detalleCorrimiento }`.
3. **Vencimientos automáticos sin timers en segundo plano:** Un método `procesarVencimientos(ahora)` se ejecuta antes de operaciones de catálogo/reservas/préstamos/listas para vencer reservas de `48 h` (creando `cupo_penalizado` de 7 días), expirar avisos de `24 h` (cancelando definitivamente si era reserva `desactivada` para liberar cupo) y avisar al siguiente elegible en orden de `lista_espera`.
4. **Cola unificada (`RN-24`, `RN-25`, `RN-27`):** Las reservas `desactivada` mantienen su entrada en `lista_espera` con `reserva_desactivada_id` y su `orden_en` original. Al liberarse un ejemplar (o levantarse la suspensión del dueño), el primer elemento elegible (usuario no suspendido y sin préstamo vencido) recibe estado `'avisado'` con 24 h hábiles para `confirmar` o `reactivar`.
5. **Seguridad:** Contraseñas hasheadas con `node:crypto.scryptSync` + salt aleatorio (sin dependencias nativas C++), tokens aleatorios de 32 bytes y CORS en Render restringido a `FRONTEND_URL` (origen de Netlify).

---

## 7. Preguntas para el analista

Sin preguntas.
