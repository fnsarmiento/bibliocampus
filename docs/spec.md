# Especificación — BiblioCampus

## 1. Objetivo

Sistema web para gestionar el catálogo, las reservas online, los préstamos a domicilio, la lista de espera y las sanciones de una biblioteca educativa. Evita reservas simultáneas sobre un mismo ejemplar, controla cupos y vencimientos en días hábiles según rol y automatiza los avisos al lector.

---

## 2. Usuarios y roles

- **Usuario no registrado:** consulta el catálogo público (títulos y ejemplares disponibles o solo en sala) y se registra.
- **Alumno:** rol por defecto al registrarse; tiene cupo máximo de 2 y préstamos de 7 días. Puede reservar, cancelar, reactivar reservas desactivadas, anotarse/confirmar en lista de espera y renovar préstamos.
- **Docente:** lector promovido por el bibliotecario; tiene cupo máximo de 5 y préstamos de 15 días, con las mismas operaciones de lectura.
- **Bibliotecario (administrador):** carga títulos y ejemplares (incluidos «solo en sala» y «en reparación»), registra retiros y devoluciones, carga feriados y cambia roles de usuarios.

---

## 3. Alcance

### Entra
- Registro con email único (`Alumno` por defecto) y entrada con sesión por token; bibliotecario inicial por variables de entorno.
- Catálogo público de títulos y estado por ejemplar (`solo en sala` informativo, sin reserva online).
- Reserva online con concurrencia segura, plazo de 48 horas hábiles para retiro y penalidad de cupo de 7 días si no se retira.
- Retiros y devoluciones presenciales registrados por el bibliotecario, ajuste automático de vencimientos a días hábiles y renovación única de 5 días.
- Atrasos con suspensión de 1 día por día de demora (tope 7 días), paso de reservas a estado `desactivada` sin liberar cupo y prioridad en lista de espera (24 horas hábiles para confirmar/reactivar).
- Reparación de ejemplares con intento de reasignación automática o paso a `desactivada` + aviso por email.

### Queda afuera
- Cobro monetario online o multas económicas.
- Envío de correos reales vía SMTP productivo (usa componente simulado `Correo`).
- Préstamos a domicilio de ejemplares marcados como «solo en sala».

---

## 4. Reglas de negocio

### Catálogo y ejemplares
- **RN-01:** Cada título puede tener cero, uno o más ejemplares físicos identificados de forma única.
- **RN-02:** Un ejemplar marcado como «solo en sala» se muestra en el catálogo solo de forma informativa y no puede reservarse ni prestarse a domicilio.
- **RN-03:** Todo ejemplar prestable está exactamente en uno de cuatro estados: `disponible`, `reservado`, `prestado` o `en_reparacion`.

### Usuarios y autenticación
- **RN-04:** El registro solicita nombre, email único y contraseña (almacenada como hash, nunca en texto plano) y asigna el rol `Alumno` por defecto.
- **RN-05:** No pueden existir dos usuarios con el mismo email.
- **RN-06:** El bibliotecario inicial se crea en el arranque desde variables de entorno (`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`); un bibliotecario puede cambiar el rol de otros usuarios (`Alumno`, `Docente`, `Bibliotecario`).
- **RN-07:** Los alumnos tienen un cupo máximo simultáneo de **2**; los docentes tienen un cupo máximo simultáneo de **5** (y el bibliotecario también puede operar bajo reglas de lector o como admin según su rol de consulta/gestión).

### Cupo, reservas online y días hábiles
- **RN-08:** El cupo ocupado de un usuario suma: sus reservas confirmadas pendientes de retiro, sus reservas en estado `desactivada`, sus préstamos activos y sus cupos penalizados vigentes.
- **RN-09:** Una reserva online confirmada ocupa **1 cupo** desde el momento de su confirmación.
- **RN-10:** Una reserva confirmada otorga **48 horas hábiles** para retirar el ejemplar en la biblioteca; las ventanas hábiles saltan sábados, domingos y feriados cargados, e informan explícitamente al usuario el vencimiento real y si hubo corrimiento.
- **RN-11:** Si vence el plazo de 48 horas hábiles sin que se registre el retiro, la reserva pasa a `vencida`, el ejemplar vuelve a estar `disponible` (o se ofrece a la lista de espera) y **1 cupo del usuario queda penalizado durante 7 días**.
- **RN-12:** Si dos o más usuarios intentan reservar simultáneamente el último ejemplar `disponible` de un título, solo una reserva se confirma; las demás reciben rechazo por falta de disponibilidad.
- **RN-13:** Un usuario puede cancelar voluntariamente su propia reserva confirmada o desactivada mientras no haya vencido ni pasado a préstamo, liberando inmediatamente el ejemplar (si tenía uno asignado) y su cupo.

### Préstamos y renovaciones
- **RN-14:** Al registrar el bibliotecario el retiro físico de una reserva confirmada vigente, la reserva pasa a préstamo activo con plazo base de **7 días** para alumnos y **15 días** para docentes.
- **RN-15:** Si el vencimiento de un préstamo cae sábado, domingo o feriado, se traslada automáticamente al siguiente día hábil y se informa al usuario.
- **RN-16:** Un préstamo activo puede renovarse **1 sola vez** por **5 días adicionales** (ajustado al siguiente día hábil si cae fin de semana o feriado), siempre antes de su fecha de vencimiento y únicamente si **no hay usuarios activos esperando** en la lista de espera del título.

### Atrasos, suspensiones y reservas desactivadas
- **RN-17:** Un usuario con al menos un préstamo vencido sin devolver o con una suspensión vigente no puede crear reservas nuevas, retirar ejemplares, renovar ni anotarse en listas de espera.
- **RN-18:** Al devolver un préstamo después de su fecha de vencimiento, el usuario recibe una suspensión de **1 día por cada día calendario de atraso**, con un **tope máximo de 7 días**.
- **RN-19:** Al quedar suspendido (o tener un préstamo vencido), sus reservas confirmadas pendientes de retiro pasan a estado **`desactivada`**: liberan temporalmente el ejemplar asignado, **mantienen ocupado su cupo** y conservan su posición en la lista de espera del título para poder reactivarse al finalizar la sanción.

### Reparación de ejemplares
- **RN-20:** Si el bibliotecario pasa a `en_reparacion` un ejemplar que tenía una reserva confirmada pendiente de retiro, el sistema intenta reasignarle automáticamente otro ejemplar `disponible` del mismo título y notifica el cambio al usuario.
- **RN-21:** Si no hay otro ejemplar `disponible` al pasar a `en_reparacion`, la reserva pasa a estado **`desactivada`** (mantiene ocupado su cupo y conserva su lugar en la lista de espera) y se notifica por correo al usuario para que decida si reactivarla cuando vuelva a haber stock o cancelarla definitivamente.

### Lista de espera y prioridad unificada
- **RN-22:** Si un título no tiene ningún ejemplar prestable `disponible`, un lector habilitado puede anotarse en la lista de espera del título (una única entrada activa por usuario y título), ordenada por orden de llegada.
- **RN-23:** Estar anotado en la lista de espera sin reserva asignada no consume cupo.
- **RN-24:** Cuando un ejemplar vuelve a estar `disponible` (por devolución, vencimiento, cancelación o fin de reparación), la prioridad corresponde al **primero elegible de la lista de espera por orden de llegada**, posición en la que también compiten las reservas `desactivada` de usuarios ya habilitados (sin suspensión ni préstamo vencido).
- **RN-25:** Al notificarse la disponibilidad por correo, el primero elegible tiene **24 horas hábiles** (saltando fines de semana y feriados, informando al usuario) para **confirmar** (si estaba en espera) o **reactivar** (si tenía una reserva `desactivada`).
- **RN-26:** Si confirma dentro del plazo (y cuenta con cupo disponible) o reactiva su reserva `desactivada`, se le asigna el ejemplar como reserva confirmada con **48 horas hábiles** para retirar (`RN-10`, `RN-11`).
- **RN-27:** Si rechaza o transcurren las **24 horas hábiles** sin confirmar ni reactivar, sale de la cola (y si tenía una reserva `desactivada`, esta se **cancela definitivamente** liberando su cupo) y el turno pasa automáticamente al segundo elegible de la lista.

### Avisos
- **RN-28:** Todos los avisos (reserva confirmada con vencimiento hábil, vencimiento por no retiro con penalidad de cupo, turno disponible en lista de espera, suspensión aplicada y reparación con reasignación o desactivación) se envían a través del componente `Correo` con el instante del `Reloj` del sistema.

---

## 5. Historias de usuario y criterios de aceptación

### HU-01 — Registro e inicio de sesión
Como lector no registrado, quiero registrarme e iniciar sesión con email y contraseña para operar según mi rol (`Alumno`, `Docente` o `Bibliotecario`).
- **Dado** datos válidos con un email libre, **cuando** me registro, **entonces** se crea mi usuario con rol `Alumno`, contraseña hasheada y la respuesta nunca incluye la contraseña ni el hash (`RN-04`, `RN-05`).
- **Dado** un email ya registrado, **cuando** intento registrarme nuevamente, **entonces** el sistema rechaza la operación con conflicto sin duplicar la cuenta (`RN-05`).
- **Dado** credenciales válidas, **cuando** inicio sesión, **entonces** recibo un token de sesión válido para autenticar los pedidos posteriores (`RN-04`, `RN-06`).

### HU-02 — Consulta de catálogo y disponibilidad
Como usuario, quiero ver el listado de títulos y el estado de sus ejemplares para saber si puedo reservar online o solo consultar en sala.
- **Dado** un título con ejemplares prestables y ejemplares «solo en sala», **cuando** consulto el catálogo, **entonces** veo la cantidad prestable disponible y el detalle informativo de los ejemplares «solo en sala» (`RN-01`, `RN-02`, `RN-03`).
- **Dado** un ejemplar marcado como «solo en sala», **cuando** un usuario intenta reservarlo online, **entonces** el sistema rechaza la reserva sin descontar cupo (`RN-02`).

### HU-03 — Reserva online, vencimiento a 48 h hábiles y concurrencia
Como lector habilitado, quiero reservar online un ejemplar prestable disponible para retirarlo dentro de las 48 horas hábiles.
- **Dado** un alumno con cupo `0/2` y un ejemplar `disponible` un viernes a las 15:00, **cuando** confirma la reserva, **entonces** el ejemplar pasa a `reservado`, su cupo ocupado pasa a `1/2`, y la fecha límite de retiro salta el sábado y domingo informando el vencimiento hábil (`RN-07`, `RN-08`, `RN-09`, `RN-10`, `RN-28`).
- **Dado** dos alumnos reservando simultáneamente el único ejemplar disponible de un título, **cuando** llegan ambos pedidos al mismo tiempo, **entonces** solo una reserva se confirma y la segunda falla por falta de disponibilidad (`RN-12`).
- **Dado** una reserva confirmada cuyo plazo de 48 horas hábiles expiró sin retiro, **cuando** se procesa o verifica el vencimiento, **entonces** la reserva vence, el ejemplar se libera y ese cupo queda penalizado por 7 días con aviso por correo (`RN-11`, `RN-28`).

### HU-04 — Retiro físico, devolución y suspensión por atraso
Como bibliotecario, quiero registrar retiros y devoluciones de ejemplares para llevar el control real de préstamos y sanciones.
- **Dado** una reserva confirmada vigente de un docente, **cuando** el bibliotecario registra el retiro, **entonces** pasa a préstamo activo a 15 días (trasladado al siguiente día hábil si cae sábado, domingo o feriado) y se informa el vencimiento real (`RN-14`, `RN-15`).
- **Dado** un préstamo devuelto con 10 días de atraso y otra reserva pendiente de retiro del mismo usuario, **cuando** el bibliotecario registra la devolución, **entonces** el usuario queda suspendido por **7 días** (tope máximo), y su otra reserva pendiente pasa a `desactivada` liberando temporalmente el ejemplar pero conservando su cupo y su lugar en la lista (`RN-17`, `RN-18`, `RN-19`, `RN-28`).

### HU-05 — Renovación de préstamo
Como lector, quiero renovar mi préstamo activo por 5 días adicionales antes de que venza cuando no haya nadie esperando ese título.
- **Dado** un préstamo activo no renovado previamente y sin usuarios en lista de espera, **cuando** el lector solicita renovar antes del vencimiento, **entonces** el vencimiento se extiende 5 días (o al siguiente día hábil si cae fin de semana/feriado) (`RN-15`, `RN-16`).
- **Dado** un préstamo activo de un título con al menos 1 usuario en lista de espera (o ya renovado una vez), **cuando** el lector intenta renovar, **entonces** la renovación es rechazada (`RN-16`).

### HU-06 — Lista de espera, reservas desactivadas y reactivación
Como lector, quiero anotarme en la lista de espera o reactivar mi reserva desactivada cuando vuelva a haber un ejemplar disponible dentro de las 24 horas hábiles.
- **Dado** un título sin ejemplares disponibles, **cuando** un lector habilitado se anota en la lista de espera, **entonces** queda en orden de llegada sin consumir cupo (`RN-22`, `RN-23`).
- **Dado** un usuario primero en la lista (o con reserva `desactivada` en esa posición tras terminar su suspensión/reparación) al liberarse un ejemplar, **cuando** recibe el aviso de disponibilidad, **entonces** tiene 24 horas hábiles (saltando fines de semana y feriados, e informando) para confirmar o reactivar su reserva; si pasa el plazo sin hacerlo, se cancela definitivamente liberando el cupo y el turno pasa al segundo de la lista (`RN-24`, `RN-25`, `RN-26`, `RN-27`, `RN-28`).

### HU-07 — Gestión de reparaciones, feriados y roles (Bibliotecario)
Como bibliotecario, quiero administrar reparaciones de ejemplares, feriados y roles de usuarios para mantener las reglas del club/biblioteca al día.
- **Dado** una reserva confirmada sobre el ejemplar A y otro ejemplar B disponible del mismo título, **cuando** el bibliotecario pasa A a `en_reparacion`, **entonces** la reserva se reasigna automáticamente al ejemplar B y se avisa al usuario (`RN-20`, `RN-28`).
- **Dado** una reserva confirmada sobre el único ejemplar prestable disponible, **cuando** el bibliotecario lo pasa a `en_reparacion`, **entonces** la reserva pasa a `desactivada` conservando cupo y lugar en la lista, y se avisa por correo al usuario para que decida si reactivarla o cancelarla (`RN-21`, `RN-28`).
- **Dado** un usuario registrado como `Alumno`, **cuando** el bibliotecario cambia su rol a `Docente`, **entonces** sus nuevos préstamos pasan a 15 días y su cupo máximo a 5 (`RN-06`, `RN-07`).

---

## 6. Casos borde

1. **Reserva el viernes o víspera de feriado:** tanto las `48 h` para retirar como las `24 h` para confirmar/reactivar saltan sábado, domingo y feriados cargados, informando la fecha límite real (`RN-10`, `RN-25`).
2. **Atraso mayor a 7 días:** la suspensión se topea en `7 días` (`RN-18`).
3. **Renovación con lista de espera activa:** rechazada aunque sea la primera solicitud de renovación (`RN-16`).
4. **Reserva desactivada que no se reactiva en 24 h hábiles:** se cancela definitivamente, libera el cupo ocupado y pasa el ejemplar al segundo de la lista (`RN-27`).
5. **Dos reservas simultáneas sobre el último ejemplar:** solo una gana en transacción/base de datos; la segunda recibe `409` (`RN-12`).

---

## 7. Pendientes

Sin pendientes.
