# Frontend de NewGlass

> **Repositorio independiente:** `melendezzz26/newglass-frontend`.
> Los comandos se ejecutan desde su raíz. La API se desarrolla en
> [newglass-backend](https://github.com/melendezzz26/newglass-backend);
> este frontend nunca se conecta directamente a PostgreSQL.
> Procedencia y trazabilidad: [docs/MIGRATION.md](docs/MIGRATION.md).


## Optimización comparativa FF/BF/WF

La vista principal de Optimización usa la API `comparison-v1`: tres pestañas de
motor y una de comparación, fases reales, solicitud original, elección manual y
confirmación del elegido. Las unidades de esta entrega siguen siendo mm/mm².
Consultar la [guía del contrato](https://github.com/melendezzz26/optimizador-vidrio/blob/137f2ccd7a542c73e99fd40a792287595cdcd9c8/docs/contracts/optimization/comparison-v1.md)
y la [evidencia de integración](https://github.com/melendezzz26/optimizador-vidrio/blob/137f2ccd7a542c73e99fd40a792287595cdcd9c8/docs/evidence/sprint-02/OPT-MULTIMOTOR-VISUAL/README.md).

Las máscaras y eventos son temporales; los resultados y medidas guardadas se
recuperan desde la API. Pausar la vista o cambiar pestaña no detiene el cálculo.
`first-fit-compatibility.html` es una entrada de pruebas para el recorrido FF
histórico, excluida del build productivo. Los E2E comparativos usan la entrada
principal y servicios reales, con PostgreSQL temporal.

## Build Staging (TA-DEPLOY-001 T05)

`npm run build` conserva el build local. Para el artefacto Pages, suministrar
`VITE_API_URL` externamente y ejecutar `npm run build:staging`, seguido de
`npm run check:staging`. El modo staging fija `/newglass-frontend/` y rechaza
API ausente, HTTP, localhost/loopback o URL con credenciales/query/fragmento.
No existe una URL productiva predeterminada. El build normal no debe publicarse
en Pages; el workflow de publicación debe usar exclusivamente el modo staging.

`VITE_*` es configuración pública incluida en JS, nunca un lugar para secretos.
`check:staging` comprueba base/archivos de assets y patrones prohibidos en el
bundle; es un control estático, no certifica conectividad ni detecta todo secreto
posible. Desarrollo mantiene el fallback local autorizado.

El editor se abre desde Nuevo pedido → Agregar pieza → Forma: Polígono convexo.
Permanece dentro de la SPA; no se publica `/editor-pieza` como ruta física.
Una recarga de la URL base reinicia la vista/formulario; no persiste borradores.
La carga/recarga en Pages real y su API/CORS se validan durante T07.

Interfaz web con React y Vite, organizada progresivamente por funcionalidades.
El entorno de pruebas HU-007 utiliza Node.js **24.21.0** y npm **11.19.0**.
Para las nuevas dependencias de pruebas, usar Node 22.22.2+, 24.15.0+ o 26+,
según los rangos de sus `engines`; Node 22.16.0 del entorno anterior ya no basta.
Los comandos se ejecutan desde la raíz del repositorio.

## Instalación

```bash
npm ci
```

`npm ci` instala las versiones registradas en `package-lock.json`. Conservar ese
archivo en Git; los cambios de dependencias corresponden a tareas específicas.
Si PowerShell bloquea `npm.ps1`, usar `npm.cmd` con los mismos argumentos.

## Desarrollo y validación

```bash
npm run dev
npm run lint
npm run build
```

- `dev`: inicia Vite; consultar la URL indicada por la terminal.
- `lint`: ejecuta ESLint sobre el proyecto.
- `build`: genera el sitio en `dist/`, directorio ya ignorado por Git.

Para revisar localmente el build:

```bash
npm run preview
```

## Pruebas y compatibilidad entre repositorios

El CI de este repositorio ejecuta `npm ci`, `npm run test:unit`,
`npm run test:component`, `npm run lint` y `npm run build`.
También ejecuta Playwright E2E contra **dos checkouts Git independientes**
(frontend y backend), con PostgreSQL temporal y Chromium administrado. La
revisión del backend está fijada al SHA completo de
[.github/backend-e2e.sha](.github/backend-e2e.sha): cada actualización de
backend requiere revisar compatibilidad y actualizar el SHA en un PR del frontend.

Para reproducir E2E localmente, clonar los repositorios como carpetas hermanas:

```text
newglass-workspace/
    frontend/    # git clone .../newglass-frontend.git frontend
    backend/     # git clone .../newglass-backend.git backend
```

Preparar las dependencias Python 3.11 de `backend/requirements.txt`, Node 22
compatible y PostgreSQL temporal según la configuración de pruebas del backend.
Playwright inicia `python -m tests.e2e_server` desde `../backend` y Vite en
`http://127.0.0.1:5173`. Requiere tener libres esos puertos. El backend de
pruebas utiliza PostgreSQL aislado y **no** debe apuntar a Supabase Staging.

```bash
npm ci
npm run test:unit
npm run test:component
npm run lint
npm run build
# En Linux/WSL con Chromium de Playwright disponible y backend hermano:
npx playwright install --with-deps chromium
PLAYWRIGHT_CHANNEL=chromium node scripts/run-e2e-phases.js
```

El orquestador E2E ejecuta las fases `b02` y `remaining` en procesos de prueba
separados para proteger el smoke de migración PostgreSQL y los escenarios
comerciales. El gate de E2E falla ante omisiones críticas y conserva reportes
en `test-results/e2e-phases/` y `playwright-report/e2e-phases/`.
No se deshabilitan esos controles para conseguir un resultado verde.

La [evidencia histórica HU-007](https://github.com/melendezzz26/optimizador-vidrio/blob/137f2ccd7a542c73e99fd40a792287595cdcd9c8/docs/evidence/sprint-01/HU-007/t01-t02-pruebas-frontend.md)
sigue disponible; el flujo actual de E2E es más amplio que esa entrega inicial.

## Organización por features

```text
src/
    features/
        authentication/
        users/
        inventory/
        orders/
        optimization/
        results/
        configuration/
    shared/
    pages/            Código actual conservado temporalmente
    assets/
```

La funcionalidad nueva se desarrolla en `src/features/<feature>/`.
El frontend no replica las capas Clean Architecture del backend: componentes,
hooks, estado y acceso a API se organizan dentro de cada feature según necesidad.
`src/shared/` se reserva para código reutilizable por varias features.

El inicio de sesión ya se migró a `src/features/authentication/` (HU-001).
`src/pages/NuevoPedido.jsx`, sus estilos y sus imports permanecen en la ruta
actual hasta que su responsable los migre con validación.

## Conexión con el backend

El frontend llama a la API en `http://127.0.0.1:8000`. Para usar otra dirección,
copiar `.env.example` como `.env.local` y ajustar `VITE_API_URL`. El backend
solo acepta peticiones desde `http://localhost:5173` y `http://127.0.0.1:5173`.

Consultar la [guía de desarrollo](../CONTRIBUTING.md), las
[convenciones de features](src/features/README.md) y los
[límites de shared](src/shared/README.md).
