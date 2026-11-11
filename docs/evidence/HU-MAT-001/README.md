# HU-MAT-001 — evidencia

Arquitectura cliente-servidor: frontend [PR #11](https://github.com/melendezzz26/newglass-frontend/pull/11) contra backend [PR #5](https://github.com/melendezzz26/newglass-backend/pull/5), con PostgreSQL 16 temporal. Las fotografías son capturas reales de Chromium con datos sintéticos; no se utilizó producción.

Frontend con backend propuesto `aebaf6e3e7e956d21ebac87f7656daecee4ad120`, PostgreSQL 16 temporal y datos sintéticos creados por `tests.optimization_e2e_data`. En Chromium se creó un pedido por escenario, se ejecutó comparación real y se consultaron los seis resultados FF, BF, WF, HF, M5 y M6-BS. Se cambió por las seis pestañas y se comprobó la fuente visible; el código del retazo procedió del resultado HTTP real. Las capturas son de la interfaz ejecutada, no mockups.

- `plancha-desktop.png`, `plancha-mobile.png`: Plancha #702.
- `retazo-desktop.png`, `retazo-mobile.png`: código real de retazo, piezas y sobrante potencial.
- Prueba Playwright reproducible: `tests/e2e/optimization-comparison.spec.js`, casos HU-MAT-001 en proyectos desktop/mobile. El CI usa el SHA exacto del backend propuesto.
- Unitarias: 215 PASS. Componentes: 631 PASS. Lint y build PASS. Build informa chunk >500 kB.
- Backend: 143 PASS en regresión previa; en esta ejecución, 28 PASS focalizadas de snapshot, modificación posterior del código y confirmación con PostgreSQL.

## Dos fuentes y sobrantes confirmados

El pedido sintético #4 contiene dos unidades de 60 × 50 mm. La comparación #3, motor FF, usó el retazo `E2E-af0eaa1972` (ID 8) y la plancha #705, cada uno de 100 × 50 mm. Cada fuente recibió una unidad distinta. Antes de confirmar, el detalle mostró únicamente áreas recuperables potenciales; después de confirmar se consultó la comparación en historial y el recibo mostró los sobrantes `FF-3-R8-1` y `FF-3-P705-1` vinculados a sus fuentes. La prueba contrastó sus códigos e IDs del recibo HTTP con el inventario persistido.

- `fuentes-multiples-desktop.png` y `fuentes-multiples-mobile.png`: fuentes, piezas y selector de fuente antes de confirmar.
- `sobrante-confirmado-desktop.png` y `sobrante-confirmado-mobile.png`: historial confirmado, fuentes, piezas y recibo. Los IDs del escenario móvil pertenecen a su propia ejecución aislada y pueden diferir.
- E2E focalizado: `HU-MAT-001: dos fuentes reales y sobrantes confirmados conservan su origen`, PASS en desktop y mobile. La prueba está en `tests/e2e/optimization-comparison.spec.js`.

## Límites

`Plancha #ID` es una etiqueta basada en la clave persistente, no un código comercial. Los snapshots históricos anteriores pueden no contener el código congelado del retazo: se muestra el ID disponible, sin consultar el código editable actual. Mobile valida acceso a la información; NewGlass sigue orientado principalmente a escritorio. El código de un sobrante aparece únicamente tras su persistencia. El PR backend aún está pendiente de integración.
