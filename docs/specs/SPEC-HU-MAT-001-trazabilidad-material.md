# HU-MAT-001 — Trazabilidad del material optimizado

Estado: IN REVIEW. [PR backend #5](https://github.com/melendezzz26/newglass-backend/pull/5) integrado en `a45120d2dd388aa9a66c767240dc65acbd146df5`; frontend actualizado con `main` `7ac91f811e0aca82378d8ca4d862b3ebd080d290`.

## Objetivo y alcance

Identificar cada fuente real y su código, tipo, piezas y sobrantes en resultados individuales y de los seis motores, también en historial y en desktop/mobile cuando el contrato lo permita. La representación pertenece a Andro; datos y backend pertenecen a Melendez. Se reutilizará el detalle de fuentes existente. No se modifican geometría ni inventario ni se inventan códigos.

## Auditoría del contrato

| Dato | Base de datos | Dominio | API de resultado | Frontend actual |
| --- | --- | --- | --- | --- |
| Identidad | `id_plancha` o `id_retazo`; plancha con cantidad | `source`, `material_id`, `physical_unit_index` | `material_source`, `material_id`, `stock_unit_index` | Sí, por fuente y unidad |
| Código real | `Retazo.codigo`; `Plancha` no tiene campo código | `StockCandidate.codigo` opcional | `codigo` de retazo cuando existe | Código real o ID histórico disponible |
| Tipo de fuente | Tablas separadas | `source` | `material_source` | Texto Plancha/Retazo |
| Dimensiones, vidrio y espesor | Sí | geometría, tipo, espesor | `geometria`, `id_tipo_vidrio`, `espesor_mm` | Sí |
| Piezas por fuente | Resultados persistidos | referencias por fuente/unidad | `placements` con la misma clave | Sí en detalle por fuente |
| Sobrante | `Retazo` creado al confirmar, con código e `id_ejecucion_origen` | regiones y fuente | `residual_regions` potenciales; recibo confirmado con ID, código y origen | Área potencial y recibo confirmado |
| Historial | Resultados y referencias persistidos | snapshot nuevo con código; anterior puede carecer de él | Código congelado cuando existe | Código congelado o ID histórico |

La clave compuesta diferencia fuentes dentro del resultado; no demuestra una identidad física permanente de cada plancha de una fila con cantidad. El código del sobrante se genera durante la confirmación y se entrega en el recibo. Consultar inventario actual por ID no resuelve por sí solo la fidelidad histórica.

## Decisión y contrato

Se usa `Plancha #<id_plancha>` como identificador visual basado en la clave persistente, sin crear un código de negocio. El backend captura el código real de retazo en snapshots nuevos, porque el inventario permite editarlo; los snapshots anteriores conservan su formato y muestran el ID si no incluyen código. Los sobrantes solo reciben código al crearse y confirmarse. No hay migración.

## Criterios de aceptación

- CA-01 código real de retazo o ID persistente de plancha visible; CA-02 tipo Plancha/Retazo en texto.
- CA-03 piezas ligadas a la fuente correcta; CA-04 múltiples fuentes diferenciadas.
- CA-05 sobrante vinculado y código solo tras persistencia cuando exista.
- CA-06 cambio de motor actualiza la trazabilidad; CA-07 resultado individual según alcance.
- CA-08 desktop; CA-09 acceso mobile; CA-10 pruebas automatizadas y evidencia real.

La ejecución sintética real, capturas y límites están registrados en `docs/evidence/HU-MAT-001/README.md`. La base actual integra EN-UX-002 y EN-UX-004.

La validación de dos fuentes usa una plancha y un retazo con una pieza por fuente; el selector se contrasta con cada referencia de colocación. Antes de confirmar se muestran áreas potenciales sin código de sobrante. Después de confirmar, el recibo muestra los códigos persistidos y su origen, verificados contra inventario; el historial distingue expresamente el corte confirmado de una simulación. Desktop y mobile acceden a la misma información. El backend #5 está fusionado y el smoke sobre su `main` pasó; el PR frontend queda sujeto a CI y revisión independiente.
