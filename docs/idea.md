# BiblioCampus — Idea del cliente (consolidada)

Somos una biblioteca educativa (escolar/universitaria). Hoy llevamos los préstamos en planillas y cuaderno, y es un caos: se pierden libros, dos personas reservan el mismo ejemplar y nadie avisa cuando se devuelve un título esperado. Queremos un sistema web para gestionar el catálogo, las reservas, los préstamos y las sanciones de forma ordenada.

## Catálogo y ejemplares

- Cada **título** (libro) puede tener múltiples **ejemplares** físicos identificados de manera individual.
- Algunos ejemplares son **solo para consulta en sala**: figuran en el catálogo web únicamente de manera informativa y no se reservan ni consumen cupo online.
- Los demás ejemplares son **prestables a domicilio**.
- Un ejemplar puede pasar a estado **en reparación** por decisión del bibliotecario.

## Usuarios y cupos

- Para reservar o pedir libros hay que registrarse con nombre, email único y contraseña. Todo registro público entra como **Alumno** por defecto.
- El **Bibliotecario** (administrador) gestiona roles (puede pasar un usuario a **Docente** o a **Bibliotecario**). El bibliotecario inicial se carga desde variables de entorno.
- **Alumnos:** tienen hasta **2 cupos** activos simultáneos a domicilio y préstamos de **7 días**.
- **Docentes:** tienen hasta **5 cupos** activos simultáneos a domicilio y préstamos de **15 días**.
- Cada reserva online confirmada ocupa **1 cupo** desde el momento en que se realiza (no al retirarla).

## Reservas online, retiro y días hábiles

- Un usuario puede reservar online un ejemplar prestable disponible para pasar a buscarlo.
- Tiene **48 horas hábiles** (saltando sábados, domingos y feriados, e informando al usuario la fecha límite exacta) para retirar el libro en la biblioteca.
- Si no retira el ejemplar dentro de ese plazo, la reserva vence, el ejemplar se libera y ese **cupo queda ocupado/penalizado durante 7 días**.

## Préstamos, vencimientos y renovaciones

- Si el vencimiento de un préstamo cae **fin de semana** o **feriado** cargado por el bibliotecario, se traslada automáticamente al siguiente **día hábil** y se informa en la reserva/préstamo.
- Un préstamo activo puede renovarse **1 sola vez** por **5 días adicionales** (ajustado al siguiente día hábil si cae fin de semana o feriado), siempre antes del vencimiento y **solo si no hay nadie en la lista de espera** para ese título.

## Atrasos, suspensiones y reservas desactivadas

- Mientras un usuario tenga un préstamo vencido sin devolver o esté suspendido, no puede crear reservas nuevas, retirar préstamos ni anotarse en listas de espera.
- Al devolver un libro con atraso, el usuario recibe **1 día de suspensión por cada día de atraso**, con un **tope máximo de 7 días**.
- Cuando un usuario queda suspendido (o tiene un préstamo vencido), sus reservas pendientes de retiro **no se eliminan definitivamente**: pasan a estado **desactivada**, conservando su cupo ocupado y su lugar en la lista de espera del título para después de la suspensión.

## Reparación de ejemplares

- Si el bibliotecario pasa a **reparación** un ejemplar que tenía una reserva pendiente de retiro, el sistema intenta **reasignarle automáticamente otro ejemplar disponible** del mismo título.
- Si no existe otro ejemplar disponible, la reserva pasa a estado **desactivada** (conserva su cupo y lugar en la lista) y se **avisa por email** al usuario para que decida si reactivarla o cancelarla dentro de las **24 horas hábiles** desde que vuelva a haber un ejemplar disponible.

## Lista de espera y prioridad

- Si todos los ejemplares prestables de un título están ocupados o en reparación, el usuario habilitado puede anotarse en la **lista de espera** por orden de llegada (sin consumir cupo hasta confirmar).
- Cuando vuelve a quedar disponible un ejemplar, la prioridad sigue el **orden de la lista** (donde también conservan su posición las reservas desactivadas cuyos dueños ya estén habilitados).
- El primero elegible recibe un aviso por email con **24 horas hábiles** (saltando fines de semana y feriados, e informándolo) para **confirmar** (si estaba en espera) o **reactivar** (si tenía reserva desactivada).
- Si confirma dentro de las 24 horas hábiles, pasa a reserva normal con **48 horas hábiles** para retirar. Si rechaza o vencen las 24 horas hábiles, se cancela definitivamente (liberando su cupo si era reserva desactivada) y el turno pasa al siguiente de la lista.

## Concurrencia y avisos

- Si dos usuarios intentan reservar al mismo tiempo el último ejemplar disponible, solo una reserva se confirma; la otra recibe rechazo y opción de lista de espera.
- Todos los avisos se registran por correo (simulado en entorno de desarrollo y tests).
