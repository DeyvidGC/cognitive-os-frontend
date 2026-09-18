# Cognitive OS · Frontend

Interfaz en español con React, TypeScript y Vite, integrada con Cognitive OS API.

## Desarrollo

```powershell
npm install
npm run dev
```

Abrir http://127.0.0.1:5173 e iniciar la API en http://127.0.0.1:8000. Vite reenvía `/api`, incluido WebSocket. Copiar `.env.example` a `.env.local` para cambiar `API_PROXY_TARGET` o el prefijo público `VITE_API_BASE_URL`. No colocar secretos en variables `VITE_`.

## Funciones

- Autenticación, organizaciones, permisos, sesiones, notas y evidencias.
- Pantalla compartida, micrófono opcional, grabación, pausa y barra flotante compacta. Guardado visible al terminar.
- Subida con progreso, cancelación, SHA-256, recuperación de bloques y reintentos. Tras recargar se debe seleccionar de nuevo el mismo archivo local.
- Reproducción con renovación de URL conservando el segundo actual y alternativa de descarga ante codecs incompatibles.
- Agente en vivo con consentimiento, texto, capturas puntuales, historial y estados de conexión. El audio grabado se analiza después; no hay conversación por voz en vivo.
- Seguimiento separado de análisis e indexación; transcripción, aclaraciones, regeneración, comparación de revisiones y edición con control de conflictos.
- Diagrama del proceso, fuentes y saltos al video; aprobación del informe y conversión a borrador editorial.
- Procedimientos, versiones, revisión, aprobación, publicación y búsqueda de fuentes.

## Dónde ver el diagrama

Abrir **Sesiones → una sesión con video analizado → Lo aprendido del video**. **Diagrama del proceso** se abre por defecto al inicio del informe. Seleccionar un paso muestra su resultado esperado y fuentes; sus marcas de tiempo abren ese momento del video. Incluye zoom y lista accesible.

El diagrama consume `/recordings/{id}/flow`. Aparece cuando la grabación está `ready`; grabar o subir un video no equivale a haber terminado el análisis. Los estados y errores del trabajo se muestran en la sesión. No se inventan nodos cuando la API no devuelve un informe.

## Organización

```text
src/
  app/                 # Navegación y composición de la aplicación
  features/
    auth/              # Acceso y registro
    sessions/          # Sesiones y seguimiento de trabajos
    capture/           # Pantalla, micrófono y ventana flotante
    agent/             # Conversación e historial del agente
    recordings/        # Subida, reproducción, informes y diagrama
    procedures/        # Versiones y circuito editorial
    knowledge/         # Búsqueda de fuentes de grabaciones
  shared/              # Cliente API, componentes y utilidades comunes
  styles/              # Estilos globales
  main.tsx             # Entrada
```

## Verificación

```powershell
npm run build
npm run lint
npm test
```

Las pruebas simulan dispositivos y transporte: autenticación, WebSocket sin token en URL, captura, liberación de pistas, exclusión de la pestaña propia, hash, subida por bloques y reintentos. No certifican Azure ni inferencia real.

Para revisión visual aislada:

```powershell
node scripts/fixture-server.mjs
```

En otra terminal:

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:8011'
npm run dev -- --port 5174
```

Abrir http://localhost:5174 con `prueba@example.com` / `Prueba-local-2026`. La sesión completada de ejemplo permite inspeccionar informe, diagrama, transcripción y conversión a borrador. Estos datos son ficticios y se pierden al detener la fixture. No implementa Azure, carga binaria ni inferencia WebSocket.

## Captura y despliegue

La barra aparece al compartir. Si el navegador bloquea la apertura externa automática, permanece dentro de la página y ofrece apertura manual. El cambio de tamaño PiP se solicita desde el clic del usuario y captura errores. Cerrar la barra no detiene la grabación.

Se solicita excluir la pestaña actual del selector de Chrome y se rechaza la captura propia identificable. El navegador no permite garantizar que una pantalla completa u otra ventana no contenga la aplicación. Los videos locales deben guardarse o descargarse antes de salir. Los avisos de cierre de pestaña pertenecen al navegador; las confirmaciones internas usan diálogos propios.

En producción servir `dist` y configurar un reverse proxy HTTP/WebSocket de `/api` hacia FastAPI. Las subidas directas a Azure necesitan su propio CORS. Las tipografías usan Google Fonts con alternativas locales.

[Estado de integración y pendientes del backend](docs/backend-pendiente.md).

## Actualización de experiencia · 18 de septiembre

El historial de videos se encuentra en Sesiones de aprendizaje. Cada tarjeta abre la sesión original; puedes agregar otra sesión desde el detalle. La importación de videos está al principio de la sesión y ofrece una vista previa. El micrófono está preseleccionado al compartir, siempre sujeto al permiso del navegador.

El BPMN se presenta horizontal con colores. Las reglas mantienen evidencia consultable sin minutos visibles y las excepciones se despliegan al final. Las aclaraciones permiten encuesta completa o una pregunta por vez, respuesta escrita o dictada, y lectura de la pregunta. El dictado depende del servicio de voz del navegador; la interrupción autónoma del agente aún requiere backend.

La API consultada sigue limitada a 600 segundos y un video por sesión. El frontend respeta ese límite; el contrato para 1800 segundos, historial agrupado y voz en tiempo real está detallado en [backend-pendiente.md](docs/backend-pendiente.md).
