# Reglamento de Trabajo — BiblioCampus

## 1. El proyecto
BiblioCampus es un sistema web para gestionar el catálogo, reservas online de 48 h hábiles, préstamos, lista de espera unificada (24 h hábiles), reparaciones y suspensiones por atraso de una biblioteca educativa.

## 2. Documentos
- `docs/idea.md`, `docs/decisiones.md`, `docs/glosario.md`, `docs/preguntas-abiertas.md`: relevamiento y definiciones previas.
- `docs/spec.md`: **fuente de verdad funcional** (`RN-01` a `RN-28`, `HU-01` a `HU-07`).
- `docs/plan.md` y `docs/tasks.md`: diseño técnico aprobado y lista de tareas ordenadas por dependencias.

## 3. Stack técnico
- **Backend:** Node.js + TypeScript + Express en 3 capas (`Controller`, `Service`, `Repository`), tests con Vitest + Supertest.
- **Base de datos:** SQLite vía `@libsql/client` (archivo local / `:memory:` en desarrollo y tests; Turso en producción).
- **Frontend:** React + Vite + TypeScript (desplegable en Netlify).
- **Producción:** Netlify (frontend) + Render (backend) + Turso (BD).

## 4. Reglas para todos los agentes
- Antes de actuar, leer `docs/spec.md` y `docs/glosario.md`.
- No inventar reglas. Si algo no está en la spec, frenar y preguntar.
- Cada cambio cita la `RN` o `HU` que cumple.
- Solo `@analista` modifica `docs/spec.md`, `docs/decisiones.md` y `docs/glosario.md`. Los demás reportan problemas.
- Cambios chicos: una tarea por vez. No tocar archivos fuera del área propia.
- Si un pedido contradice la spec, avisar antes de hacer nada.
- Usar los términos del glosario, también en los nombres del código.
- Al terminar, listar los archivos tocados y las `RN` o `HU` que cubren.

## 5. Ciclo por tarea
1. `@tester`: escribe tests desde el criterio de terminado -> corren en rojo.
2. `@backend` / `@frontend`: implementa hasta ponerlos en verde (**nunca modifica ni borra tests**).
3. `@revisor`: audita contra `spec.md`, `plan.md` y `tasks.md` -> `APROBADO` o `RECHAZADO`.
4. `git commit` indicando la tarea.
5. Marcar `[x]` en `docs/tasks.md` y commitear.

## 6. Agentes disponibles
| Agente | Responsabilidad | Reglas |
| :--- | :--- | :--- |
| Analista | Mantiene `spec.md`, `decisiones.md` y `glosario.md` | `.cursor/rules/analista.mdc` |
| Arquitecto | Define arquitectura, BD, `plan.md` y `tasks.md` | `.cursor/rules/arquitecto.mdc` |
| Dev backend | Implementa servidor, DB y reglas en `backend/` | `.cursor/rules/backend.mdc` |
| Dev frontend | Implementa pantallas en `frontend/` | `.cursor/rules/frontend.mdc` |
| Tester | Escribe y corre tests contra `spec.md` y `tasks.md` | `.cursor/rules/tester.mdc` |
| Revisor | Inspecciona en solo lectura y emite veredicto | `.cursor/rules/revisor.mdc` |
