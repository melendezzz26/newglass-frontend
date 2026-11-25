# EN-CONC-001 · Frontend multiusuario

El modo `VITE_OPTIMIZATION_MODE=distributed` se habilita cuando el backend dispone del piloto mixto API y worker. El selector mantiene V1 como opción inicial y permite elegir V2 con los seis motores. La entrada histórica de FF individual usa la admisión durable en ese modo. El modo histórico, que se conserva por defecto, usa la observación NDJSON que ya soportaba el frontend. La selección de modo es operativa y no altera el número de plazas.

V2 y FF durable guardan la identidad de admisión y el último cursor aplicado en el navegador, por propietario y tipo de trabajo, sin guardar tokens ni resultados en esos registros. V2 recupera una admisión ambigua por su clave. FF durable permite reintentar el mismo cuerpo con la misma clave porque su contrato no define una consulta por clave. Cuando la identidad es conocida, la reconexión solo consulta estado. La cancelación V2 y la confirmación requieren una acción explícita y conservan las garantías del servidor.

La interfaz obtiene hitos mediante peticiones finitas de hasta 16 eventos. Recupera las páginas retenidas al expirar el cursor, respeta el intervalo del servidor y se detiene tras leer el cierre. Ante 429 o 503 aplica `Retry-After` si el navegador puede leerlo. El backend #20 entrega un segundo para las rutas de progreso y el cliente aplica ese intervalo cuando CORS no expone la cabecera. Para que el navegador lea un valor diferente en el futuro, servir `/api` en el mismo origen con el proxy existente de la instalación, o exponer `Retry-After` mediante CORS en el backend. `VITE_API_URL=/` usa las rutas API del origen del frontend.

El inspector abre las distribuciones guardadas en el contrato comercial. Las máscaras temporales y el stream visual en vivo quedan fuera del piloto. La interfaz muestra el estado del motor acreditado y las métricas persistidas. FF durable no dispone de una ruta pública para pedir cancelación.

## Pruebas

`npm run test:unit` valida el contrato de progreso, cursores, parada y reintentos. `npm run test:component` incluye el flujo de cancelación EN-UX-004, la recuperación V2 y el aislamiento entre propietarios. Validar también con `npm run lint` y `npm run build`.

La prueba Playwright que simula 429, 503, cursor vencido, recuperación bloqueada y 401 se ejecuta sin base de datos.

```sh
npx playwright test -c tests/multiuser/playwright.config.js progress-mock.spec.js
```

La prueba integrada utiliza el backend fusionado por PR #20. En una copia aislada del backend, copiar `tests/multiuser/lab.py` del frontend como `tests/integration/optimization/test_browser_frontend_lab.py`. El laboratorio requiere Linux con systemd de usuario, cgroup v2, Python del backend y binarios locales de PostgreSQL. Desde la raíz de esa copia, crear un directorio vacío accesible por WSL y por Playwright, y fijar el mismo directorio en `NEWGLASS_BROWSER_LAB` en ambas terminales, con la ruta apropiada a cada sistema. Usar un directorio nuevo para cada prueba. La capacidad `NEWGLASS_BROWSER_CAPACITY` puede ser `1` o `2`.

```sh
export NEWGLASS_REQUIRE_POSTGRES=1
export NEWGLASS_TEST_PG_BIN="$(pg_config --bindir)"
python -m pytest tests/integration/optimization/test_browser_frontend_lab.py -q
```

Desde el frontend, al aparecer `ready.json`, ejecutar `npx playwright test -c tests/multiuser/playwright.config.js multiuser.spec.js`. El navegador inicia sesión contra FastAPI. El adaptador Playwright reenvía las solicitudes a las instancias de loopback y permite cambiar de instancia sin cambiar el origen del navegador. La pérdida de la primera respuesta de FF ocurre después de la admisión real. Los permisos, eventos, geometría y stock llegan del backend real. El arnés verifica el número de intentos de ejecución y los movimientos de inventario directamente en PostgreSQL temporal. Los trabajos quedan sin confirmar. Ante un fallo del navegador, marcar `abort` en el directorio del ensayo para cerrar el laboratorio. Al terminar, retirar `ready.json`, que contiene solo credenciales efímeras de los usuarios sintéticos. Las capturas están en `test-results/multiuser-<capacidad>/`.

### Verificación local del 24 de noviembre de 2026

Se probó el backend `843caf492a3ed3eca93727fa2c91d1ec0c3dfbfa` y el frontend basado en `5cb33bb17ebfcae4296b7198832a643cae56083a` con los ajustes de pruebas de este cierre. El perfil de una plaza mostró un trabajo activo y tres en espera. El perfil de dos plazas mostró dos activos y dos en espera.

En ambos perfiles, cuatro propietarios iniciaron V2 sobre pedidos distintos y Almacén registró y editó una plancha independiente. El laboratorio comprobó aislamiento de resultados, cancelación con cierre acreditado, progreso después de reiniciar una API, recuperación de FF durable con la misma clave e historial V1. Los trabajos de simulación conservaron las existencias originales y generaron cero movimientos. Todo se ejecutó en PostgreSQL temporal con usuarios y pedidos sintéticos.

En escritorio y móvil se verificaron B02, B07 y los dos escenarios RBAC. B02 restaura la revisión actual antes de reanudar el tráfico HTTP. La prueba RBAC de comparación comprueba el `404` para un tercero y la lectura de su historial por el propietario tras revocar `optimization.execute`. B07 recupera los patrones persistidos en 2D y 3D y libera los pedidos sin consumir inventario.

El [informe TA-QA-008](../evidence/sprint-02/TA-QA-008/README.md) documenta la matriz de interfaz y conserva sus resultados en el entorno original.
