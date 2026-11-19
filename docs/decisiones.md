# Decisiones — BiblioCampus

Una decisión por línea. Cada una responde una duda del relevamiento funcional con el cliente.

## Reservas online y cupo

- **D-01:** Un usuario puede reservar online un ejemplar prestable disponible para pasar a buscarlo; no hace falta que el trámite inicie presencialmente.
- **D-02:** El plazo para retirar una reserva confirmada es de 48 horas desde que se crea la reserva (saltando fines de semana y feriados, e informando la fecha límite real al usuario).
- **D-03:** La reserva ocupa 1 cupo del usuario desde el momento en que se pide/confirma, no recién al momento del retiro físico.
- **D-04:** Si la reserva vence sin haber sido retirada, el ejemplar se libera y ese cupo queda ocupado/penalizado durante 7 días (1 semana).

## Renovaciones y lista de espera

- **D-05:** Una renovación extiende el vencimiento actual en 5 días corridos (luego ajustado al siguiente día hábil si cae fin de semana o feriado), y puede hacerse una sola vez antes del vencimiento y sin lista de espera en ese título.
- **D-06:** Cuando se libera un ejemplar y hay lista de espera, el primero elegible tiene 24 horas (saltando fines de semana y feriados, e informando al usuario) para confirmar o reactivar su pedido.
- **D-07:** Una vez que el usuario de la lista de espera confirma dentro del plazo, su pedido se transforma en una reserva normal: consume 1 cupo y tiene 48 horas para retirar (con la misma penalidad de 7 días si no lo busca).
- **D-08:** Si quien fue avisado en la lista de espera rechaza o deja pasar las 24 horas hábiles sin confirmar/reactivar, sale de la espera (y si era una reserva desactivada, se cancela definitivamente liberando su cupo) y el turno pasa al siguiente de la lista.

## Atrasos, suspensiones y reservas desactivadas

- **D-09:** Devolver un libro tarde genera 1 día de suspensión por cada día calendario de atraso respecto a la fecha de vencimiento, con un tope máximo de 7 días de suspensión.
- **D-10:** Durante una suspensión (o mientras tenga préstamos vencidos), las reservas pendientes de retiro del usuario pasan a estado «desactivada» sin liberar su cupo y conservando su lugar en la cola de espera del título para poder reactivarse al finalizar la sanción.

## Reparación y consulta en sala

- **D-11:** Si el bibliotecario marca «en reparación» un ejemplar que tenía una reserva pendiente de retiro, el sistema intenta reasignarle automáticamente otro ejemplar prestable disponible del mismo título.
- **D-12:** Si no existe otro ejemplar disponible al pasar el ejemplar a reparación, la reserva pasa a estado «desactivada» (mantiene su cupo y lugar en la lista) y se envía un email al usuario para que decida si desea reactivarla o cancelarla dentro de las 24 horas de volver a estar disponible.
- **D-13:** Los ejemplares marcados como «solo en sala» figuran en el catálogo web únicamente a título informativo: no admiten reservas online ni consumen cupo.

## Prioridad, ventanas hábiles y roles

- **D-14:** Una reserva «desactivada» no libera el cupo del usuario mientras está pausada, y conserva su posición en la lista de espera; cuando corresponde reasignarle disponibilidad (tras fin de reparación o fin de suspensión), tiene 24 horas para reactivarla o se cancela definitivamente.
- **D-15:** Al liberarse un ejemplar, la prioridad corresponde siempre al primero de la lista de espera (donde también mantienen su lugar las reservas desactivadas elegibles); si pasan 24 horas sin confirmar/reactivar, pasa al segundo.
- **D-16:** Las ventanas de 48 horas para retiro y 24 horas para confirmación/reactivación saltan sábados, domingos y feriados (solo corren sobre días hábiles) y ese corrimiento se informa explícitamente al usuario.
- **D-17:** El registro público crea usuarios con rol «Alumno» por defecto; solo el «Bibliotecario» puede promover a «Docente» o asignar rol «Bibliotecario».
- **D-18:** El bibliotecario inicial del sistema se crea automáticamente en el arranque usando credenciales de variables de entorno (`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`), guardando la contraseña con hash.
- **D-19:** Cada usuario registrado tiene un email único en el sistema; no pueden registrarse dos cuentas con el mismo email.
- **D-20:** Los usuarios con rol `Alumno` mantienen un cupo máximo simultáneo de 2 libros pero limitados a 1 ejemplar activo por título (para evitar que acaparen múltiples copias); solo `Docente` y `Bibliotecario` pueden pedir varias copias de un mismo título hasta su cupo de 5.
