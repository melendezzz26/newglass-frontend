# EN-CONC-001 · QA Compañero 2 — Frontend, multiusuario y staging

| Campo | Valor |
|---|---|
| Enabler | EN-CONC-001 (cola multiusuario, worker separado, progreso distribuido, FF durable) |
| Alcance QA | Frontend en modo histórico y distribuido, cuatro sesiones simultáneas, permisos por rol, staging en solo lectura |
| Responsable | Fabricio Aguilar |
| Rama | `test/EN-CONC-001-qa-frontend-multiusuario` (desde `main`) |
| Frontend probado | `main` @ `5cb33bb` (incluye PR #21, frontend multiusuario) |
| Backend probado | `main` @ `806cde3` (incluye PR #19 y #20); E2E del CI con el SHA fijado `2afa9d7` (`.github/backend-e2e.sha`) |
| Fecha | 2026-11-24 |
| Referencias | `newglass-backend/docs/specs/SPEC-EN-CONC-001.md`, `PLAN-EN-CONC-001.md`, `TASKS-EN-CONC-001.md`, ADR EN-CONC-001 (worker separado, fencing y recuperación, paralelismo controlado); `docs/specs/EN-CONC-001-frontend-multiusuario.md` |

## Resumen

La interfaz original se conserva en ambos modos y el flujo completo (seleccionar pedidos → comparar FF, BF, WF, HF, BRF (M5) y BS-2 (M6-BS) → resultados → inspectores 2D y 3D → liberar) funciona con el backend real en modo histórico y en el piloto mixto distribuido. El laboratorio de cuatro solicitantes pasa con una y con dos plazas, tanto del lado del navegador como de las comprobaciones en PostgreSQL. Los permisos se respetan en la API y en la interfaz.

La réplica Linux del job E2E del CI pasa 156/156 escenarios (gate TA-040 PASS). Los fallos de las E2E en Windows se deben a la plataforma: la API rechaza las comparaciones fuera de Linux.

**Staging no puede validar EN-CONC-001 todavía.** GitHub Pages publica un bundle del 11/11/2026 sin el PR #21. La API de staging no expone las cinco rutas nuevas y su `/health/ready` responde 503. Además, Heroku no tiene proceso worker ni systemd/cgroup para el modo distribuido. El despliegue requiere una decisión y una acción del equipo.

### Veredicto por punto

| # | Punto | Veredicto | Motivo |
|---|---|---|---|
| 1 | Regresión base frontend y backend | Cumple con observaciones | lint, build, 221 unitarias y backend (2888 passed, 0 failed) en verde. 1 prueba de componentes falla por timeout bajo carga; el fallo es preexistente e intermitente (H-05). |
| 2 | E2E escritorio y móvil | Cumple con observaciones | Linux con el backend del CI: 156/156 PASS. Windows: 30 fallos por plataforma (H-08). El CI fija un backend anterior a EN-CONC-001 (H-04): contra el backend `main` fallan B02 (H-11) y dos escenarios RBAC (H-12). La config `ta-qa-008` no se ejecutó. |
| 3 | Interfaz original intacta (histórico vs distribuido) | Cumple con observaciones | Pantallas idénticas en 1440×900 y 390×844. Las únicas diferencias son las previstas por la SPEC. La tabla de seis motores se ve apretada en móvil en ambos modos (H-06, preexistente). |
| 4 | Flujo completo seis motores | Cumple | Lo cubre B07 (E2E Linux) en modo histórico y la prueba QA en los dos modos, con capturas de cada paso. |
| 5 | Cuatro sesiones (WSL2) | Cumple | `multiuser.spec.js` y el arnés `lab.py` pasan con `NEWGLASS_BROWSER_CAPACITY=1` y `=2`. `ready.json` se borró al terminar. `progress-mock.spec.js` pasa. |
| 6 | Cancelación, recarga, reconexión y recuperación | Cumple | Las pruebas existentes están mapeadas. Se añadió el caso que faltaba en navegador: cancelar un trabajo **en espera** sin afectar el ajeno. |
| 7 | Permisos Administrador, Operario y Almacenero | Cumple con observaciones | 436 pruebas de autorización pasan con PostgreSQL real. La UI y la API respetan la matriz. El Administrador no ve ni cancela trabajos ajenos (H-10, decisión de equipo). |
| 8 | Staging (solo lectura) y checklist de despliegue | Bloqueado | Staging no tiene EN-CONC-001 (H-01) y no está listo (H-02). Sin credenciales autorizadas no se probó login, pedidos ni comparación. La checklist de despliegue está redactada. |

## Entorno y método

- **Windows 11** (PowerShell): Node 22.20.0, Python 3.11.9 (venv `optimizador-vidrio\backend\venv`), Playwright 1.63.0 con Chromium gestionado (`PLAYWRIGHT_CHANNEL=chromium`).
  - PostgreSQL 16.11 portable (zip oficial de EnterpriseDB), usado solo en clústeres temporales de prueba.
- **WSL2 Ubuntu 24.04** (kernel 6.18, systemd de usuario activo, cgroup v2 con `cpu memory pids` delegados, 32 CPU, 7,8 GB).
  - `sudo` pide contraseña, así que **no se instaló nada a nivel de sistema**. Todo quedó en `~/newglass-qa/`, que es desechable:
    - PostgreSQL 16.15 de Ubuntu, obtenido con `apt-get download` y extraído con `dpkg -x`. Se renombró `llvmjit.so` porque falta `libLLVM-17`; PostgreSQL funciona igual sin JIT.
    - Node 22.20.0 portable.
    - `libnss3`, `libnspr4` y `libasound2t64` extraídos para Chromium.
    - Clones aislados de frontend y backend, con un venv Linux en Python 3.12.3. El backend fija 3.11.9; es una diferencia del entorno, no del código.
- Bases de datos: siempre clústeres PostgreSQL temporales de loopback creados por los arneses del repositorio. Ningún comando usó `DATABASE_URL` compartida, Supabase ni Heroku.
- Usuarios: sintéticos de `tests/e2e_server.py` o efímeros de los arneses. Las credenciales efímeras se borraron con `ready.json`.
- Interfaz en Windows con Vite y `VITE_API_URL=/`. Cada contexto Playwright reenvía `/api` al backend de loopback en WSL2, igual que `multiuser.spec.js`.
- Scripts QA nuevos en [scripts/](scripts/):
  - [qa-ui.spec.js](scripts/qa-ui.spec.js) y [qa.playwright.config.js](scripts/qa.playwright.config.js): capturas por modo, flujo completo y roles.
  - [qa_lab.py](scripts/qa_lab.py): piloto mixto real, derivado de `tests/multiuser/lab.py`, con el FF del pedido del Operario retenido para que la cancelación sea determinista.

## Tabla de pruebas

| Punto | Comando (carpeta) | Resultado | Cantidad | Salida |
|---|---|---|---|---|
| 1 | `npm run lint` (frontend) | OK | 0 errores | [01](salidas/01-npm-lint.txt) |
| 1 | `npm run build` (frontend) | OK | aviso de chunk > 500 kB (preexistente) | [02](salidas/02-npm-build.txt) |
| 1 | `npm run test:unit` (frontend) | OK | 221 passed | [03](salidas/03-npm-test-unit.txt) |
| 1 | `npm run test:component` (frontend) | 1 failed | 657 passed / 1 failed (timeout 5 s) | [04](salidas/04-npm-test-component.txt) |
| 1 | misma prueba aislada ×3 | OK | 3/3 passed | [05](salidas/05-vitest-manual-v2-aislado.txt) |
| 1 | `npx vitest run` en `main` y en `6a00b9a` (antes de #21) | falla en ambos | 2 y 4 timeouts | [06](salidas/06-vitest-preexistente.txt) |
| 1 | `python -m pytest tests -q --ignore=…(3 del CI)` (backend, Windows) | OK | 2888 passed, 1021 skipped, 0 failed | resumen abajo |
| 1 | 3 pruebas solo Linux (`test_comparison_runner`, `test_sequential_runner`, `test_resource_profile`) en WSL2 | OK | 14 + 26 + 7 passed | [13](salidas/13-backend-linux-wsl2.txt) |
| 1 | `pytest tests` en un solo proceso con PostgreSQL obligatorio (WSL2) | 35 failed | 3866 passed / 35 failed. 33 están en archivos que el CI aísla en procesos propios y 2 son las copias de laboratorio que dejé en la carpeta | [15](salidas/15-backend-suite-linux-postgres.txt) |
| 1 | grupos aislados como en el CI del backend (`comparison_calculation`, `supervision_v2`, `queue_v2`, `http_restart` + `distributed_progress`) | OK | 8 + 32 + 6 + 24 passed | [16](salidas/16-backend-grupos-separados-ci.txt) |
| 2 | `node scripts/run-e2e-phases.js` en Windows (backend fijado) | FAIL | B02 2/2 fallan (503 de plataforma) y el script se detiene | [10](salidas/10-e2e-fases-backend-fijado.txt) |
| 2 | `npx playwright test --grep-invert "TA-043 B02 smoke"` en Windows | 30 failed | 124 passed / 30 failed, todos de comparación | [11](salidas/11-e2e-remaining-windows.txt) |
| 2 | `node scripts/run-e2e-phases.js` en Linux WSL2 (réplica del CI, backend `2afa9d7`) | **PASS** | 156/156; b02 = 2, remaining = 154 | [12](salidas/12-e2e-fases-linux-wsl2.txt) |
| 2 | mismo script con el backend `main` `806cde3` (no es lo que corre el CI) | FAIL | B02 2/2 fallan con login 500 (H-11) y el script se detiene | [14](salidas/14-e2e-fases-linux-backend-main.txt) |
| 2 | fase `remaining` con el backend `main` | 4 failed | 150 passed / 4 failed: dos escenarios RBAC × 2 proyectos (H-12) | [14b](salidas/14b-e2e-remaining-linux-backend-main.txt) |
| 3, 4, 7 | `QA_MODE=historico npx playwright test -c docs/evidence/…/scripts/qa.playwright.config.js` | OK | 3 passed, 1 skipped (roles solo en escritorio) | [62](salidas/62-qa-ui-historico.txt) |
| 3, 4, 6, 7 | `QA_MODE=distribuido …` + `qa_lab.py` en WSL2 | OK | 3 passed, 1 skipped; arnés 1 passed | [61](salidas/61-qa-ui-distribuido.txt), [60](salidas/60-qa-lab-distribuido-backend.txt) |
| 5 | `test_browser_frontend_lab.py` (copia de `lab.py`), capacidad 1 | OK | 1 passed | [31](salidas/31-lab-backend-capacidad-1.txt) |
| 5 | `npx playwright test -c tests/multiuser/playwright.config.js multiuser.spec.js`, capacidad 1 | OK | 1 passed | [41](salidas/41-multiuser-capacidad-1.txt) |
| 5 | arnés, capacidad 2 | OK | 1 passed | [32](salidas/32-lab-backend-capacidad-2.txt) |
| 5 | `multiuser.spec.js`, capacidad 2 | OK | 1 passed | [42](salidas/42-multiuser-capacidad-2.txt) |
| 5, 6 | `npx playwright test -c tests/multiuser/playwright.config.js progress-mock.spec.js` | OK | 1 passed | [20](salidas/20-progress-mock.txt) |
| 5 | `NEWGLASS_TEST_PARALLEL=1 pytest tests/integration/optimization/test_parallel_lab.py` | OK sin carga | 11 passed. Con carga de E2E en paralelo: 10 passed / 1 failed (H-09) | [13](salidas/13-backend-linux-wsl2.txt) |
| 7 | `pytest tests/api/authorization -v` con PostgreSQL (WSL2) | OK | 436 passed | [50](salidas/50-backend-autorizacion-roles.txt) |
| 6, 7 | `pytest test_comparison_queue_v2.py test_distributed_progress.py` con PostgreSQL | OK | 11 passed | [50](salidas/50-backend-autorizacion-roles.txt) |

Backend en Windows (punto 1): `2888 passed, 1021 skipped, 1 warning in 87.57s`. Las omitidas son pruebas API e integración que en Windows no tienen PostgreSQL. En WSL2 se ejecutaron con PostgreSQL obligatorio, separando los procesos igual que el CI del backend: el bloque general no tiene fallos fuera de los archivos aislados, y los grupos aislados pasan (filas 15 y 16).

## 1. Regresión base

- lint, build y unitarias en verde.
- Vitest: `ComparisonWorkspaceV2.test.jsx > manual v2 confirmation keeps history after reload` supera el límite de 5000 ms con la suite completa.
  - Aislada pasa 3/3.
  - En `6a00b9a`, antes del PR #21, fallan por el mismo límite esa prueba y otras dos.
  - Es **preexistente** y no se corrigió.
- Backend: 0 failed.

## 2. E2E escritorio y móvil

- La API rechaza en Windows las comparaciones de tres y seis motores: *"Se requiere Linux con procfs, RLIMIT_AS y prctl; en Windows, inicia el backend en WSL2"*.
  - Los 15 escenarios afectados (×2 proyectos) son B01, B02, B06, B07, B08, los tres HU-MAT-001, S2 ocho fuentes, tres motores BF, FF falla al persistir, rotación de 90°, consulta sin permisos, las dos políticas reales y EN-UX-004.
  - Todo lo demás pasa en Windows (124).
- En Linux, con el mismo script y el mismo SHA de backend que el CI, pasan **156/156** y el gate TA-040 da PASS. Los fallos de Windows son ambientales y **ninguno es nuevo**.
- Configs extra:
  - `playwright.optimization.config.js`, `playwright.hu015.config.js` y `playwright.dashboard.config.js` ejecutan `s1-optimization-ui`, `hu015-rasterization` y `ta-dashboard`. Esos specs ya están en `criticalSpecs.js` y pasaron dentro de las 156.
  - `playwright.ta-qa-008.config.js` (matriz de compatibilidad Chrome y Edge) no se ejecutó porque no es de EN-CONC-001 y necesita servidores externos. Queda pendiente.

## 3. Interfaz original intacta

Capturas 1440×900 y 390×844 de cada pantalla en [capturas/modo-historico/](capturas/modo-historico/) y [capturas/modo-distribuido/](capturas/modo-distribuido/). Los números coinciden en ambos modos:

| Paso | Histórico | Distribuido |
|---|---|---|
| Login | [escritorio](capturas/modo-historico/historico-desktop-01-login.png) · [móvil](capturas/modo-historico/historico-mobile-01-login.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-01-login.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-01-login.png) |
| Pedidos | [escritorio](capturas/modo-historico/historico-desktop-02-pedidos.png) · [móvil](capturas/modo-historico/historico-mobile-02-pedidos.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-02-pedidos.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-02-pedidos.png) |
| Optimización | [escritorio](capturas/modo-historico/historico-desktop-03-optimizacion.png) · [móvil](capturas/modo-historico/historico-mobile-03-optimizacion.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-03-optimizacion.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-03-optimizacion.png) |
| Seis motores en curso | [escritorio](capturas/modo-historico/historico-desktop-04-comparacion-en-curso.png) · [móvil](capturas/modo-historico/historico-mobile-04-comparacion-en-curso.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-04-comparacion-en-curso.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-04-comparacion-en-curso.png) |
| Comparación finalizada | [escritorio](capturas/modo-historico/historico-desktop-05-comparacion-finalizada.png) · [móvil](capturas/modo-historico/historico-mobile-05-comparacion-finalizada.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-05-comparacion-finalizada.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-05-comparacion-finalizada.png) |
| Tabla de seis motores | [escritorio](capturas/modo-historico/historico-desktop-06-tabla-seis-motores.png) · [móvil](capturas/modo-historico/historico-mobile-06-tabla-seis-motores.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-06-tabla-seis-motores.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-06-tabla-seis-motores.png) |
| Resultado FF 2D | [escritorio](capturas/modo-historico/historico-desktop-07-resultado-ff-2d.png) · [móvil](capturas/modo-historico/historico-mobile-07-resultado-ff-2d.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-07-resultado-ff-2d.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-07-resultado-ff-2d.png) |
| Inspector 2D | [escritorio](capturas/modo-historico/historico-desktop-08-inspector-2d.png) · [móvil](capturas/modo-historico/historico-mobile-08-inspector-2d.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-08-inspector-2d.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-08-inspector-2d.png) |
| Inspector 3D | [escritorio](capturas/modo-historico/historico-desktop-09-inspector-3d.png) · [móvil](capturas/modo-historico/historico-mobile-09-inspector-3d.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-09-inspector-3d.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-09-inspector-3d.png) |
| Recuperado tras recarga | [escritorio](capturas/modo-historico/historico-desktop-10-recuperado-tras-recarga.png) · [móvil](capturas/modo-historico/historico-mobile-10-recuperado-tras-recarga.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-10-recuperado-tras-recarga.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-10-recuperado-tras-recarga.png) |
| Pedidos liberados | [escritorio](capturas/modo-historico/historico-desktop-11-pedidos-liberados.png) · [móvil](capturas/modo-historico/historico-mobile-11-pedidos-liberados.png) | [escritorio](capturas/modo-distribuido/distribuido-desktop-11-pedidos-liberados.png) · [móvil](capturas/modo-distribuido/distribuido-mobile-11-pedidos-liberados.png) |

Diferencias visuales observadas:

1. **Ninguna en la estructura, los textos, los controles ni el estilo.** Encabezado, pestañas de los seis motores, selector "Métodos" (V1 por defecto en ambos), tabla, inspectores, recarga y liberación son iguales.
2. **Solo en distribuido, prevista por la SPEC:**
   - El trabajo puede mostrar el texto de cola *"El trabajo está guardado. Comenzará cuando haya una plaza de cálculo disponible."* y el estado de la pestaña *"Motor actual · Ejecutando"*.
   - La API de máscaras en vivo responde `410 VISUAL_DATA_UNAVAILABLE` (histórico: 200).
   - El inspector usa la distribución guardada, que se ve igual.
   - El contador "piezas colocadas · procesadas" de cada motor se muestra solo cuando hay resultado persistido.
3. **Diferencias que no dependen del modo:** nombre del usuario, número de piezas y el menú "Administración". Este último depende de los permisos del usuario sintético de cada backend.
4. **Igual en ambos modos (preexistente):** en 390 px la tabla "Métricas de 6 motores" parte las palabras y apila el botón "Ver patrón" letra por letra (H-06).

## 4. Flujo completo

- **Prueba automatizada existente:** `tests/e2e/optimization-comparison.spec.js` › *TA-043 B07 smoke: interfaz v2, seis distribuciones y recuperacion visual real*. Pasó en escritorio y móvil en la réplica Linux del CI. Cubre:
  - selección de pedido y seis motores;
  - tabla de métricas;
  - resultado 2D, inspector, 3D y máscaras de cada motor;
  - recuperación por clave;
  - liberación sin confirmar;
  - y un V1 de tres motores con su liberación.
- **Complemento QA en los dos modos** ([qa-ui.spec.js](scripts/qa-ui.spec.js), prueba *flujo completo*). Hace los pasos 01 a 11 de la tabla anterior y comprueba:
  - FF, BF, WF, HF, M5 y M6-BS completos;
  - 0 POST de admisión al recargar;
  - pedido `PENDIENTE` tras liberar;
  - 0 errores de página.
- En distribuido, la base temporal registró **0 movimientos de inventario** por las simulaciones. El único movimiento fue la confirmación explícita del Operario (punto 7).

## 5. Cuatro sesiones (evidencia de los cuatro usuarios)

Comprobaciones de WSL2:

- `wsl -l -v`: Ubuntu-24.04 versión 2.
- `systemctl --user is-system-running`: `running`.
- `stat -fc %T /sys/fs/cgroup`: `cgroup2fs`.
- `systemd-run --user --scope -p MemoryMax=100M true`: OK.
- `pg_config` no estaba instalado; se suplió con PostgreSQL extraído en espacio de usuario (ver Entorno).

El laboratorio se ejecutó como indica `EN-CONC-001-frontend-multiusuario.md`:

- `lab.py` copiado como `tests/integration/optimization/test_browser_frontend_lab.py` en una copia aislada del backend `806cde3`.
- `NEWGLASS_BROWSER_LAB` nuevo para cada ensayo.
- `NEWGLASS_BROWSER_CAPACITY=1` y después `=2`.
- `multiuser.spec.js` desde Windows.

Usuarios del laboratorio:

- A: Administrador, contra la API A.
- O: Operario, contra la API B.
- C y D: Operarios, contra las APIs A y B.
- L: Almacenero.

Qué se comprobó:

- Cada solicitante hace exactamente 1 POST V2.
- **Capacidad 1:** estados iniciales `RUNNING, WAITING, WAITING, WAITING`.
- **Capacidad 2:** estados iniciales `RUNNING, RUNNING, WAITING, WAITING`.
- Se reinicia la API A y las sesiones cambian de instancia. El navegador reconecta y lee el progreso con cursor desde la nueva API.
- A cancela su trabajo activo. El cierre queda verificado y **B avanza solo a la plaza liberada** (`RUNNING`). Con capacidad 2, C también avanza.
- B, C y D terminan 6/6. FF de B tiene visual 410 y distribución guardada.
- Almacenero: el stock comprometido devuelve 409, POST V2 y confirmar devuelven 403, y la UI no muestra "Comparar con los seis motores".
- FF durable: se pierde la primera respuesta, se recarga y se pulsa "Recuperar resultado" con la misma clave idempotente (2 POST, misma clave). Queda "Distribución lista".
- V1 legacy finaliza.
- Stock final 4 y 0 movimientos.
- Del lado de PostgreSQL, el arnés validó 6 trabajos `TERMINAL` (FF, V1 y 4 V2), generación 1, sin plaza, 6 intentos y 0 movimientos.

`ready.json` se borró al terminar cada ensayo.

| Escena | Capacidad 1 | Capacidad 2 |
|---|---|---|
| Ejecución (motor activo de A) | [v2-motor-activo](capturas/multiusuario-capacidad-1/v2-motor-activo.png) | [v2-motor-activo](capturas/multiusuario-capacidad-2/v2-motor-activo.png) |
| Espera en cola (C) | [v2-en-espera](capturas/multiusuario-capacidad-1/v2-en-espera.png) | [v2-en-espera](capturas/multiusuario-capacidad-2/v2-en-espera.png) |
| Cancelación verificada (A) | [v2-cancelado](capturas/multiusuario-capacidad-1/v2-cancelado.png) | [v2-cancelado](capturas/multiusuario-capacidad-2/v2-cancelado.png) |
| Avance automático y resultado (B) | [v2-resultado-ff](capturas/multiusuario-capacidad-1/v2-resultado-ff.png) | [v2-resultado-ff](capturas/multiusuario-capacidad-2/v2-resultado-ff.png) |
| FF durable recuperado | [ff-durable-recuperado](capturas/multiusuario-capacidad-1/ff-durable-recuperado.png) | [ff-durable-recuperado](capturas/multiusuario-capacidad-2/ff-durable-recuperado.png) |
| Almacén durante la optimización | [almacen-movimientos](capturas/multiusuario-capacidad-1/almacen-movimientos.png) | [almacen-movimientos](capturas/multiusuario-capacidad-2/almacen-movimientos.png) |

`progress-mock.spec.js` (sin base de datos) cubre:

- 429 con `Retry-After` de 2 s;
- 503;
- cursor vencido;
- `RECOVERY_BLOCKED`;
- 401, que vuelve al login;
- y un único POST.

Captura: [mock-recuperacion-bloqueada](capturas/progreso-simulado/mock-recuperacion-bloqueada.png).

## 6. Cancelación, recarga, reconexión y recuperación

| Caso | Cobertura | Resultado |
|---|---|---|
| Cancelación activa con cierre real (histórico) | `en-ux-004-cancel.spec.js` (E2E Linux) | PASS |
| Cancelación activa en piloto distribuido | `multiuser.spec.js` (A) · `qa-ui.spec.js` roles (Operario, [captura](capturas/modo-distribuido/distribuido-desktop-rol-operario-cancelado.png)) | PASS |
| **Cancelación de un trabajo en espera** sin afectar al ajeno | **Añadido**: `qa-ui.spec.js` roles. El Administrador queda `WAITING` detrás del Operario y cancela. Su pedido vuelve a `PENDIENTE` y el Operario sigue `RUNNING` ([en espera](capturas/modo-distribuido/distribuido-desktop-cola-admin-en-espera.png), [cancelado](capturas/modo-distribuido/distribuido-desktop-cola-admin-cancelado-en-espera.png)) | PASS |
| Recarga de página sin nueva admisión | `qa-ui.spec.js` en los dos modos (0 POST) · `ComparisonLifecycle` (*ambiguous start keeps its key… across reload*) · `multiuser.spec.js` (A recarga y sigue su trabajo) | PASS |
| Reconexión a otra instancia API o reinicio de API | `multiuser.spec.js` (`restart_a`, cambio de instancia, cursor leído desde el nuevo puerto) | PASS |
| Respuesta perdida en FF durable | `multiuser.spec.js` (misma `Idempotency-Key` al reintentar) · `UseDurableRun` (fallo temporal sin nueva admisión) | PASS |
| 429/503/cursor vencido/bloqueo/401 | `progress-mock.spec.js` · `tests/unit/distributedProgress.test.js` | PASS |
| Recuperación tras confirmación ambigua o liberación | `ComparisonLifecycle` (GET sin segundo POST; liberar vuelve a pendiente) | PASS |
| Recuperación de procesos sin cierre acreditado (backend) | `test_comparison_v2_http_restart.py` y `test_distributed_progress.py` (fila 16), `test_parallel_lab.py` (fila 13) | PASS |

## 7. Permisos

API con PostgreSQL real: `tests/api/authorization` da 436 passed (incluye `test_security_role_matrix.py`).

UI y API en optimización:

| Acción | Administrador | Operario | Almacenero |
|---|---|---|---|
| Ver la página Optimización | Sí | Sí | Sí (solo consulta) |
| Iniciar comparación (botón "Comparar…") | Sí | Sí | No: el botón no aparece y la API da 403 |
| Cancelar su propio trabajo | Sí (en espera, verificado) | Sí (activo, verificado) | No aplica |
| Confirmar | Sí (B08 E2E) | Sí: confirmó FF en el piloto, con 1 movimiento en la base temporal ([diálogo](capturas/modo-distribuido/distribuido-desktop-rol-operario-confirmar-dialogo.png), [confirmado](capturas/modo-distribuido/distribuido-desktop-rol-operario-confirmado.png)) | No: la API da 403 (`multiuser.spec.js`) |
| Liberar pedidos sin confirmar | Sí (flujo completo) | Sí (propios) | No aplica |
| Ver la comparación de otro usuario | **No: 404** (comparación y progreso) | No: 404 (`multiuser.spec.js`) | No: 404 |
| Cancelar la comparación de otro usuario | **No: 404** | No aplica | No aplica |

Capturas de roles:

- Histórico: [Administrador](capturas/modo-historico/historico-desktop-rol-administrador-optimizacion.png), [Operario](capturas/modo-historico/historico-desktop-rol-operario-optimizacion.png), [Almacenero](capturas/modo-historico/historico-desktop-rol-almacenero-optimizacion.png).
- Distribuido: [Administrador](capturas/modo-distribuido/distribuido-desktop-rol-administrador-optimizacion.png), [Operario](capturas/modo-distribuido/distribuido-desktop-rol-operario-optimizacion.png), [ejecución del Operario](capturas/modo-distribuido/distribuido-desktop-rol-operario-ejecucion.png), [Almacenero](capturas/modo-distribuido/distribuido-desktop-rol-almacenero-optimizacion.png).
- Datos crudos: [salidas/observaciones/](salidas/observaciones/).

Nota: el modo histórico usa los permisos reales de `seed_permissions`. El arnés distribuido usa los conjuntos efectivos del fixture de cola (`PERMISSIONS` en `test_comparison_queue_v2.py`).

## 8. Staging (solo lectura)

Solo se hicieron peticiones GET u OPTIONS sin autenticar, y un POST sin token que fue rechazado. No se usaron credenciales y no se cambiaron datos.

| Comprobación | Resultado |
|---|---|
| Frontend `https://melendezzz26.github.io/newglass-frontend/` | 200. `Last-Modified: Wed, 11 Nov 2026 15:28:04 GMT` |
| ¿Incluye EN-CONC-001 (#21)? | **No**. De 12 textos añadidos por #21, 9 faltan en el bundle publicado y los 12 están en un build local de `main`. |
| Modo del frontend publicado | **Histórico**. `deploy-pages.yml` solo inyecta `VITE_API_URL`; `VITE_OPTIMIZATION_MODE` no se define. |
| Despliegue de Pages | Solo `workflow_dispatch` desde `main`; no se ejecutó después de #20 y #21. |
| API que usa el bundle | `https://newglass-api-staging-5f52e8e9b00c.herokuapp.com` |
| `GET /health/live` · `GET /health/ready` | 200 · **503 `{"status":"not_ready"}`** |
| CORS desde Pages | `Access-Control-Allow-Origin: https://melendezzz26.github.io` |
| Rutas EN-CONC-001 en `/openapi.json` | **Faltan 5** respecto de `main`: `comparisons-v2/{id}/progress`, `comparisons-v2/{id}/queue`, `runs/durable`, `runs/durable/{id}`, `runs/durable/{id}/progress`. `POST /runs/durable` da 405. |
| Modo del backend | Legacy, anterior a EN-CONC-001 2A. Un solo proceso `web` (`Procfile`). |
| Login, carga de pedidos, comparación sin confirmar | **No ejecutado**: requiere credenciales reales de staging, que no se pidieron ni usaron. Pendiente para el equipo. |

### Checklist de despliegue del modo multiusuario (para decisión del equipo)

1. **Decisión previa (ADR):** el worker de EN-CONC-001 exige Linux con procfs y, para dos plazas, una slice systemd con cgroup v2 acreditada.
   - Los dynos de Heroku no ofrecen systemd de usuario ni delegación de cgroups.
   - La recuperación automática se apoya en `boot_id` y en el namespace PID, y los dynos se reinician con frecuencia.
   - Opciones:
     - (a) mantener staging en modo histórico;
     - (b) piloto mixto de **una plaza** con un dyno `worker` en Heroku, aceptando que un reinicio del dyno deje trabajos en `RECOVERY_BLOCKED` hasta revisión manual;
     - (c) worker en un host Linux con systemd.
2. **Procfile:** hoy solo existe `web: … uvicorn main:app … --workers 1`.
   - El modo distribuido necesita un proceso `worker` que ejecute `python -m app.modules.optimization.worker_v2`, con las mismas variables de memoria que `web`.
   - Para dos plazas se necesitan además `--lab-capacity 2 --lab-slice …`, que no es viable en Heroku.
3. **Variables (solo nombres):**
   - Backend: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `NEWGLASS_COMPARISON_QUEUE_CAPACITY` (1..100, por defecto 8), `NEWGLASS_COMPARISON_MAX_ACTIVE` (0 pausa, 1), `NEWGLASS_PROGRESS_MAX_READERS`, `NEWGLASS_PROGRESS_READS_PER_SECOND`.
   - Backend, ya presentes en el `Procfile`: `NEWGLASS_COMPARISON_SUPERVISOR_MIB`, `NEWGLASS_COMPARISON_WORKER_MIB`, `NEWGLASS_COMPARISON_AGGREGATE_MIB`, `NEWGLASS_DYNO_MEMORY_MIB`, `NEWGLASS_COMPARISON_LARGE_SECONDS`.
   - Backend, de EN-SEC-001: `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_ATTEMPT_WINDOW_MINUTES`, `LOGIN_LOCKOUT_MINUTES`, `FORWARDED_ALLOW_IPS`.
   - Frontend (GitHub Actions `vars`): `VITE_API_URL` y, solo si se elige (b) o (c), `VITE_OPTIMIZATION_MODE=distributed`. Hoy `deploy-pages.yml` no lo inyecta, así que habría que editar el workflow.
4. **Migraciones pendientes (en orden):** la base de staging puede estar antes de `s2sec01a1b2c`; verificarlo con `alembic current`. Las de este bloque son:
   - `s2sec01a1b2c` (EN-SEC-001);
   - `s2conc01b100` (worker separado);
   - `s2conc01b200` (fencing);
   - `s2conc01b210` (FF durable);
   - `s2conc01b300` (progreso distribuido);
   - `s2conc01b400` (plazas).

   Antes de migrar hay que respaldar y detener la admisión. El ADR indica que la reversión no es posible si ya existe historial operativo o el piloto está activo.
5. **Activación:** la activación es por base de datos, no por variable: `python -m app.modules.optimization.worker_v2 --enable-mixed`.
   - Afecta a todas las APIs conectadas a esa base.
   - El comando exige destino PostgreSQL de loopback, así que en Supabase no se puede ejecutar tal cual. **Bloqueante para el equipo.**
6. **Orden sugerido:**
   1. Backend `web` y `worker` de la misma versión.
   2. Migrar.
   3. Comprobar `/health/ready` = 200.
   4. Ejecutar `Deploy Pages Staging` (`workflow_dispatch`).
   5. Hacer el smoke de login, pedidos y comparación sin confirmar con un usuario de prueba.
7. **Antes de todo:** investigar el 503 actual de `/health/ready` en staging (logs de Heroku, revisión de Alembic).

## Hallazgos

| ID | Severidad | Hallazgo | Paso para reproducir | Preexistente |
|---|---|---|---|---|
| H-01 | Alta | Staging no contiene EN-CONC-001: Pages del 11/11 sin #21 y API sin las 5 rutas nuevas. | `curl -sI https://melendezzz26.github.io/newglass-frontend/` (Last-Modified) y comparar `/openapi.json` de staging con `app.openapi()` de `main`. | Despliegue pendiente |
| H-02 | Alta | `/health/ready` de staging responde 503 `not_ready`. | `curl -s https://newglass-api-staging-5f52e8e9b00c.herokuapp.com/health/ready` | Observado en esta QA (solo lectura; se desconoce desde cuándo) |
| H-03 | Media | El `Procfile` no tiene proceso `worker` y Heroku no ofrece systemd/cgroup; el modo distribuido no se puede desplegar tal cual. | Leer `Procfile` y el ADR de paralelismo. | Diseño |
| H-04 | Media | El E2E del CI frontend fija el backend `2afa9d7`, anterior a EN-CONC-001. El CI no ejerce el backend actual ni el modo distribuido, y `multiuser.spec.js` es manual. | `cat .github/backend-e2e.sha`; `git merge-base --is-ancestor 2afa9d7 806cde3`. | Sí |
| H-05 | Baja | `manual v2 confirmation keeps history after reload` supera 5000 ms con la suite completa. | `npm run test:component` en una máquina con carga. Aislada pasa. | Sí (`6a00b9a`) |
| H-06 | Baja (UX) | En 390 px la tabla "Métricas de 6 motores" parte palabras ("Com pleto"), apila "Ver patrón" en vertical y el encabezado fijo tapa el título. | Abrir la pestaña Comparación en 390×844, en cualquiera de los dos modos. | Sí (igual en histórico) |
| H-07 | Baja | Al cancelar un trabajo **en espera**, el mensaje dice "Se verificó el cierre de procesos", aunque nunca se lanzaron procesos. | `qa-ui.spec.js` roles, [captura](capturas/modo-distribuido/distribuido-desktop-cola-admin-cancelado-en-espera.png). | Nuevo (texto, no funcional) |
| H-08 | Info | En Windows las E2E de comparación fallan: la API exige Linux. Las E2E locales completas requieren WSL2. | `node scripts/run-e2e-phases.js` en Windows. | Sí (por diseño) |
| H-09 | Info | `test_parallel_lab.py::test_two_real_engines_and_three_users_cancel_and_handoff` falló una vez (CPU sumada 38,7 ms frente a 39,2 ms de intervalo) con carga externa. Sin carga pasa 11/11. | Ejecutar el laboratorio mientras corre otra suite pesada. | Sensible al entorno |
| H-10 | Observación | El Administrador no puede ver, seguir ni cancelar trabajos de otros usuarios (404). Es coherente con el aislamiento por propietario de la SPEC, pero no hay supervisión administrativa de la cola. | `qa-ui.spec.js` roles (observaciones JSON). | Diseño |
| H-11 | Media | Contra el backend `main`, la E2E B02 falla: tras `optimization_b02_upgrade --prepare` la base queda en `s2cmp01a1b2c` y el login actual (EN-SEC-001) consulta `intentos_login`, que no existe, y devuelve 500. Actualizar `backend-e2e.sha` a `main` rompería el gate TA-040. | En Linux, con `../backend` en `806cde3`: `node scripts/run-e2e-phases.js` (salida [14](salidas/14-e2e-fases-linux-backend-main.txt), `UndefinedTable: relation "intentos_login"`). | Nuevo; no es regresión de EN-CONC-001 (interacción B02 con EN-SEC-001) |
| H-12 | Media | Con el backend `main`, las corridas FF y las comparaciones V1 se leen solo por su propietario (`get_owned` / `require_owned`). Las E2E *consulta sin permisos de ejecución recupera resultados…* y *E2E8 RBAC real* esperan que un usuario `optimization.view` abra un trabajo creado por otro, y fallan (no aparece "Comparación finalizada" / "Distribución lista"). Es un cambio de contrato: el equipo debe decidir si el rol de consulta puede ver trabajos ajenos y ajustar la prueba o la API. | Fase `remaining` con `../backend` en `806cde3` (salida [14b](salidas/14b-e2e-remaining-linux-backend-main.txt)). | Nuevo al combinar frontend `main` con backend `main`; con el backend fijado pasa |

Ningún hallazgo bloquea el comportamiento funcional de EN-CONC-001 en local. H-01 a H-03 bloquean su validación en staging. H-11 y H-12 bloquean actualizar el backend que fija el E2E del CI.

## Pendientes con OK del equipo

1. Investigar el 503 de `/health/ready` y redesplegar en Heroku staging el backend `main` con sus migraciones. Está prohibido para esta QA: Heroku y Supabase.
2. Ejecutar `Deploy Pages Staging` desde `main` (`workflow_dispatch`).
3. Decidir el modo de staging (histórico, piloto de una plaza en Heroku o worker en un host Linux) y, si aplica, añadir el `worker` al `Procfile` y `VITE_OPTIMIZATION_MODE` al workflow de Pages, con su ADR.
4. Hacer el smoke funcional de staging con un usuario de prueba (login, carga de pedidos, comparación sin confirmar, liberar) cuando staging tenga EN-CONC-001.
5. Antes de actualizar `.github/backend-e2e.sha` a un SHA con EN-CONC-001, resolver H-11 (B02 frente a `intentos_login`) y H-12 (lectura de trabajos ajenos por el rol de consulta). Cada uno toca pruebas o contrato de otro compañero. Valorar también automatizar `multiuser.spec.js` en un runner Linux con systemd.
6. Ejecutar la matriz `ta-qa-008` (Chrome y Edge), fuera del alcance de EN-CONC-001.
7. Valorar los ajustes de UX de H-06 y del texto de H-07.

## Cómo reproducir

1. Frontend (Windows, raíz del repo): `npm ci`, `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:component`.
2. Backend (Windows, raíz de `newglass-backend`, venv activo): el comando del CI de §7 de las instrucciones del equipo.
3. Linux (WSL2) con PostgreSQL de espacio de usuario:
   - `export NEWGLASS_TEST_PG_BIN=~/newglass-qa/pg/usr/lib/postgresql/16/bin`
   - `export LD_LIBRARY_PATH=~/newglass-qa/pg/usr/lib/x86_64-linux-gnu:~/newglass-qa/libs/usr/lib/x86_64-linux-gnu`
   - `export NEWGLASS_REQUIRE_POSTGRES=1 PYTHON_DOTENV_DISABLED=1 PLAYWRIGHT_CHANNEL=chromium`
   - `node scripts/run-e2e-phases.js`
4. Laboratorio de cuatro sesiones: seguir `docs/specs/EN-CONC-001-frontend-multiusuario.md` con un `NEWGLASS_BROWSER_LAB` nuevo por ensayo. Borrar `ready.json` al terminar.
5. QA por modo:
   - Histórico: en WSL2, desde una copia del backend, `python -m tests.e2e_server` y `python -m tests.optimization_e2e_data single`, que siembra la configuración vigente. Después, en Windows, `QA_MODE=historico npx playwright test -c docs/evidence/sprint-02/EN-CONC-001-QA-frontend/scripts/qa.playwright.config.js`.
   - Distribuido: copiar `scripts/qa_lab.py` como `tests/integration/optimization/test_qa_frontend_lab.py`, ejecutarlo con `NEWGLASS_QA_LAB` y lanzar la misma config con `QA_MODE=distribuido`. Marcar `finish` al terminar y borrar `ready.json`.

Si WSL2 no tiene PostgreSQL y se prefiere instalarlo a nivel de sistema, los comandos (piden contraseña) son:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16 libpq-dev
pg_config --bindir
```
