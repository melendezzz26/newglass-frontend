# HU-MAT-001 — Trazabilidad del material optimizado

Estado: IN REVIEW, dependencia de integración del [PR backend #5](https://github.com/melendezzz26/newglass-backend/pull/5). Auditoría inicial sobre frontend `39faf930b2ae9057cd66635494275417ea40d9af` y backend `2a9653a74e8d6b7175df31f89f533f700f0422bc`; implementación basada en frontend `d8ec96e4dc052fb1a64b16760b5f9a2b2c171d32`.

## Objetivo y alcance

Identificar cada fuente real y su código, tipo, piezas y sobrantes en resultados individuales y de los seis motores, también en historial y en desktop/mobile cuando el contrato lo permita. La representación pertenece a Andro; datos y backend pertenecen a Melendez. Se reutilizará el detalle de fuentes existente. No se modifican geometría ni inventario ni se inventan códigos.

## Auditoría del contrato

| Dato | Base de datos | Dominio | API de resultado | Frontend actual |
| --- | --- | --- | --- | --- |
| Identidad | `id_plancha` o `id_retazo`; plancha con cantidad | `source`, `material_id`, `physical_unit_index` | `material_source`, `material_id`, `stock_unit_index` | Sí, por fuente y unidad |
| Código real | `Retazo.codigo`; `Plancha` no tiene campo código | `StockCandidate` no incluye código | No | No; el ID mostrado no es el código de retazo |
| Tipo de fuente | Tablas separadas | `source` | `material_source` | Texto Plancha/Retazo |
| Dimensiones, vidrio y espesor | Sí | geometría, tipo, espesor | `geometria`, `id_tipo_vidrio`, `espesor_mm` | Sí |
| Piezas por fuente | Resultados persistidos | referencias por fuente/unidad | `placements` con la misma clave | Sí en detalle por fuente |
| Sobrante | `Retazo` creado al confirmar, con código e `id_ejecucion_origen` | regiones y fuente | `residual_regions` potenciales; confirmación contiene ID y origen, no código | Área potencial y recibo con ID y origen |
| Historial | Resultados y referencias persistidos | snapshot sin código de fuente | No aporta código de fuente | No puede recuperar código histórico desde el snapshot |

La clave compuesta diferencia fuentes dentro del resultado; no demuestra una identidad física permanente de cada plancha de una fila con cantidad. El código del sobrante se genera durante la confirmación, pero no se entrega en el recibo. Consultar inventario actual por ID no resuelve por sí solo la fidelidad histórica.

## Decisión y contrato pendiente

Se usa `Plancha #<id_plancha>` como identificador visual basado en la clave persistente, sin crear un código de negocio. El PR backend captura el código real de retazo en snapshots nuevos, porque el inventario permite editarlo; los snapshots anteriores conservan su formato y muestran el ID si no incluyen código. Los sobrantes solo reciben código al crearse y confirmarse. No hay migración. El frontend requiere integrar el PR backend antes de quedar listo para revisión funcional conjunta.

## Criterios de aceptación

- CA-01 código real de cada fuente visible; CA-02 tipo Plancha/Retazo en texto.
- CA-03 piezas ligadas a la fuente correcta; CA-04 múltiples fuentes diferenciadas.
- CA-05 sobrante vinculado y código solo tras persistencia cuando exista.
- CA-06 cambio de motor actualiza la trazabilidad; CA-07 resultado individual según alcance.
- CA-08 desktop; CA-09 acceso mobile; CA-10 pruebas automatizadas y evidencia real.

La ejecución sintética real, capturas y límites están registrados en `docs/evidence/HU-MAT-001/README.md`. EN-UX-002 está en PR #7 y no forma parte de la base `main` auditada.
