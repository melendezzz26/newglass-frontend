# SPEC TA-045 — Separación de corte en resultados

Estado: en implementación. Propietario de interfaz: newglass-frontend; la geometría permanece en newglass-backend. La [SPEC histórica](https://github.com/melendezzz26/optimizador-vidrio/blob/integration-02/docs/specs/SPEC-TA-045-separacion-corte.md) define el contrato geométrico.

Mostrar en el resultado individual y la comparación el valor de `separacion_mm` de la configuración del trabajo, incluso si es cero. La configuración es común a los seis motores de una comparación. No desplazar piezas, alterar dimensiones ni dibujar un espacio no calculado. Si falta el valor, no inventarlo. Las vistas 2D y 3D existentes conservan la geometría recibida; la indicación textual se mantiene visible al cambiar de motor o vista. La separación raster es conservadora y no representa un kerf independiente.

Criterios: valor real en mm; cero y positivo; seis motores y comparación; resultado individual; dimensiones y posiciones intactas; pruebas y evidencia. La rama no modifica backend.
