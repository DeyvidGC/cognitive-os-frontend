# Inicio y panel de uso

Primera etapa del rediseño: páginas 2 y 8 de «Cognitive OS · Flujo de sesión».

Inicio prioriza sesiones revisables, errores, capturas y subidas; abre la sesión original. Muestra actividad y la pregunta abierta más frecuente. El panel incluye métricas, periodos de 7/14/30 días, filtro de temas respondidos y alternancia gráfico/tabla.

Enseñar un proceso abre el formulario existente con el objetivo precargado. No cierra automáticamente el vacío: crear una sesión no equivale a publicar conocimiento. Se mantienen los permisos de lectura y creación. Los datos de demostración solo viven en el servidor de fixtures.

## Límites del contrato actual

`Session.status` no incluye el estado editorial del procedimiento ni el número de aclaraciones. Una sesión completada se presenta como aprendizaje por revisar; no se afirma que esté lista para publicar. Para reproducir todas las tarjetas del PDF se necesita una acción pendiente canónica por sesión, su destino y el conteo de aclaraciones.

`/usage/summary` entrega temas con respuesta directa, sin desglose de preguntas sin respaldo por tema, comparación con el periodo anterior ni filtro por procedimiento. La interfaz etiqueta estas cifras como respuestas directas, mantiene los vacíos actuales separados del rango temporal y no inventa segmentos de barras, tendencias ni filtros de trimestre no contratados.

## Validación

Build de producción, ESLint y 33 pruebas existentes correctas. Comprobación en navegador con fixtures: inicio, panel, cambio de periodo, tabla, filtro por tema, objetivo precargado y ancho móvil de 390 px, sin errores de JavaScript ni desbordamiento horizontal.
