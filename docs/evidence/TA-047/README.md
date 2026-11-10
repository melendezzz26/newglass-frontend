# TA-047 — Evidencia frontend

Base `816aeddbbd85afca7a5d3ad50dbf37d464a03030`; backend propietario del preflight: `newglass-backend`. La prueba RED reprodujo que, ante un rechazo definitivo 422, la comparación anterior seguía en memoria pero su identificador en almacenamiento quedaba nulo y no podía restaurarse al recargar. GREEN: se conserva el historial y su perfil; la prueba recarga dos veces. Los errores 422 de falta de stock y pieza sin encaje permiten corregir selección y reintentar. Los transportes v1 y v2 conservan la señal `request_accepted: false` para 503 de preflight.

Windows Node 26.13.0: `npm run test:unit` 215 PASS; `npm run test:component` 618 PASS sobre la versión actual; pruebas focalizadas de ciclo de vida y diagnóstico 20 PASS; `npm run lint` y `npm run build` PASS. El build advierte un chunk mayor de 500 kB. CI y regresión E2E completos dependen de los checks del PR; no se reportan como PASS hasta observarlos.
