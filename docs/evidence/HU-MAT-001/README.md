# HU-MAT-001 — evidencia

## Smoke post-merge — 11 de noviembre de 2026

- Backend `main`: `2afa9d72cecee74d4c61187ff15c74564e7dde3f`, contiene el merge del PR #5 `a45120d2dd388aa9a66c767240dc65acbd146df5`.
- Frontend funcional probado: `27093ad` (incluye merge de `main` `7ac91f811e0aca82378d8ca4d862b3ebd080d290`). El commit posterior de evidencia solo cambia documentación y capturas.
- Entorno aislado: PostgreSQL 16 temporal, backend real, Chromium y datos sintéticos. No se usó producción. El CI fija el backend al SHA indicado.
- Smoke Playwright: **6 PASS** en desktop y mobile. Plancha y retazo se comprobaron en FF, BF, WF, HF/M4, M5/BRF y M6/BS. Se comprobó el acceso a piezas y fuentes, y un escenario real de dos fuentes, confirmación e historial.
- En el escenario de dos fuentes, una plancha y un retazo reciben una pieza cada uno. El recibo de confirmación se contrasta con los IDs y códigos del inventario persistido y la UI muestra los códigos generados. Se vuelve a abrir la comparación en historial.
- Frontend: 217 pruebas unitarias y 645 de componentes PASS; lint y build PASS. El build advierte que un chunk supera 500 kB.
- La validación anterior de 28 pruebas focalizadas del backend cubrió snapshots nuevos y antiguos, cambio posterior del código y confirmación sobre `a45120d`. No se repitió esa suite en el backend más reciente; el smoke sí se repitió sobre `2afa9d7`.

Las ocho capturas son de la interfaz actual con datos sintéticos:

- `plancha-desktop.png`, `plancha-mobile.png`: identidad persistente de plancha.
- `retazo-desktop.png`, `retazo-mobile.png`: código real del retazo y piezas.
- `fuentes-multiples-desktop.png`, `fuentes-multiples-mobile.png`: fuentes y piezas antes de confirmar.
- `sobrante-confirmado-desktop.png`, `sobrante-confirmado-mobile.png`: historial y recibo después de confirmar.

La prueba reproducible está en `tests/e2e/optimization-comparison.spec.js`, casos HU-MAT-001. Los identificadores y códigos sintéticos pueden variar entre ejecuciones.

## Límites

`Plancha #ID` identifica la fila persistente; no es un código comercial ni una identidad física permanente de cada unidad de esa fila. Los snapshots anteriores pueden no incluir código congelado del retazo: se muestra el ID disponible sin atribuirle el código editable actual. Mobile valida el acceso a la información; NewGlass sigue orientado principalmente a escritorio. El código de un sobrante aparece únicamente tras su persistencia. CI del HEAD final y revisión independiente son gates separados de este smoke local.
