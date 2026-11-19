# Tareas — BiblioCampus

Ordenadas por dependencia (no por número de HU). Cada tarea se trabaja de a una siguiendo el ciclo: `@tester` (rojo) -> `@backend`/`@frontend` (verde) -> `@revisor` (`APROBADO`) -> commit -> marcar `[x]`.

---

## Etapa 1 — Base

### T-01 — Proyecto backend y framework de tests
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Inicializar `backend/` con Node.js + TypeScript + Express, capas vacías (`controller/`, `service/`, `repository/`, `components/`, `middleware/`), `GET /health`, Vitest + Supertest y `.env.example` sin secretos.
- **Cubre:** Estructura del plan (`Base`)
- **Depende de:** ninguna
- **Terminada cuando:**
  1. `GET /health` responde `200` en un test de Supertest.
  2. Existen los scripts `dev`, `build` y `test` en `backend/package.json`.

### T-02 — Base de datos SQLite/Turso, migraciones y restricciones únicas
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Configurar cliente `@libsql/client` (soporte archivo/`:memory:` local y URL/token Turso por `.env`) y migración inicial con las 9 tablas e índices únicos parciales de `docs/plan.md`.
- **Cubre:** `RN-05`, `RN-12`, `RN-22`
- **Depende de:** `T-01`
- **Terminada cuando:**
  1. Al correr la migración en BD limpia de test existen las 9 tablas.
  2. Dos reservas `'confirmada'` para el mismo `ejemplar_id` fallan por restricción única, pero dos `'cancelada'` para el mismo `ejemplar_id` se guardan ambas.
  3. Dos entradas activas en `lista_espera` para el mismo usuario y título fallan; dos usuarios con el mismo `email` fallan.

### T-03 — `Reloj` del sistema y `CalendarioHabil`
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `Reloj` (`SystemReloj` y `FixedReloj` con `advanceTo` y zona `America/Argentina/Buenos_Aires` vía `Intl.DateTimeFormat`) y `CalendarioHabil` para calcular vencimientos de préstamos y ventanas hábiles de `24 h` / `48 h` saltando sábados, domingos y feriados e informando el corrimiento.
- **Cubre:** `RN-10`, `RN-11`, `RN-15`, `RN-25`
- **Depende de:** `T-02`
- **Terminada cuando:**
  1. `FixedReloj` fijado a las `23:30` de Argentina devuelve el día calendario argentino aunque en UTC ya sea el día siguiente.
  2. Una ventana de `48 h` hábiles iniciada un viernes `15:00` vence el martes `15:00` (saltando sábado y domingo) con `corrimientoInformado = true`.
  3. Un vencimiento de préstamo que cae en un feriado cargado se traslada al siguiente día hábil.

### T-04 — Componente `Correo` simulado y `HashPassword`
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar interfaz `Correo` + `FakeCorreo` en memoria con sello temporal desde `Reloj` y tipos de aviso de `RN-28`, más `HashPassword` con `node:crypto` (`scryptSync`).
- **Cubre:** `RN-04`, `RN-28`
- **Depende de:** `T-03`
- **Terminada cuando:**
  1. `FakeCorreo.send` guarda destinatario, tipo válido, mensaje e instante tomado de `Reloj` y rechaza tipos inválidos.
  2. `HashPassword.verify` valida correctamente el password contra el hash generado y el hash difiere del texto plano.

### T-05 — Carga inicial de bibliotecario administrador
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar carga idempotente al arranque del bibliotecario inicial tomando `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` desde `.env` (hasheada).
- **Cubre:** `RN-06`
- **Depende de:** `T-04`
- **Terminada cuando:**
  1. Al iniciar por primera vez, existe el usuario con rol `Bibliotecario` y contraseña hasheada.
  2. Al ejecutar la carga dos veces seguidas, no duplica el usuario ni falla.

### T-06 — Registro, sesión Bearer y cambio de rol (`HU-01`)
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `POST /usuarios` (`Alumno` por defecto, email único, sin devolver password/hash), `POST /entrada` (token Bearer en tabla `sesion`), `GET /yo`, middlewares `autenticar` (`401`) y `soloBibliotecario` (`403`), `GET /usuarios` y `PATCH /usuarios/:usuarioId/rol`.
- **Cubre:** `RN-04`, `RN-05`, `RN-06`, `RN-07`; `HU-01`, `HU-07`
- **Depende de:** `T-05`
- **Terminada cuando:**
  1. `POST /usuarios` crea `Alumno` (`201`), rechaza email duplicado (`409`) y nunca expone contraseña/hash.
  2. `POST /entrada` devuelve `token` (`200`) o `401` ante clave incorrecta; ruta protegida sin token responde `401` y ruta de bibliotecario con token `Alumno` responde `403`.
  3. `PATCH /usuarios/:id/rol` como `Bibliotecario` cambia un `Alumno` a `Docente`.

---

## Etapa 2 — Catálogo, ejemplares y feriados

### T-07 — Catálogo de títulos y ejemplares (`solo_en_sala` y prestables)
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `GET /titulos`, `POST /titulos` y `POST /titulos/:tituloId/ejemplares` diferenciando ejemplares prestables y `solo_en_sala`.
- **Cubre:** `RN-01`, `RN-02`, `RN-03`; `HU-02`, `HU-07`
- **Depende de:** `T-06`
- **Terminada cuando:**
  1. `GET /titulos` muestra por título la cantidad de prestables disponibles y el detalle de ejemplares `solo_en_sala`.
  2. Solo un `Bibliotecario` puede crear títulos y ejemplares (`403` si intenta un lector).

### T-08 — Gestión de feriados
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `GET /feriados` y `POST /feriados` (idempotente por fecha) conectados con `CalendarioHabil`.
- **Cubre:** `RN-10`, `RN-11`, `RN-15`, `RN-25`; `HU-07`
- **Depende de:** `T-07`
- **Terminada cuando:**
  1. Un feriado cargado por `POST /feriados` pasa a ser saltado automáticamente en cálculos de `CalendarioHabil`.
  2. Un lector común no puede cargar feriados (`403`).

---

## Etapa 3 — Reservas online, cupos y concurrencia

### T-09 — Crear reserva online con cupos, días hábiles y concurrencia
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `POST /reservas` y `GET /mis-reservas`: valida usuario sin suspensión/préstamo vencido, cupo (`2` alumno / `5` docente contando confirmadas, desactivadas, préstamos activos y penalidades vigentes), excluye `solo_en_sala`, asigna ejemplar disponible en transacción con vencimiento a `48 h` hábiles y envía correo.
- **Cubre:** `RN-02`, `RN-07`, `RN-08`, `RN-09`, `RN-10`, `RN-12`, `RN-13`, `RN-17`, `RN-28`; `HU-02`, `HU-03`
- **Depende de:** `T-08`
- **Terminada cuando:**
  1. Un `Alumno` con 2 reservas confirmadas falla al intentar una 3.ª (`409`/`422`); si intenta reservar un título que solo tiene ejemplares `solo_en_sala`, falla sin ocupar cupo.
  2. Dos `POST /reservas` simultáneos sobre el último ejemplar disponible confirman exactamente uno (`201`) y rechazan el otro (`409`).
  3. Una reserva confirmada el viernes informa `vence_retiro_en` el martes con `corrimientoInformado = true` y registra aviso en `FakeCorreo`.

### T-10 — Cancelación voluntaria y vencimiento de `48 h` con penalidad de 7 días
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `DELETE /reservas/:reservaId` (libera ejemplar si tenía y libera cupo) y expiración automática al vencer las `48 h` hábiles (libera ejemplar, crea `cupo_penalizado` por 7 días desde ese vencimiento y envía aviso por correo).
- **Cubre:** `RN-08`, `RN-11`, `RN-13`, `RN-28`; `HU-03`
- **Depende de:** `T-09`
- **Terminada cuando:**
  1. Al cancelar su reserva confirmada, el alumno vuelve a tener cupo `0/2` y el ejemplar queda `disponible`.
  2. Al avanzar el `FixedReloj` más allá de las `48 h` hábiles sin retiro, la reserva pasa a `vencida`, el ejemplar queda `disponible`, ese cupo queda ocupado durante 7 días (bloqueando un 2.º libro si ya tiene 1 préstamo) y pasada la semana el cupo vuelve a quedar libre.

---

## Etapa 4 — Préstamos, renovaciones y suspensiones

### T-11 — Retiro físico, devolución y suspensión por atraso
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `GET /reservas`, `POST /prestamos/retiro` (`7`/`15` días con ajuste hábil), `GET /prestamos` y `POST /prestamos/:prestamoId/devolucion` (calcula atraso en días, suspende `min(atraso, 7)` días, pasa reservas confirmadas pendientes del usuario a `desactivada` liberando el ejemplar temporalmente sin liberar cupo y envía aviso).
- **Cubre:** `RN-14`, `RN-15`, `RN-17`, `RN-18`, `RN-19`, `RN-28`; `HU-04`
- **Depende de:** `T-10`
- **Terminada cuando:**
  1. Retirar una reserva de `Docente` crea préstamo a 15 días trasladado si cae sábado/domingo/feriado.
  2. Devolver con 10 días de atraso aplica exactamente **7 días** de suspensión y cambia otra reserva confirmada pendiente del usuario a `desactivada` liberando el ejemplar pero conservando su cupo ocupado.
  3. Un usuario con un préstamo ya vencido sin devolver (o suspendido) no puede crear nuevas reservas ni retiros.

### T-12 — Renovación de préstamo activo
- **Estado:** `[x]` hecha
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `POST /prestamos/:prestamoId/renovar` (extiende +5 días ajustado al siguiente día hábil, máximo 1 renovación, solo antes del vencimiento, solo si usuario no está suspendido/sin vencidos y si no hay lista de espera activa en el título).
- **Cubre:** `RN-15`, `RN-16`, `RN-17`; `HU-05`
- **Depende de:** `T-11`
- **Terminada cuando:**
  1. Renovar antes de vencer sin lista de espera extiende `vence_en` en 5 días hábiles; intentar renovar una segunda vez falla (`409`).
  2. Renovar con al menos 1 usuario activo en la lista de espera del título (o con el préstamo ya vencido) es rechazado.

---

## Etapa 5 — Lista de espera unificada y reparaciones

### T-13 — Lista de espera, avisos de `24 h` hábiles y expiración en cadena
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `POST /listas-espera`, `GET /mis-listas-espera`, `POST /listas-espera/:id/confirmar` y `POST /listas-espera/:id/rechazar`, más asignación automática por orden de llegada (incluyendo reservas `desactivada` elegibles) al liberarse un ejemplar por devolución/cancelación/vencimiento; expiración de `24 h` hábiles (cancelando definitivamente las `desactivada` vencidas y liberando cupo) para pasar al segundo de la cola.
- **Cubre:** `RN-19`, `RN-22`, `RN-23`, `RN-24`, `RN-25`, `RN-26`, `RN-27`, `RN-28`; `HU-06`
- **Depende de:** `T-12`
- **Terminada cuando:**
  1. Anotarse en lista de espera sin ejemplar disponible no consume cupo y rechaza duplicados por mismo usuario/título.
  2. Al devolverse un ejemplar, el primero elegible recibe aviso con 24 h hábiles; si confirma a tiempo obtiene reserva normal de 48 h hábiles consumiendo cupo; si rechaza o pasan 24 h hábiles, pasa al segundo de la lista.
  3. Si el primero de la lista era una reserva `desactivada` (ya habilitada) y no reactiva/confirma en 24 h hábiles, la reserva pasa a `cancelada` definitivamente liberando su cupo y el ejemplar pasa al segundo.

### T-14 — Reparación de ejemplares y reactivación de reservas
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev backend
- **Qué hacer:** Implementar `PATCH /ejemplares/:ejemplarId/reparacion` y `POST /reservas/:reservaId/reactivar`: al pasar a reparación un ejemplar con reserva confirmada, intenta reasignar otro ejemplar disponible del mismo título (notificando); si no hay otro, pasa la reserva a `desactivada` (manteniendo cupo y orden en `lista_espera`) y envía aviso; al volver a `disponible` dispara la cola para reactivar dentro de las `24 h` hábiles.
- **Cubre:** `RN-20`, `RN-21`, `RN-24`, `RN-25`, `RN-26`, `RN-27`, `RN-28`; `HU-06`, `HU-07`
- **Depende de:** `T-13`
- **Terminada cuando:**
  1. Pasar a reparación un ejemplar reservado cuando existe otro ejemplar disponible reasigna la reserva automáticamente y envía correo.
  2. Cuando no hay otro ejemplar disponible, la reserva pasa a `desactivada` sin liberar cupo y envía correo; al sacar el ejemplar de reparación, el usuario puede reactivarla dentro de las 24 h hábiles (`POST /reservas/:id/reactivar`).

---

## Etapa 6 — Frontend React + Vite + TypeScript

### T-15 — Setup frontend, autenticación y catálogo público
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev frontend
- **Qué hacer:** Inicializar `frontend/` con React + Vite + TypeScript (con `VITE_API_URL` y `_redirects` para Netlify), cliente HTTP con token Bearer, páginas de Registro, Login y Catálogo (mostrando disponibles y ejemplares informativos «solo en sala», manejando aviso de espera inicial en Render si aplica).
- **Cubre:** `RN-01`, `RN-02`, `RN-04`, `RN-05`; `HU-01`, `HU-02`
- **Depende de:** `T-14`
- **Terminada cuando:**
  1. Build (`npm run build`) y tests básicos de render/flujo de autenticación pasan sin errores.
  2. Desde la interfaz se puede registrar usuario, iniciar sesión y visualizar el catálogo con disponibles y solo en sala.

### T-16 — Pantallas de lector (reservas, préstamos y lista de espera)
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev frontend
- **Qué hacer:** Pantallas para reservar ejemplar (mostrando fecha límite hábil y avisos de corrimiento), ver cupo ocupado/penalidades/suspensión, cancelar o reactivar reservas desactivadas, renovar préstamos activos y anotarse/confirmar/rechazar lista de espera.
- **Cubre:** `RN-07` a `RN-27`; `HU-03`, `HU-05`, `HU-06`
- **Depende de:** `T-15`
- **Terminada cuando:**
  1. El usuario ve sus cupos, estado de reservas (`confirmada`/`desactivada`/`vencida`), préstamos y alertas de 24 h / 48 h hábiles reflejando las respuestas de la API.
  2. `npm run build` y tests de interfaz pasan sin errores.

### T-17 — Panel de Bibliotecario
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev frontend
- **Qué hacer:** Vista administrativa protegida para cargar títulos/ejemplares, pasar ejemplares a/desde reparación, registrar retiros y devoluciones, cargar feriados y cambiar roles (`Alumno`/`Docente`/`Bibliotecario`).
- **Cubre:** `RN-01` a `RN-03`, `RN-06`, `RN-14`, `RN-18`, `RN-20`, `RN-21`; `HU-04`, `HU-07`
- **Depende de:** `T-16`
- **Terminada cuando:**
  1. Solo usuarios con rol `Bibliotecario` acceden al panel y ejecutan retiros, devoluciones, reparaciones, feriados y cambios de rol contra la API.
  2. `npm run build` y suite de tests completa pasan.

---

## Etapa 7 — Despliegue y documentación final de pruebas

### T-18 — Configuración de producción (Netlify + Render + Turso) e informe final
- **Estado:** `[ ]` pendiente
- **Agente:** Tester + Dev backend + Dev frontend
- **Qué hacer:** Configurar CORS con `FRONTEND_URL`, migración en arranque/script sobre Turso, configuración de `frontend/` para Netlify (`_redirects` y `VITE_API_URL`), `README.md` completo sin secretos e informe final de plan con evidencia de pruebas pasando.
- **Cubre:** Requisitos de entrega del Módulo 5
- **Depende de:** `T-17`
- **Terminada cuando:**
  1. Toda la suite de backend y frontend pasa al 100 % y `git status` no contiene `.env` ni `node_modules/`.
  2. El frontend en Netlify se comunica con el backend en Render y persiste datos en Turso.
