# HU-MAT-001 — evidencia

Frontend con backend propuesto `aebaf6e3e7e956d21ebac87f7656daecee4ad120`, PostgreSQL 16 temporal y datos sintéticos creados por `tests.optimization_e2e_data`. En Chromium se creó un pedido por escenario, se ejecutó comparación real y se consultaron los seis resultados FF, BF, WF, HF, M5 y M6-BS. Se cambió por las seis pestañas y se comprobó la fuente visible; el código del retazo procedió del resultado HTTP real. Las capturas son de la interfaz ejecutada, no mockups.

- `plancha-desktop.png`, `plancha-mobile.png`: Plancha #702.
- `retazo-desktop.png`, `retazo-mobile.png`: código real de retazo, piezas y sobrante potencial.
- Prueba Playwright reproducible: `tests/e2e/optimization-comparison.spec.js`, casos HU-MAT-001 en proyectos desktop/mobile. El CI usa el SHA exacto del backend propuesto.
- Unitarias: 215 PASS. Componentes: 629 PASS; tras agregar el caso de fuentes múltiples, suite focalizada MaterialTrace: 7 PASS. Lint y build PASS. Build informa chunk >500 kB.
- Backend: 143 PASS en unitarias, API, persistencia y confirmación con PostgreSQL; además, prueba de seis motores con cambio posterior del código de inventario PASS.

No se obtuvo captura específica de múltiples fuentes ni de un sobrante confirmado. Los snapshots antiguos sin código muestran el ID; el PR backend sigue pendiente de integración.
