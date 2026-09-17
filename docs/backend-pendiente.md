# Estado actualizado de integración

Revisadas las guías 07-mejoras-frontend y 06-aprendizaje-visual del backend el 16 de septiembre de 2026. Esta lista sustituye los pendientes anteriores: varias funciones ya existen en la API.

## Conectado en el front

Capacidades, reserva, subida PUT completa, confirmación, reproducción, procesamiento, informe editable, aprobación y fuentes temporales. Notas, aclaraciones y consulta de trabajo por ID. Se agrega consentimiento separado audio_consent al reservar y ws:true al proxy de desarrollo.

## Existe en backend; falta integrar en el front

1. Jobs por sesión y estados separados de análisis e indexación; detener polling en estados terminales y 401.
2. WebSocket agent/live e historial agent/messages: autenticación en primera trama, consentimiento, capturas reducidas, un turno pendiente y UUID estable. No hay voz bidireccional. La barra no establece esta conexión por sí sola.
3. Transcript: segmentos temporales y motivos de ausencia de transcripción.
4. Aclaraciones después del análisis, report/regenerate, report/history, fuentes textuales y conversión /procedure. Separar aprobación de publicación editorial.
5. Grafo /flow con fuentes y navegación al video.
6. SHA-256, upload-status, bloques pendientes y commit-blocks. La subida actual sigue usando PUT completo.
7. Búsqueda /recordings/search con fragmentos y fuentes; no presentar similitud como certeza.
8. Renovar reproducción conservando el segundo actual y distinguir errores de codec.

## Configuración y validación pendientes

Verificar Azure privado y CORS, proveedores y workers analyze_recording, index_recording y consolidate. La guía indica que las migraciones locales están aplicadas; no repetirlas sin verificar la base.

Probar con servicios reales: grabar con audio, pausar, guardar, cortar red, recuperar, reproducir, analizar, aclarar, regenerar, aprobar, convertir, publicar y buscar. Las pruebas locales no certifican Azure ni inferencia real.

## Experiencia de captura

Barra compacta automática al obtener el stream. Intento de ventana externa con alternativa dentro de la página si el navegador bloquea la apertura. Botón manual disponible. Al detener se cierra la barra y el guardado aparece sobre la vista previa. No se activa micrófono sin permiso ni se inicia grabación automáticamente.

Confirmaciones internas personalizadas; el aviso de cierre/recarga de pestaña lo controla el navegador. Tipografía existente incrementada en 1 px.
